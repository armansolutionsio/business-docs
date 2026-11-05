// TaskPilot — API para los runners (el proceso con el Agent SDK que corre en la PC de cada dev).
// Se monta en /api/taskpilot-runner, fuera del JWT de usuarios: cada runner se autentica con su
// token (Authorization: Bearer tpr_...). Todo el trafico lo inicia el runner (saliente).
//
// POST /register { nombre?, host, version, repos, models }   -> datos del runner
// POST /heartbeat                                            -> marca online
// GET  /jobs?wait=25                                          -> siguiente trabajo (long poll) o 204
// POST /jobs/:id/done | /jobs/:id/error { error }
// POST /sessions/:id/events { events: [...] }                -> mensajes, estado, resultado, informe
// POST /sessions/:id/approvals { tipo, tool, input, descripcion } -> { id }
// GET  /approvals/:id?wait=25                                 -> decision (long poll)

const express = require('express');
const db = require('../utils/db');
const log = require('../utils/logger');
const events = require('../utils/taskpilotEvents');
const iaUsage = require('../utils/iaUsage');
const { helpers } = require('./taskpilotSessions');

const router = express.Router();
const MAX_WAIT_S = 30;

// ── auth por token ────────────────────────────────────────────────────
router.use(async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Token de runner requerido' });
    const { rows: [r] } = await db.query(`SELECT * FROM taskpilot.runners WHERE token_hash = $1`, [helpers.sha256(token)]);
    if (!r) return res.status(401).json({ error: 'Token de runner inválido' });
    if (!r.activo) return res.status(403).json({ error: 'Runner desactivado' });
    req.runner = r;
    await db.query(`UPDATE taskpilot.runners SET last_seen_at = NOW() WHERE id = $1`, [r.id]);
    next();
  } catch (e) { next(e); }
});

const waitSeconds = (q) => Math.min(Math.max(Number(q) || 0, 0), MAX_WAIT_S);

router.post('/register', async (req, res, next) => {
  try {
    const b = req.body || {};
    const repos = Array.isArray(b.repos) ? b.repos.filter((r) => r && r.name).map((r) => ({
      name: String(r.name).slice(0, 120), path: r.path ? String(r.path).slice(0, 400) : null, description: r.description ? String(r.description).slice(0, 300) : null,
    })) : [];
    const models = Array.isArray(b.models) ? b.models.filter((m) => m && m.id).map((m) => ({ id: String(m.id), display_name: m.display_name || m.id })) : [];
    const { rows: [r] } = await db.query(
      `UPDATE taskpilot.runners SET host = $2, version = $3, repos = $4::jsonb, models = $5::jsonb, last_seen_at = NOW()
        WHERE id = $1 RETURNING id, nombre, alias, repos, models`,
      [req.runner.id, b.host ? String(b.host).slice(0, 200) : null, b.version ? String(b.version).slice(0, 40) : null,
       JSON.stringify(repos), JSON.stringify(models)]);
    log.info('taskpilot_runner_registered', { runner: r.nombre, repos: repos.length, models: models.length });
    res.json(r);
  } catch (e) { next(e); }
});

router.post('/heartbeat', (req, res) => res.json({ ok: true, runner_id: req.runner.id }));

