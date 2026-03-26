const express = require('express');
const router = express.Router();
const db = require('../utils/db');

const VALID_ESTADOS = ['contacto', 'contactado', 'lead', 'cliente', 'perdido'];

// GET /api/contactos — list with optional filters
router.get('/', async (req, res, next) => {
  try {
    const { provincia, localidad, estado, search, limit = 500, offset = 0 } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (provincia) {
      conditions.push(`provincia ILIKE $${idx++}`);
      params.push(provincia);
    }
    if (localidad) {
      conditions.push(`localidad ILIKE $${idx++}`);
      params.push(localidad);
    }
    if (estado) {
      conditions.push(`estado = $${idx++}`);
      params.push(estado);
    }
    if (search) {
      conditions.push(`(nombre ILIKE $${idx} OR telefono ILIKE $${idx} OR email ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query(`SELECT COUNT(*) FROM beta_contactos ${where}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await db.query(
      `SELECT * FROM beta_contactos ${where} ORDER BY id LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({ total, data: dataResult.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/contactos/stats — count per estado
router.get('/stats', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT estado, COUNT(*) AS count FROM beta_contactos GROUP BY estado ORDER BY estado`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/contactos/provincias — distinct provincias
router.get('/provincias', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT provincia FROM beta_contactos WHERE provincia IS NOT NULL ORDER BY provincia`
    );
    res.json(result.rows.map(r => r.provincia));
  } catch (err) {
    next(err);
  }
});

// GET /api/contactos/localidades — distinct localidades (optional filter by provincia)
router.get('/localidades', async (req, res, next) => {
  try {
    const { provincia } = req.query;
    let query = `SELECT DISTINCT localidad FROM beta_contactos WHERE localidad IS NOT NULL`;
    const params = [];
    if (provincia) {
      query += ` AND provincia ILIKE $1`;
      params.push(provincia);
    }
    query += ` ORDER BY localidad`;
    const result = await db.query(query, params);
    res.json(result.rows.map(r => r.localidad));
  } catch (err) {
    next(err);
  }
});

// GET /api/contactos/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM beta_contactos WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Contacto no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/contactos/:id — update fields
router.patch('/:id', async (req, res, next) => {
  try {
    const allowed = ['telefono', 'provincia', 'codigo_postal', 'localidad', 'domicilio',
                     'nombre', 'dni', 'email', 'latitud', 'longitud', 'estado'];
    const sets = [];
    const params = [];
    let idx = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'estado' && !VALID_ESTADOS.includes(req.body[key])) {
          return res.status(400).json({ error: `Estado inválido. Válidos: ${VALID_ESTADOS.join(', ')}` });
        }
        sets.push(`${key} = $${idx++}`);
        params.push(req.body[key]);
      }
    }

    if (!sets.length) return res.status(400).json({ error: 'No hay campos para actualizar' });

    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const { rows } = await db.query(
      `UPDATE beta_contactos SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Contacto no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
