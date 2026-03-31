const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../../utils/db');

router.get('/', async (req, res, next) => {
  try {
    const cid = req.params.contactoId;
    const { rows } = await db.query(`
      SELECT 'nota' AS tipo, id, created_at, contenido AS resumen, created_by FROM notas WHERE contacto_id = $1
      UNION ALL
      SELECT 'tarea' AS tipo, id, created_at, titulo AS resumen, created_by FROM tareas WHERE contacto_id = $1
      UNION ALL
      SELECT 'oportunidad' AS tipo, id, created_at, titulo AS resumen, NULL FROM oportunidades WHERE contacto_id = $1
      UNION ALL
      SELECT 'conversacion' AS tipo, id, created_at, contenido AS resumen, usuario_responsable FROM conversaciones WHERE contacto_id = $1
      UNION ALL
      SELECT 'cotizacion' AS tipo, id, created_at, 'Cotización #' || numero AS resumen, created_by FROM cotizaciones WHERE contacto_id = $1
      UNION ALL
      SELECT 'venta' AS tipo, id, created_at, 'Venta #' || numero AS resumen, created_by FROM ventas WHERE contacto_id = $1
      UNION ALL
      SELECT 'factura' AS tipo, id, created_at, 'Factura #' || numero AS resumen, created_by FROM facturas WHERE contacto_id = $1
      UNION ALL
      SELECT 'pago' AS tipo, id, created_at, 'Pago $' || monto AS resumen, created_by FROM pagos WHERE contacto_id = $1
      UNION ALL
      SELECT 'campania_mail' AS tipo, id, enviado_at AS created_at, 'Mail: ' || asunto AS resumen, enviado_por AS created_by FROM campania_mail WHERE contacto_id = $1
      UNION ALL
      SELECT 'audit' AS tipo, id, created_at, accion || ' en ' || tabla AS resumen, usuario AS created_by FROM audit_log WHERE tabla = 'contactos' AND registro_id = $2
      ORDER BY created_at DESC
      LIMIT 200
    `, [cid, cid]);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
