const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { logAudit } = require('../utils/auditLog');

// GET /api/proveedores
router.get('/', async (req, res, next) => {
  try {
    const { search, tipo_proveedor, estado } = req.query;
    const conditions = []; const params = []; let idx = 1;
    if (tipo_proveedor) { conditions.push(`tipo_proveedor = $${idx++}`); params.push(tipo_proveedor); }
    if (estado) { conditions.push(`estado = $${idx++}`); params.push(estado); }
    if (search) {
      conditions.push(`(razon_social ILIKE $${idx} OR nombre_comercial ILIKE $${idx} OR cuit ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await db.query(`SELECT * FROM proveedores ${where} ORDER BY razon_social`, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/proveedores/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM proveedores WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/proveedores
router.post('/', async (req, res, next) => {
  try {
    const fields = ['razon_social','nombre_comercial','cuit','contacto_principal','telefono','email',
      'direccion','localidad','provincia','pais','web','tipo_proveedor','servicios_que_ofrece',
      'destinos_que_opera','medios_de_pago','condiciones_comerciales','plazos_de_pago',
      'ejecutivo_de_cuenta','estado','observaciones'];
    const cols = []; const vals = []; const ph = []; let idx = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { cols.push(f); vals.push(req.body[f]); ph.push(`$${idx++}`); }
    }
    if (!cols.length) return res.status(400).json({ error: 'No hay datos' });
    const { rows } = await db.query(`INSERT INTO proveedores (${cols.join(',')}) VALUES (${ph.join(',')}) RETURNING *`, vals);
    await logAudit({ tabla: 'proveedores', registro_id: rows[0].id, accion: 'INSERT', usuario: req.body._user });
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/proveedores/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const allowed = ['razon_social','nombre_comercial','cuit','contacto_principal','telefono','email',
      'direccion','localidad','provincia','pais','web','tipo_proveedor','servicios_que_ofrece',
      'destinos_que_opera','medios_de_pago','condiciones_comerciales','plazos_de_pago',
      'ejecutivo_de_cuenta','estado','observaciones'];
    const sets = []; const params = []; let idx = 1;
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k} = $${idx++}`); params.push(req.body[k]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    sets.push('updated_at = NOW()');
    params.push(req.params.id);
    const { rows } = await db.query(`UPDATE proveedores SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    if (!rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/proveedores/:id/productos
router.get('/:id/productos', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM productos_proveedor WHERE proveedor_id = $1 ORDER BY id', [req.params.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/proveedores/:id/productos
router.post('/:id/productos', async (req, res, next) => {
  try {
    const { categoria, descripcion, destino, tarifa_base, moneda, vigencia, comision, politica_cancelacion, forma_confirmacion, notas } = req.body;
    if (!descripcion) return res.status(400).json({ error: 'Descripcion requerida' });
    const { rows } = await db.query(
      `INSERT INTO productos_proveedor (proveedor_id, categoria, descripcion, destino, tarifa_base, moneda, vigencia, comision, politica_cancelacion, forma_confirmacion, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.params.id, categoria, descripcion, destino, tarifa_base, moneda || 'USD', vigencia, comision, politica_cancelacion, forma_confirmacion, notas]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
