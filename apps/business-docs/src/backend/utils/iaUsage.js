// Datos del panel IA de /infra: limites del plan de Claude por cuenta (los reporta cada runner),
// su historial y el trabajo hecho en las sesiones de TaskPilot.

const db = require('./db');

const ONLINE_MS = 90 * 1000;
const RETENTION_DAYS = 180;
const SAMPLE_DAYS = 56;     // ocho semanas de lecturas para las semanas anteriores
const SESSION_DAYS = 70;    // alcanza para el mes anterior completo
const TZ = 'America/Argentina/Buenos_Aires';

const num = (v) => { const n = Number(v); return v != null && Number.isFinite(n) ? n : null; };

async function recordSample(runnerId, ts, info) {
  const w = info.unifiedWindows || {};
  const five = num(w.five_hour?.utilization), week = num(w.seven_day?.utilization);
  if (five == null && week == null) return;
  const models = Array.isArray(info.models) ? info.models : null;
  await db.query(
    `INSERT INTO taskpilot.limit_samples (runner_id, ts, five_hour, five_hour_resets, seven_day, seven_day_resets, models)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) ON CONFLICT DO NOTHING`,
    [runnerId, ts, five, num(w.five_hour?.resetsAt), week, num(w.seven_day?.resetsAt), models ? JSON.stringify(models) : null]);
  await db.query(`DELETE FROM taskpilot.limit_samples WHERE runner_id = $1 AND ts < NOW() - INTERVAL '${RETENTION_DAYS} days'`, [runnerId]);
}

async function getOverview() {
  const { rows: runners } = await db.query(
    `SELECT id, nombre, last_seen_at, limits, limits_at, account FROM taskpilot.runners WHERE activo ORDER BY id`);
  const { rows: samples } = await db.query(
    `SELECT runner_id, ts, seven_day, seven_day_resets
       FROM taskpilot.limit_samples WHERE ts > NOW() - INTERVAL '${SAMPLE_DAYS} days' ORDER BY ts`);
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
  return { collectedAt: new Date().toISOString(), accounts: groupByAccount(runners, samples), sessions };
}

// Los limites son de la cuenta de Claude, no de la PC: varios runners con la misma cuenta son un solo
// bloque. Un runner que todavia no informo su cuenta queda aparte.
function groupByAccount(runners, samples) {
  const accounts = new Map();
  const chronological = [...runners].sort((a, b) => new Date(a.limits_at || 0) - new Date(b.limits_at || 0));
  for (const r of chronological) {
    const email = r.account?.email || null;
    const id = email || `runner-${r.id}`;
    const a = accounts.get(id) || { id, email, plan: null, limits: null, limitsAt: null, runners: [], samples: [] };
    a.plan = r.account?.subscriptionType || a.plan;
    if (r.limits) { a.limits = { ...a.limits, ...r.limits }; a.limitsAt = r.limits_at; }
    a.runners.push({
      id: r.id,
      online: Boolean(r.last_seen_at && Date.now() - new Date(r.last_seen_at).getTime() < ONLINE_MS),
    });
    a.samples.push(...samples.filter((s) => s.runner_id === r.id).map((s) => ({
      week: s.seven_day, weekResets: s.seven_day_resets == null ? null : Number(s.seven_day_resets),
    })));
    accounts.set(id, a);
  }
  for (const a of accounts.values()) a.runners.sort((x, y) => x.id - y.id);
  return [...accounts.values()];
}

module.exports = { recordSample, getOverview };
