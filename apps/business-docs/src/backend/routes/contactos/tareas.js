const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../../utils/db');
const { logAudit } = require('../../utils/auditLog');

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM tareas WHERE contacto_id = $1 ORDER BY CASE WHEN estado = \'completada\' THEN 1 ELSE 0 END, fecha_vencimiento ASC NULLS LAST',
      [req.params.contactoId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { titulo, descripcion, fecha_vencimiento, prioridad, asignado_a, created_by } = req.body;
    if (!titulo) return res.status(400).json({ error: 'Titulo requerido' });
    const { rows } = await db.query(
      `INSERT INTO tareas (contacto_id, titulo, descripcion, fecha_vencimiento, prioridad, asignado_a, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.contactoId, titulo, descripcion || null, fecha_vencimiento || null, prioridad || 'media', asignado_a || null, created_by]
    );
    await logAudit({ tabla: 'tareas', registro_id: rows[0].id, accion: 'INSERT', usuario: created_by });
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:tareaId', async (req, res, next) => {
  try {
    const allowed = ['titulo','descripcion','fecha_vencimiento','prioridad','estado','asignado_a'];
    const sets = []; const params = []; let idx = 1;
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k} = $${idx++}`); params.push(req.body[k]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    sets.push('updated_at = NOW()');
    params.push(req.params.tareaId, req.params.contactoId);
    const { rows } = await db.query(
      `UPDATE tareas SET ${sets.join(', ')} WHERE id = $${idx++} AND contacto_id = $${idx} RETURNING *`, params
    );
    if (!rows.length) return res.status(404).json({ error: 'Tarea no encontrada' });
    await logAudit({ tabla: 'tareas', registro_id: rows[0].id, accion: 'UPDATE', usuario: req.body._user });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
