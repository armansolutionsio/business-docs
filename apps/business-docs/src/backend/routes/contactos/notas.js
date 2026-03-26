const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../../utils/db');
const { logAudit } = require('../../utils/auditLog');

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM notas WHERE contacto_id = $1 ORDER BY created_at DESC', [req.params.contactoId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { contenido, created_by } = req.body;
    if (!contenido) return res.status(400).json({ error: 'Contenido requerido' });
    const { rows } = await db.query(
      'INSERT INTO notas (contacto_id, contenido, created_by) VALUES ($1, $2, $3) RETURNING *',
      [req.params.contactoId, contenido, created_by]
    );
    await logAudit({ tabla: 'notas', registro_id: rows[0].id, accion: 'INSERT', usuario: created_by });
    await db.query('UPDATE contactos SET fecha_ultima_interaccion = NOW() WHERE id = $1', [req.params.contactoId]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
