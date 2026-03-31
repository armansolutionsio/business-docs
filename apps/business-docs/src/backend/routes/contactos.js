const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { logAudit } = require('../utils/auditLog');

const VALID_ESTADOS = ['nuevo', 'contactado', 'calificado', 'cotizado', 'negociacion', 'ganado', 'perdido', 'dormido', 'cliente_recurrente'];
const VALID_ROLES = ['lead', 'contacto', 'cliente', 'pasajero', 'proveedor'];

// GET /api/contactos — list with filters
router.get('/', async (req, res, next) => {
  try {
    const { provincia, localidad, estado, rol_actual, search, vendedor_asignado, origen, limit = 500, offset = 0 } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (provincia) { conditions.push(`provincia ILIKE $${idx++}`); params.push(provincia); }
    if (localidad) { conditions.push(`localidad ILIKE $${idx++}`); params.push(localidad); }
    if (estado) { conditions.push(`estado = $${idx++}`); params.push(estado); }
    if (rol_actual) { conditions.push(`rol_actual = $${idx++}`); params.push(rol_actual); }
    if (vendedor_asignado) { conditions.push(`vendedor_asignado = $${idx++}`); params.push(vendedor_asignado); }
    if (origen) { conditions.push(`origen ILIKE $${idx++}`); params.push(origen); }
    if (search) {
      conditions.push(`(nombre ILIKE $${idx} OR apellido ILIKE $${idx} OR razon_social ILIKE $${idx} OR telefono ILIKE $${idx} OR email ILIKE $${idx} OR dni ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await db.query(`SELECT COUNT(*) FROM contactos ${where}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await db.query(
      `SELECT * FROM contactos ${where} ORDER BY id LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    res.json({ total, data: dataResult.rows });
  } catch (err) { next(err); }
});

// GET /api/contactos/stats
router.get('/stats', async (req, res, next) => {
  try {
    const result = await db.query(`SELECT estado, COUNT(*) AS count FROM contactos GROUP BY estado ORDER BY estado`);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/contactos/provincias
router.get('/provincias', async (req, res, next) => {
  try {
    const result = await db.query(`SELECT DISTINCT provincia FROM contactos WHERE provincia IS NOT NULL ORDER BY provincia`);
    res.json(result.rows.map(r => r.provincia));
  } catch (err) { next(err); }
});

// GET /api/contactos/localidades
router.get('/localidades', async (req, res, next) => {
  try {
    const { provincia } = req.query;
    let query = `SELECT DISTINCT localidad FROM contactos WHERE localidad IS NOT NULL`;
    const params = [];
    if (provincia) { query += ` AND provincia ILIKE $1`; params.push(provincia); }
    query += ` ORDER BY localidad`;
    const result = await db.query(query, params);
    res.json(result.rows.map(r => r.localidad));
  } catch (err) { next(err); }
});

// GET /api/contactos/dedup-check — find potential duplicates
router.get('/dedup-check', async (req, res, next) => {
  try {
    const { telefono, email, dni } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;
    if (telefono) { conditions.push(`telefono = $${idx++}`); params.push(telefono); }
    if (email) { conditions.push(`email ILIKE $${idx++}`); params.push(email); }
    if (dni) { conditions.push(`dni = $${idx++}`); params.push(dni); }
    if (!conditions.length) return res.json([]);

    const result = await db.query(
      `SELECT id, nombre, apellido, telefono, email, dni, estado, rol_actual FROM contactos WHERE ${conditions.join(' OR ')} LIMIT 10`,
      params
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/contactos/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM contactos WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Contacto no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/contactos — create
router.post('/', async (req, res, next) => {
  try {
    const fields = ['tipo_registro','rol_actual','estado','nombre','apellido','razon_social','dni','cuit',
      'telefono','telefono_secundario','email','email_secundario','domicilio','localidad','provincia',
      'codigo_postal','pais','latitud','longitud','origen','vendedor_asignado','canal_preferido',
      'consentimiento_marketing','consentimiento_whatsapp','consentimiento_email',
      'fecha_nacimiento','nacionalidad','sexo','observaciones',
      'destino_interes','tipo_viaje','fecha_viaje_estimada','cantidad_pasajeros','presupuesto',
      'prioridad','probabilidad_cierre','ticket_estimado',
      'proxima_accion','fecha_proxima_accion','motivo_perdida','etiquetas'];
    const cols = []; const vals = []; const placeholders = [];
    let idx = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        cols.push(f); vals.push(req.body[f]); placeholders.push(`$${idx++}`);
      }
    }
    if (!cols.length) return res.status(400).json({ error: 'No hay datos' });

    const { rows } = await db.query(
      `INSERT INTO contactos (${cols.join(',')}) VALUES (${placeholders.join(',')}) RETURNING *`, vals
    );
    await logAudit({ tabla: 'contactos', registro_id: rows[0].id, accion: 'INSERT', usuario: req.body._user });
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/contactos/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const allowed = ['tipo_registro','rol_actual','estado','nombre','apellido','razon_social','dni','cuit',
      'telefono','telefono_secundario','email','email_secundario','domicilio','localidad','provincia',
      'codigo_postal','pais','latitud','longitud','origen','vendedor_asignado','canal_preferido',
      'consentimiento_marketing','consentimiento_whatsapp','consentimiento_email',
      'fecha_nacimiento','nacionalidad','sexo','observaciones',
      'destino_interes','tipo_viaje','fecha_viaje_estimada','cantidad_pasajeros','presupuesto',
      'prioridad','probabilidad_cierre','ticket_estimado',
      'proxima_accion','fecha_proxima_accion','motivo_perdida','etiquetas'];
    const sets = []; const params = [];
    let idx = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'estado' && !VALID_ESTADOS.includes(req.body[key]))
          return res.status(400).json({ error: `Estado invalido. Validos: ${VALID_ESTADOS.join(', ')}` });
        if (key === 'rol_actual' && !VALID_ROLES.includes(req.body[key]))
          return res.status(400).json({ error: `Rol invalido. Validos: ${VALID_ROLES.join(', ')}` });
        sets.push(`${key} = $${idx++}`); params.push(req.body[key]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'No hay campos para actualizar' });

    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const { rows } = await db.query(
      `UPDATE contactos SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params
    );
    if (!rows.length) return res.status(404).json({ error: 'Contacto no encontrado' });
    await logAudit({ tabla: 'contactos', registro_id: rows[0].id, accion: 'UPDATE', usuario: req.body._user });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
