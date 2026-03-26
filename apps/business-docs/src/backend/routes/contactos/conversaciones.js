const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../../utils/db');
const { logAudit } = require('../../utils/auditLog');

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM conversaciones WHERE contacto_id = $1 ORDER BY created_at DESC', [req.params.contactoId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { canal, tipo, contenido, usuario_responsable, estado_conversacion } = req.body;
    if (!contenido) return res.status(400).json({ error: 'Contenido requerido' });
    const { rows } = await db.query(
      `INSERT INTO conversaciones (contacto_id, canal, tipo, contenido, usuario_responsable, estado_conversacion)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.contactoId, canal || 'whatsapp', tipo || 'entrante', contenido, usuario_responsable || null, estado_conversacion || 'abierta']
    );
    await logAudit({ tabla: 'conversaciones', registro_id: rows[0].id, accion: 'INSERT', usuario: usuario_responsable });
    await db.query('UPDATE contactos SET fecha_ultima_interaccion = NOW() WHERE id = $1', [req.params.contactoId]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
