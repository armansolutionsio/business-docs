const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../../utils/db');
const { logAudit } = require('../../utils/auditLog');

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM oportunidades WHERE contacto_id = $1 ORDER BY created_at DESC', [req.params.contactoId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { titulo, destino, producto, cantidad_pasajeros, fecha_salida, fecha_regreso,
            presupuesto_estimado, probabilidad_cierre, vendedor, origen, created_by } = req.body;
    if (!titulo) return res.status(400).json({ error: 'Titulo requerido' });
    const { rows } = await db.query(
      `INSERT INTO oportunidades (contacto_id, titulo, destino, producto, cantidad_pasajeros,
        fecha_salida, fecha_regreso, presupuesto_estimado, probabilidad_cierre, vendedor, origen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.params.contactoId, titulo, destino, producto, cantidad_pasajeros || 1,
       fecha_salida || null, fecha_regreso || null, presupuesto_estimado || null,
       probabilidad_cierre || 0, vendedor || null, origen || null]
    );
    await logAudit({ tabla: 'oportunidades', registro_id: rows[0].id, accion: 'INSERT', usuario: created_by });
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:oppId', async (req, res, next) => {
  try {
    const allowed = ['titulo','destino','producto','cantidad_pasajeros','fecha_salida','fecha_regreso',
      'presupuesto_estimado','probabilidad_cierre','estado_oportunidad','vendedor','motivo_perdida','fecha_cierre'];
    const sets = []; const params = []; let idx = 1;
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k} = $${idx++}`); params.push(req.body[k]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    sets.push('updated_at = NOW()');
    params.push(req.params.oppId, req.params.contactoId);
    const { rows } = await db.query(
      `UPDATE oportunidades SET ${sets.join(', ')} WHERE id = $${idx++} AND contacto_id = $${idx} RETURNING *`, params
    );
    if (!rows.length) return res.status(404).json({ error: 'Oportunidad no encontrada' });
    await logAudit({ tabla: 'oportunidades', registro_id: rows[0].id, accion: 'UPDATE', usuario: req.body._user });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
