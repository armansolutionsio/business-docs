const express = require('express');
const router = express.Router();
const db = require('../utils/db');

// ── GET /api/dashboard — CEO KPIs & metrics ──────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    // All queries in parallel for speed
    const [
      statsRes,
      conversionRes,
      revenueRes,
      revenueMensualRes,
      vendedorRes,
      campaniasRes,
      tareasVencidasRes,
      leadsHoyRes,
      leadsSemanaRes,
      leadsMesRes,
      origenRes,
      recentLeadsRes,
      tareasProximasRes,
      oportunidadesRes,
      tiempoPromedioRes,
    ] = await Promise.all([
      // 1. Contacts by estado
      db.query(`SELECT estado, COUNT(*)::int AS count FROM contactos GROUP BY estado ORDER BY count DESC`),

      // 2. Conversion funnel
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE estado IN ('nuevo','contactado','calificado','cotizado','negociacion','ganado','perdido','dormido','cliente_recurrente'))::int AS total,
          COUNT(*) FILTER (WHERE estado = 'contactado')::int AS contactados,
          COUNT(*) FILTER (WHERE estado = 'calificado')::int AS calificados,
          COUNT(*) FILTER (WHERE estado = 'cotizado')::int AS cotizados,
          COUNT(*) FILTER (WHERE estado = 'negociacion')::int AS negociacion,
          COUNT(*) FILTER (WHERE estado IN ('ganado','cliente_recurrente'))::int AS ganados,
          COUNT(*) FILTER (WHERE estado = 'perdido')::int AS perdidos
        FROM contactos
      `),

      // 3. Revenue total (from ventas completadas)
      db.query(`
        SELECT
          COALESCE(SUM(total), 0)::numeric AS revenue_total,
          COUNT(*)::int AS ventas_count
        FROM ventas WHERE estado IN ('confirmada','completada')
      `),

      // 4. Revenue mensual (last 6 months)
      db.query(`
        SELECT
          TO_CHAR(fecha, 'YYYY-MM') AS mes,
          COALESCE(SUM(total), 0)::numeric AS revenue,
          COUNT(*)::int AS cantidad
        FROM ventas
        WHERE fecha >= NOW() - INTERVAL '6 months' AND estado IN ('confirmada','completada')
        GROUP BY mes ORDER BY mes
      `),

      // 5. Performance by vendedor
      db.query(`
        SELECT
          COALESCE(vendedor_asignado, 'Sin asignar') AS vendedor,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE estado IN ('ganado','cliente_recurrente'))::int AS ganados,
          COUNT(*) FILTER (WHERE estado = 'perdido')::int AS perdidos,
          COALESCE(SUM(ticket_estimado) FILTER (WHERE estado IN ('ganado','cliente_recurrente')), 0)::numeric AS revenue
        FROM contactos
        GROUP BY vendedor_asignado ORDER BY ganados DESC
      `),

      // 6. Campaign stats
      db.query(`
        SELECT estado, COUNT(*)::int AS count
        FROM campania_mail GROUP BY estado
      `),

      // 7. Overdue tasks
      db.query(`
        SELECT COUNT(*)::int AS count
        FROM tareas
        WHERE estado != 'completada' AND fecha_vencimiento < CURRENT_DATE
      `),

      // 8. Leads today
      db.query(`SELECT COUNT(*)::int AS count FROM contactos WHERE created_at::date = CURRENT_DATE`),

      // 9. Leads this week
      db.query(`SELECT COUNT(*)::int AS count FROM contactos WHERE created_at >= NOW() - INTERVAL '7 days'`),

      // 10. Leads this month
      db.query(`SELECT COUNT(*)::int AS count FROM contactos WHERE created_at >= NOW() - INTERVAL '30 days'`),

      // 11. Leads by origin
      db.query(`
        SELECT COALESCE(origen, 'Desconocido') AS origen, COUNT(*)::int AS count
        FROM contactos GROUP BY origen ORDER BY count DESC LIMIT 10
      `),

      // 12. Recent leads (last 10)
      db.query(`
        SELECT id, codigo, nombre, apellido, telefono, email, estado, origen, vendedor_asignado, created_at
        FROM contactos ORDER BY created_at DESC LIMIT 10
      `),

      // 13. Upcoming tasks
      db.query(`
        SELECT t.id, t.titulo, t.fecha_vencimiento, t.prioridad, t.estado, t.asignado_a,
               c.nombre AS contacto_nombre, c.apellido AS contacto_apellido, t.contacto_id
        FROM tareas t JOIN contactos c ON t.contacto_id = c.id
        WHERE t.estado != 'completada'
        ORDER BY t.fecha_vencimiento ASC NULLS LAST LIMIT 10
      `),

      // 14. Open opportunities
      db.query(`
        SELECT o.id, o.titulo, o.destino, o.presupuesto_estimado, o.probabilidad_cierre,
               o.estado_oportunidad, c.nombre AS contacto_nombre, c.apellido AS contacto_apellido, o.contacto_id
        FROM oportunidades o JOIN contactos c ON o.contacto_id = c.id
        WHERE o.estado_oportunidad NOT IN ('ganada','perdida')
        ORDER BY o.presupuesto_estimado DESC NULLS LAST LIMIT 10
      `),

      // 15. Average time in pipeline stages (days)
      db.query(`
        SELECT estado, AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400)::int AS dias_promedio, COUNT(*)::int AS count
        FROM contactos
        WHERE estado NOT IN ('ganado','perdido','cliente_recurrente')
        GROUP BY estado
      `),
    ]);

    const funnel = conversionRes.rows[0] || {};
    const revenue = revenueRes.rows[0] || {};

    res.json({
      kpis: {
        leads_hoy: leadsHoyRes.rows[0]?.count || 0,
        leads_semana: leadsSemanaRes.rows[0]?.count || 0,
        leads_mes: leadsMesRes.rows[0]?.count || 0,
        revenue_total: parseFloat(revenue.revenue_total) || 0,
        ventas_count: revenue.ventas_count || 0,
        tareas_vencidas: tareasVencidasRes.rows[0]?.count || 0,
        tasa_conversion: funnel.total > 0
          ? ((funnel.ganados / funnel.total) * 100).toFixed(1)
          : 0,
      },
      stats_por_estado: statsRes.rows,
      funnel,
      revenue_mensual: revenueMensualRes.rows,
      vendedores: vendedorRes.rows,
      campanias_stats: campaniasRes.rows,
      leads_por_origen: origenRes.rows,
      recent_leads: recentLeadsRes.rows,
      tareas_proximas: tareasProximasRes.rows,
      oportunidades_abiertas: oportunidadesRes.rows,
      tiempo_promedio_etapa: tiempoPromedioRes.rows,
    });
  } catch (err) { next(err); }
});

module.exports = router;
