const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../../utils/db');
const { logAudit } = require('../../utils/auditLog');

// List campaigns for a contact
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM campania_mail WHERE contacto_id = $1 ORDER BY enviado_at DESC',
      [req.params.contactoId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Update campaign status (e.g. mark as respondido)
router.patch('/:campId', async (req, res, next) => {
  try {
    const { estado, respuesta, notas } = req.body;
    const sets = [];
    const vals = [];
    let idx = 1;

    if (estado) { sets.push(`estado = $${idx++}`); vals.push(estado); }
    if (respuesta) {
      sets.push(`respuesta = $${idx++}`); vals.push(respuesta);
      sets.push(`respondido_at = NOW()`);
    }
    if (notas !== undefined) { sets.push(`notas = $${idx++}`); vals.push(notas); }

    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });

    vals.push(req.params.campId);
    const { rows } = await db.query(
      `UPDATE campania_mail SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'Campaña no encontrada' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
