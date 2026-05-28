// Identidad global de cliente cross-vertical.
// Tabla: admin_core.customers_global. Cada contacto local (tech/travel/paybridge)
// puede apuntar acá via columna global_customer_id.

const express = require('express');
const db = require('../utils/db');
const { requireAuth } = require('../utils/auth');

const router = express.Router();
router.use(requireAuth);

const SCHEMA_BY_VERTICAL = {
  travel: 'public',
  tech: 'tech',
  paybridge: 'paybridge',
};

// GET /api/admin/customers/global?q=...
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').toString().trim();
    let sql = `SELECT * FROM admin_core.customers_global`;
    const params = [];
    if (q) {
      sql += ` WHERE nombre ILIKE $1 OR razon_social ILIKE $1 OR email ILIKE $1 OR cuit ILIKE $1`;
      params.push(`%${q}%`);
    }
    sql += ` ORDER BY updated_at DESC LIMIT 200`;
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// POST /api/admin/customers/global { nombre, razon_social, cuit, email, telefono, pais }
router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.nombre) return res.status(400).json({ error: 'nombre es requerido' });
    const { rows } = await db.query(
      `INSERT INTO admin_core.customers_global
         (nombre, razon_social, cuit, email, telefono, pais, verticales, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)
       RETURNING *`,
      [
        b.nombre,
        b.razon_social || null,
        b.cuit || null,
        b.email || null,
        b.telefono || null,
        b.pais || null,
        JSON.stringify(b.verticales || []),
        JSON.stringify(b.metadata || {}),
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// GET /api/admin/customers/global/:id (con sus links a contactos locales)
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM admin_core.customers_global WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });

    const links = {};
    for (const [vertical, schema] of Object.entries(SCHEMA_BY_VERTICAL)) {
      const r = await db.query(
        `SELECT id, nombre, email, cuit FROM ${schema}.contactos WHERE global_customer_id = $1`,
        [req.params.id]
      );
      links[vertical] = r.rows;
    }
    res.json({ ...rows[0], links });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/admin/customers/global/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const allowed = ['nombre', 'razon_social', 'cuit', 'email', 'telefono', 'pais'];
    const sets = [];
    const params = [];
    for (const k of allowed) {
      if (b[k] !== undefined) {
        params.push(b[k]);
        sets.push(`${k} = $${params.length}`);
      }
    }
    if (b.metadata !== undefined) {
      params.push(JSON.stringify(b.metadata));
      sets.push(`metadata = $${params.length}::jsonb`);
    }
    if (b.verticales !== undefined) {
      params.push(JSON.stringify(b.verticales));
      sets.push(`verticales = $${params.length}::jsonb`);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada para actualizar' });
    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE admin_core.customers_global SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// POST /api/admin/customers/global/:id/link { vertical, contacto_id }
// Vincula un contacto local a la identidad global.
router.post('/:id/link', async (req, res, next) => {
  try {
    const { vertical, contacto_id } = req.body || {};
    const schema = SCHEMA_BY_VERTICAL[vertical];
    if (!schema) return res.status(400).json({ error: 'vertical invalida' });
    if (!contacto_id) return res.status(400).json({ error: 'contacto_id requerido' });

    const { rowCount } = await db.query(
      `UPDATE ${schema}.contactos SET global_customer_id = $1 WHERE id = $2`,
      [req.params.id, contacto_id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Contacto no encontrado' });

    // Marcar la vertical como activa en el global
    await db.query(
      `UPDATE admin_core.customers_global
         SET verticales = (
           SELECT jsonb_agg(DISTINCT v) FROM (
             SELECT jsonb_array_elements_text(verticales) AS v
             UNION SELECT $1
           ) t
         ),
         updated_at = NOW()
       WHERE id = $2`,
      [vertical, req.params.id]
    );

    res.json({ ok: true, vertical, contacto_id });
  } catch (e) {
    next(e);
  }
});

// POST /api/admin/customers/global/:id/unlink { vertical, contacto_id }
router.post('/:id/unlink', async (req, res, next) => {
  try {
    const { vertical, contacto_id } = req.body || {};
    const schema = SCHEMA_BY_VERTICAL[vertical];
    if (!schema) return res.status(400).json({ error: 'vertical invalida' });
    await db.query(
      `UPDATE ${schema}.contactos SET global_customer_id = NULL
         WHERE id = $1 AND global_customer_id = $2`,
      [contacto_id, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