// Limites de uso del plan de Claude (lo que el SDK reporta en rate_limit_event) y datos de la cuenta.
router.post('/limits', async (req, res, next) => {
  try {
    const b = req.body || {};
    const info = b.info && typeof b.info === 'object' ? b.info : null;
    const account = b.account && typeof b.account === 'object' ? b.account : null;
    // Se combina con lo anterior: el evento de un turno no trae los limites por modelo que da la lectura completa.
    const { rows: [saved] } = await db.query(
      `UPDATE taskpilot.runners SET limits = CASE WHEN $2::jsonb IS NULL THEN limits ELSE COALESCE(limits, '{}'::jsonb) || $2::jsonb END,
              limits_at = CASE WHEN $2::jsonb IS NULL THEN limits_at ELSE NOW() END,
              account = COALESCE(account, '{}'::jsonb) || COALESCE($3::jsonb, '{}'::jsonb), last_seen_at = NOW() WHERE id = $1 RETURNING limits_at`,
      [req.runner.id, info ? JSON.stringify(info) : null, account ? JSON.stringify(account) : null]);
    if (info) await iaUsage.recordSample(req.runner.id, saved.limits_at, info);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Toma el siguiente job pendiente del runner. Si no hay, espera hasta `wait` segundos.
async function takeJob(runnerId) {
  const { rows: [job] } = await db.query(
    `UPDATE taskpilot.jobs SET estado = 'tomado', taken_at = NOW()
      WHERE id = (SELECT id FROM taskpilot.jobs WHERE runner_id = $1 AND estado = 'pendiente' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING *`, [runnerId]);
  return job || null;
}

router.get('/jobs', async (req, res, next) => {
  try {
    let job = await takeJob(req.runner.id);
    if (!job) {
      const wait = waitSeconds(req.query.wait);
      if (wait) { await events.waitFor(`jobs:${req.runner.id}`, wait * 1000); job = await takeJob(req.runner.id); }
    }
    if (!job) return res.status(204).end();
    if (job.tipo === 'start' && job.session_id) {
      await db.query(`UPDATE taskpilot.sessions SET estado = 'trabajando', updated_at = NOW() WHERE id = $1 AND estado = 'esperando_runner'`, [job.session_id]);
      events.publish(job.session_id, { type: 'session', session: await helpers.loadSession(job.session_id) });
    }
    res.json(job);
  } catch (e) { next(e); }
});

router.post('/jobs/:id/done', async (req, res, next) => {
  try {
    await db.query(`UPDATE taskpilot.jobs SET estado = 'hecho', done_at = NOW() WHERE id = $1 AND runner_id = $2`, [Number(req.params.id), req.runner.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/jobs/:id/error', async (req, res, next) => {
  try {
    await db.query(`UPDATE taskpilot.jobs SET estado = 'error', error = $3, done_at = NOW() WHERE id = $1 AND runner_id = $2`,
      [Number(req.params.id), req.runner.id, String(req.body?.error || 'error').slice(0, 2000)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

async function ownSession(req, res) {
  const id = Number(req.params.id);
  const { rows: [s] } = await db.query(`SELECT * FROM taskpilot.sessions WHERE id = $1`, [id]);
  if (!s) { res.status(404).json({ error: 'Sesión no encontrada' }); return null; }
  if (s.runner_id !== req.runner.id) { res.status(403).json({ error: 'La sesión pertenece a otro runner' }); return null; }
  return s;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Eventos del runner. Cada uno se persiste como mensaje y/o actualiza la sesion, y se publica por SSE.
router.post('/sessions/:id/events', async (req, res, next) => {
  try {
    const s = await ownSession(req, res);
    if (!s) return;
    const list = Array.isArray(req.body?.events) ? req.body.events : [req.body].filter(Boolean);
    let sessionChanged = false;
    for (const ev of list) {
      const t = ev?.type;
      if (t === 'status') {
        const estado = ['trabajando', 'esperando_usuario', 'error'].includes(ev.estado) ? ev.estado : null;
        const fase = ['plan', 'ejecucion', 'informe'].includes(ev.fase) ? ev.fase : null;
        await db.query(
          `UPDATE taskpilot.sessions SET estado = COALESCE($2, estado), fase = COALESCE($3, fase), last_event_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [s.id, estado, fase]);
        sessionChanged = true;
      } else if (t === 'init') {
        await db.query(`UPDATE taskpilot.sessions SET sdk_session_id = COALESCE($2, sdk_session_id), model = COALESCE($3, model), auth = COALESCE($4, auth), last_event_at = NOW() WHERE id = $1`,
          [s.id, ev.sdk_session_id ? String(ev.sdk_session_id).slice(0, 120) : null, ev.model ? String(ev.model).slice(0, 80) : null,
           ['suscripcion', 'api_key'].includes(ev.auth) ? ev.auth : null]);
        sessionChanged = true;
      } else if (t === 'assistant') {
        if (ev.text && String(ev.text).trim()) await helpers.addMessage(s.id, 'assistant', String(ev.text), { fase: ev.fase || null });
      } else if (t === 'tool_use') {
        await helpers.addMessage(s.id, 'tool', ev.summary ? String(ev.summary).slice(0, 2000) : String(ev.tool || 'tool'),
          { tool: ev.tool || null, input: ev.input ?? null, kind: 'use' });
      } else if (t === 'tool_result') {
        await helpers.addMessage(s.id, 'tool', ev.summary ? String(ev.summary).slice(0, 4000) : '',
          { tool: ev.tool || null, is_error: Boolean(ev.is_error), kind: 'result' });
      } else if (t === 'result') {
        // total_cost_usd es acumulado de la sesion (tambien al retomarla), no el costo de este turno.
        await db.query(
          `UPDATE taskpilot.sessions SET costo_usd = GREATEST(costo_usd, $2), duracion_ms = duracion_ms + $3, turnos = turnos + $4,
                  tokens_in = tokens_in + $5, tokens_out = tokens_out + $6, last_event_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [s.id, num(ev.costo_usd), num(ev.duracion_ms), num(ev.turnos), num(ev.tokens_in), num(ev.tokens_out)]);
        await helpers.addMessage(s.id, 'result', ev.text ? String(ev.text) : null,
          { subtype: ev.subtype || null, costo_usd: num(ev.costo_usd), duracion_ms: num(ev.duracion_ms), turnos: num(ev.turnos), tokens_in: num(ev.tokens_in), tokens_out: num(ev.tokens_out) });
        sessionChanged = true;
      } else if (t === 'report') {
        const r = ev.report || {};
        const { rows: [rep] } = await db.query(
          `INSERT INTO taskpilot.reports (session_id, resumen, resultado, archivos, pruebas_automaticas, testing_manual, errores_pendientes,
             comentario_propuesto, minutos_estimados, requiere_testing, commit_message, tipo_actividad, raw)
           VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) RETURNING *`,
          [s.id, r.resumen || null, r.resultado || null, JSON.stringify(Array.isArray(r.archivos) ? r.archivos : []),
           r.pruebas_automaticas || null, r.testing_manual || null, r.errores_pendientes || null, r.comentario_propuesto || null,
           Number.isFinite(Number(r.minutos_estimados)) ? Math.round(Number(r.minutos_estimados)) : null,
           typeof r.requiere_testing === 'boolean' ? r.requiere_testing : null, r.commit_message || null,
           r.tipo_actividad ? String(r.tipo_actividad).slice(0, 80) : null, JSON.stringify(r)]);
        await db.query(`UPDATE taskpilot.sessions SET fase = 'informe', last_event_at = NOW(), updated_at = NOW() WHERE id = $1`, [s.id]);
        await helpers.setEtapa(s.issue_id, 'pendiente_validacion', {}, 'runner');
        events.publish(s.id, { type: 'report', report: rep });
        sessionChanged = true;
      } else if (t === 'error') {
        await db.query(`UPDATE taskpilot.sessions SET ultimo_error = $2, estado = 'error', last_event_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [s.id, String(ev.message || 'error').slice(0, 2000)]);
        await helpers.addMessage(s.id, 'error', String(ev.message || 'error'), {});
        sessionChanged = true;
      } else if (t === 'system') {
        await helpers.addMessage(s.id, 'system', String(ev.text || ''), {});
      } else if (t === 'git_result') {
        await helpers.addMessage(s.id, 'git', String(ev.output || '').slice(0, 8000),
          { op: String(ev.op || 'status').slice(0, 20), ok: Boolean(ev.ok), status: ev.status ?? null, usuario: ev.usuario || null });
      }
    }
    if (sessionChanged) events.publish(s.id, { type: 'session', session: await helpers.loadSession(s.id) });
    res.json({ ok: true, received: list.length });
  } catch (e) { next(e); }
});

router.post('/sessions/:id/approvals', async (req, res, next) => {
  try {
    const s = await ownSession(req, res);
    if (!s) return;
    const b = req.body || {};
    const tipo = b.tipo === 'plan' ? 'plan' : 'tool';
    const { rows: [a] } = await db.query(
      `INSERT INTO taskpilot.approvals (session_id, tipo, tool, input, descripcion) VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING *`,
      [s.id, tipo, b.tool ? String(b.tool).slice(0, 80) : null, JSON.stringify(b.input ?? null), b.descripcion ? String(b.descripcion).slice(0, 4000) : null]);
    await db.query(`UPDATE taskpilot.sessions SET estado = 'esperando_usuario', last_event_at = NOW(), updated_at = NOW() WHERE id = $1`, [s.id]);
    await helpers.addMessage(s.id, 'approval', b.descripcion || (tipo === 'plan' ? 'Plan propuesto' : `Operación ${b.tool || ''}`), { approval_id: a.id, tipo, tool: a.tool, input: b.input ?? null });
    events.publish(s.id, { type: 'approval', approval: a });
    events.publish(s.id, { type: 'session', session: await helpers.loadSession(s.id) });
    res.status(201).json({ id: a.id });
  } catch (e) { next(e); }
});

router.get('/approvals/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const read = async () => (await db.query(
      `SELECT a.* FROM taskpilot.approvals a JOIN taskpilot.sessions s ON s.id = a.session_id WHERE a.id = $1 AND s.runner_id = $2`, [id, req.runner.id])).rows[0];
    let a = await read();
    if (!a) return res.status(404).json({ error: 'Aprobación no encontrada' });
    if (a.estado === 'pendiente') {
      const wait = waitSeconds(req.query.wait);
      if (wait) { await events.waitFor(`approval:${id}`, wait * 1000); a = await read(); }
    }
    res.json({ id: a.id, estado: a.estado, motivo: a.motivo, decidido_por: a.decidido_por });
  } catch (e) { next(e); }
});

module.exports = router;
