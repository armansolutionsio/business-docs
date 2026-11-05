// Datos del panel IA de /infra: limites del plan de Claude (utils/claudeLimits.js) y el trabajo hecho
// en las sesiones de TaskPilot.

const db = require('./db');
const claudeLimits = require('./claudeLimits');

const SESSION_DAYS = 70;    // alcanza para el mes anterior completo
const TZ = 'America/Argentina/Buenos_Aires';

async function getOverview({ force = false } = {}) {
  const plan = await claudeLimits.getStatus({ force });
  const { rows: sessions } = await db.query(
    `SELECT (m.created_at AT TIME ZONE '${TZ}')::date::text AS date, m.session_id, s.model, s.issue_id, i.subject,
            MAX(m.created_at) AS last_at,
            SUM(COALESCE((m.metadata->>'tokens_in')::bigint, 0))::float AS tokens_in,
            SUM(COALESCE((m.metadata->>'tokens_out')::bigint, 0))::float AS tokens_out,
            SUM(COALESCE((m.metadata->>'duracion_ms')::bigint, 0))::float AS duracion_ms,
            SUM(COALESCE((m.metadata->>'turnos')::int, 0))::int AS turnos
       FROM taskpilot.messages m
       JOIN taskpilot.sessions s ON s.id = m.session_id
       LEFT JOIN taskpilot.issues i ON i.id = s.issue_id
      WHERE m.rol = 'result' AND m.created_at > NOW() - INTERVAL '${SESSION_DAYS} days'
      GROUP BY 1, m.session_id, s.model, s.issue_id, i.subject
      ORDER BY 1`);
  return { collectedAt: new Date().toISOString(), plan, sessions };
}

module.exports = { getOverview };
