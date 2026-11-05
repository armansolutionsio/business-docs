// Limites del plan de Claude leidos desde este servidor, sin depender de ninguna PC.
//
// Requiere CLAUDE_CODE_OAUTH_TOKEN (se genera con `claude setup-token`). Claude no tiene una API de
// limites para ese token: los informa en la respuesta de un turno, asi que cada lectura hace un turno
// minimo con Haiku (~400 tokens del plan). Por eso se lee solo cuando se mira el panel y como mucho una
// vez cada MAX_AGE_MS, salvo que se pida actualizar.

const db = require('./db');
const log = require('./logger');

const MAX_AGE_MS = 30 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;      // entre intentos, aunque se pida actualizar o haya fallado
const READ_TIMEOUT_MS = 90 * 1000;
const RETENTION_DAYS = 180;
const SAMPLE_DAYS = 56;            // ocho semanas, para las semanas anteriores

const tokenOf = () => (process.env.CLAUDE_CODE_OAUTH_TOKEN || '').trim();
const isConfigured = () => Boolean(tokenOf());

let inflight = null, lastAttempt = 0, lastError = null;

// Al subproceso solo le pasan el token y lo que necesita para correr, no los secretos del servidor.
function claudeEnv() {
  const env = { CLAUDE_CODE_OAUTH_TOKEN: tokenOf() };
  for (const k of ['PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SystemRoot', 'TEMP', 'TMP', 'LANG']) {
    if (process.env[k]) env[k] = process.env[k];
  }
  return env;
}

async function readFromClaude() {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), READ_TIMEOUT_MS);
  let info = null;
  try {
    const q = query({
      prompt: 'OK',
      options: { systemPrompt: 'Respondé OK.', tools: [], settingSources: [], maxTurns: 1, model: 'claude-haiku-5-5', persistSession: false, env: claudeEnv(), abortController },
    });
    for await (const msg of q) {
      if (msg.type === 'rate_limit_event') info = msg.rate_limit_info || info;
    }
  } catch (e) {
    if (!info) throw e; // con el limite agotado el turno falla, pero el evento ya informo los porcentajes
  } finally {
    clearTimeout(timer);
  }
  if (!info?.unifiedWindows) throw new Error('Claude no informó los límites');
  return info;
}

const num = (v) => { const n = Number(v); return v != null && Number.isFinite(n) ? n : null; };

async function save(info) {
  const w = info.unifiedWindows;
  await db.query(
    `INSERT INTO taskpilot.plan_limits (ts, five_hour, five_hour_resets, seven_day, seven_day_resets, info)
     VALUES (NOW(), $1, $2, $3, $4, $5::jsonb)`,
    [num(w.five_hour?.utilization), num(w.five_hour?.resetsAt), num(w.seven_day?.utilization), num(w.seven_day?.resetsAt), JSON.stringify(info)]);
  await db.query(`DELETE FROM taskpilot.plan_limits WHERE ts < NOW() - INTERVAL '${RETENTION_DAYS} days'`);
}

function readOnce() {
  if (inflight) return inflight;
  lastAttempt = Date.now();
  inflight = readFromClaude()
    .then(save)
    .then(() => { lastError = null; })
    .catch((e) => {
      lastError = String(e.message || e).replaceAll(tokenOf(), '[token]').slice(0, 300);
      log.warn('claude_limits_error', { error: lastError });
    })
    .finally(() => { inflight = null; });
  return inflight;
}

async function latest() {
  const { rows: [r] } = await db.query(`SELECT ts, info FROM taskpilot.plan_limits ORDER BY ts DESC LIMIT 1`);
  return r || null;
}

// Ultima lectura e historial; lee de nuevo si hace falta y se puede.
async function getStatus({ force = false } = {}) {
  let last = await latest();
  if (isConfigured()) {
    const stale = !last || Date.now() - new Date(last.ts).getTime() > MAX_AGE_MS;
    if ((force || stale) && Date.now() - lastAttempt > MIN_GAP_MS) {
      await readOnce();
      last = await latest();
    }
  }
  const { rows } = await db.query(
    `SELECT seven_day, seven_day_resets FROM taskpilot.plan_limits
      WHERE ts > NOW() - INTERVAL '${SAMPLE_DAYS} days' AND seven_day IS NOT NULL ORDER BY ts`);
  return {
    configured: isConfigured(),
    error: isConfigured() ? lastError : null,
    limits: last ? last.info : null,
    limitsAt: last ? last.ts : null,
    samples: rows.map((s) => ({ week: s.seven_day, weekResets: s.seven_day_resets == null ? null : Number(s.seven_day_resets) })),
  };
}

module.exports = { getStatus };
