const express = require('express');
const router = express.Router();
const db = require('../utils/db');

// Map contacto row → cotizador client format
function mapContacto(c) {
  const name = [c.nombre, c.apellido].filter(Boolean).join(' ') || c.razon_social || '';
  return {
    id: c.id,
    clientName: name,
    clientCUIT: c.cuit || c.dni || '',
    clientEmail: c.email || '',
    clientPhone: c.telefono || '',
    clientIVACondition: '',
    clientAddress: [c.domicilio, c.localidad, c.provincia].filter(Boolean).join(', '),
    createdAt: c.created_at || '',
  };
}

// List all clients (contactos with rol = lead/contacto/cliente)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM contactos ORDER BY nombre, apellido LIMIT 500`
    );
    res.json(rows.map(mapContacto));
  } catch (e) { next(e); }
});

// Search clients
router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const { rows } = await db.query(
      `SELECT * FROM contactos WHERE
        nombre ILIKE $1 OR apellido ILIKE $1 OR razon_social ILIKE $1
        OR cuit ILIKE $1 OR dni ILIKE $1 OR email ILIKE $1 OR telefono ILIKE $1
      ORDER BY nombre LIMIT 50`,
      [`%${q}%`]
    );
    res.json(rows.map(mapContacto));
  } catch (e) { next(e); }
});

// Get client by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM contactos WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Client not found' });
    res.json(mapContacto(rows[0]));
  } catch (e) { next(e); }
});

// Create client → insert into contactos
router.post('/', async (req, res, next) => {
  try {
    const { clientName, clientCUIT, clientEmail, clientPhone } = req.body;

    // Dedup check
    if (clientCUIT) {
      const existing = await db.query(
        'SELECT * FROM contactos WHERE cuit = $1 OR dni = $1 LIMIT 1', [clientCUIT.trim()]
      );
      if (existing.rows.length) {
        return res.status(200).json(mapContacto(existing.rows[0]));
      }
    }

    const isDocCUIT = (clientCUIT || '').replace(/\D/g, '').length === 11;
    const { rows } = await db.query(
      `INSERT INTO contactos (nombre, ${isDocCUIT ? 'cuit' : 'dni'}, email, telefono, rol_actual, estado, origen)
       VALUES ($1, $2, $3, $4, 'lead', 'nuevo', 'cotizador') RETURNING *`,
      [clientName || '', (clientCUIT || '').trim(), clientEmail || '', clientPhone || '']
    );
    res.status(201).json(mapContacto(rows[0]));
  } catch (e) { next(e); }
});

// Update client
router.put('/:id', async (req, res, next) => {
  try {
    const { clientName, clientCUIT, clientEmail, clientPhone } = req.body;
    const isDocCUIT = (clientCUIT || '').replace(/\D/g, '').length === 11;
    const { rows } = await db.query(
      `UPDATE contactos SET nombre = $1, ${isDocCUIT ? 'cuit' : 'dni'} = $2, email = $3, telefono = $4, updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [clientName || '', (clientCUIT || '').trim(), clientEmail || '', clientPhone || '', req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Client not found' });
    res.json(mapContacto(rows[0]));
  } catch (e) { next(e); }
});

// Delete — not supported
router.delete('/:id', (req, res) => {
  res.status(405).json({ error: 'Deletion not supported' });
});

module.exports = router;
