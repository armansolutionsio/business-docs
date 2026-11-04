// TaskPilot — sesiones de trabajo con Claude (lado usuario). Se monta dentro de routes/taskpilot.js,
// asi hereda requireAuth + requireVertical('taskpilot').
//
// GET   /runners                          runners registrados (online si reportaron hace < 90 s)
// POST  /runners { nombre, alias }        admin: crea un runner y devuelve su token UNA sola vez
// PATCH /runners/:id { activo }           admin
// GET   /issues/:id/sessions              sesiones anteriores de la tarea
// POST  /issues/:id/sessions              inicia una sesion: { runner_id, repo, model, alias } -> job "start"
// GET   /sessions/:id                     sesion + mensajes + aprobaciones pendientes + ultimo informe
// GET   /sessions/:id/stream              SSE con los eventos de la sesion
// POST  /sessions/:id/messages { text }   mensaje del usuario -> job "message"
// POST  /sessions/:id/approve-plan        aprueba el plan (decide la aprobacion pendiente o encola "approve_plan")
// POST  /approvals/:id/decide { decision: 'aprobado'|'rechazado', motivo }
// POST  /sessions/:id/cancel              job "cancel"
// POST  /sessions/:id/finish              el usuario da por validado el trabajo -> etapa lista_registrar

const express = require('express');
const crypto = require('crypto');
const db = require('../utils/db');
const log = require('../utils/logger');
const { requireAdmin } = require('../utils/auth');
const events = require('../utils/taskpilotEvents');
const redmine = require('../utils/redmine');

const router = express.Router();
const ONLINE_MS = 90 * 1000;

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

async function audit(req, accion, recurso, recurso_id, payload) {
  try {
    await db.query(
      `INSERT INTO admin_core.audit_global (vertical, usuario, accion, recurso, recurso_id, payload, ip)
       VALUES ('taskpilot', $1, $2, $3, $4, $5::jsonb, $6)`,
      [req.user?.email || 'system', accion, recurso, String(recurso_id), JSON.stringify(payload || {}), req.ip]);
  } catch (e) { log.warn('taskpilot_audit_failed', { accion, error: e.message }); }
}

async function setEtapa(issueId, etapa, extra = {}, updatedBy = 'taskpilot') {
  await db.query(
    `INSERT INTO taskpilot.task_state (issue_id, etapa, owner_alias, repo, model, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (issue_id) DO UPDATE SET etapa = EXCLUDED.etapa,
       owner_alias = COALESCE(EXCLUDED.owner_alias, taskpilot.task_state.owner_alias),
       repo = COALESCE(EXCLUDED.repo, taskpilot.task_state.repo),
       model = COALESCE(EXCLUDED.model, taskpilot.task_state.model),
       updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [issueId, etapa, extra.owner_alias || null, extra.repo || null, extra.model || null, updatedBy]);
}

async function loadSession(id) {
  const { rows: [s] } = await db.query(
    `SELECT s.*, i.subject AS issue_subject, i.project_name, i.status AS issue_status, r.nombre AS runner_nombre,
            r.last_seen_at AS runner_last_seen, r.limits AS runner_limits, r.limits_at AS runner_limits_at, r.account AS runner_account
       FROM taskpilot.sessions s
       JOIN taskpilot.issues i ON i.id = s.issue_id
       LEFT JOIN taskpilot.runners r ON r.id = s.runner_id
      WHERE s.id = $1`, [id]);
  if (!s) return null;
  s.runner_online = Boolean(s.runner_last_seen && Date.now() - new Date(s.runner_last_seen).getTime() < ONLINE_MS);
  return s;
}

// Contexto que viaja en cada job para que el runner pueda reconstruir la sesion si se reinicio.
async function sessionContext(sessionId) {
  const { rows: [s] } = await db.query(`SELECT sdk_session_id, fase, repo, model, alias FROM taskpilot.sessions WHERE id = $1`, [sessionId]);
  const { rows: acts } = await db.query(`SELECT nombre FROM taskpilot.redmine_catalogs WHERE tipo = 'activity' AND activo ORDER BY (extra->>'position')::int`);
  // Contexto cargado por el equipo (pestaña Contexto): general y del repo de la sesion.
  const { rows: ctx } = await db.query(`SELECT key, contenido FROM taskpilot.contexts WHERE key = 'global' OR key = $1`, ['repo:' + (s?.repo || '')]);
  const contexto = { global: ctx.find((c) => c.key === 'global')?.contenido || '', repo: ctx.find((c) => c.key !== 'global')?.contenido || '' };
  return { ...(s || {}), actividades: acts.map((a) => a.nombre), contexto };
}

async function addJob(sessionId, runnerId, tipo, payload = {}) {
  const ctx = tipo === 'cancel' || !sessionId ? {} : await sessionContext(sessionId);
  const { rows: [job] } = await db.query(
    `INSERT INTO taskpilot.jobs (session_id, runner_id, tipo, payload) VALUES ($1, $2, $3, $4::jsonb) RETURNING *`,
    [sessionId, runnerId, tipo, JSON.stringify({ ...ctx, ...payload })]);
  events.emit(`jobs:${runnerId}`, job);
  return job;
}

async function addMessage(sessionId, rol, contenido, metadata = {}) {
  const { rows: [m] } = await db.query(
    `INSERT INTO taskpilot.messages (session_id, rol, contenido, metadata) VALUES ($1, $2, $3, $4::jsonb) RETURNING *`,
    [sessionId, rol, contenido, JSON.stringify(metadata)]);
  events.publish(sessionId, { type: 'message', message: m });
  return m;
}

// ── runners ───────────────────────────────────────────────────────────
function runnerView(r) {
  const online = Boolean(r.last_seen_at && Date.now() - new Date(r.last_seen_at).getTime() < ONLINE_MS);
  const { token_hash, ...rest } = r;
  return { ...rest, online };
}

router.get('/runners', async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT * FROM taskpilot.runners ORDER BY id`);
    res.json(rows.map(runnerView));
  } catch (e) { next(e); }
});

router.post('/runners', requireAdmin, async (req, res, next) => {
  try {
    const { nombre, alias } = req.body || {};
    if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'nombre es requerido' });
    const token = 'tpr_' + crypto.randomBytes(24).toString('hex');
    const { rows: [r] } = await db.query(
      `INSERT INTO taskpilot.runners (nombre, alias, token_hash, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
      [String(nombre).trim(), alias || null, sha256(token), req.user.email]);
    await audit(req, 'runner_create', 'runner', r.id, { nombre: r.nombre, alias: r.alias });
    res.status(201).json({ ...runnerView(r), token });
  } catch (e) { next(e); }
});

// Pide al runner que consulte los limites de uso del plan (un turno minimo con Haiku).
router.post('/runners/:id/limits-refresh', async (req, res, next) => {
  try {
    const { rows: [r] } = await db.query(`SELECT * FROM taskpilot.runners WHERE id = $1 AND activo`, [Number(req.params.id)]);
    if (!r) return res.status(404).json({ error: 'Runner no encontrado' });
    if (!runnerView(r).online) return res.status(409).json({ error: 'El runner no está conectado' });
    const { rows: [pending] } = await db.query(`SELECT id FROM taskpilot.jobs WHERE runner_id = $1 AND tipo = 'limits' AND estado IN ('pendiente','tomado') LIMIT 1`, [r.id]);
    if (pending) return res.status(409).json({ error: 'Ya se está consultando' });
    await addJob(null, r.id, 'limits', { usuario: req.user.email });
    res.status(202).json({ started: true });
  } catch (e) { next(e); }
});

router.patch('/runners/:id', requireAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows: [r] } = await db.query(
      `UPDATE taskpilot.runners SET activo = COALESCE($2, activo), alias = COALESCE($3, alias), nombre = COALESCE($4, nombre)
        WHERE id = $1 RETURNING *`,
      [Number(req.params.id), b.activo ?? null, b.alias ?? null, b.nombre ?? null]);
    if (!r) return res.status(404).json({ error: 'Runner no encontrado' });
    res.json(runnerView(r));
  } catch (e) { next(e); }
});

// ── sesiones ──────────────────────────────────────────────────────────
router.get('/issues/:id/sessions', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT s.id, s.alias, s.repo, s.model, s.estado, s.fase, s.auth, s.costo_usd, s.duracion_ms, s.turnos, s.created_by,
              s.created_at, s.updated_at, s.last_event_at, r.nombre AS runner_nombre,
              (SELECT COUNT(*) FROM taskpilot.messages m WHERE m.session_id = s.id)::int AS mensajes,
              (SELECT COUNT(*) FROM taskpilot.reports rp WHERE rp.session_id = s.id)::int AS informes
         FROM taskpilot.sessions s LEFT JOIN taskpilot.runners r ON r.id = s.runner_id
        WHERE s.issue_id = $1 ORDER BY s.id DESC`, [Number(req.params.id)]);
    res.json(rows);
  } catch (e) { next(e); }
});

// Contexto completo de la tarea que viaja al runner (titulo, descripcion, historial, campos).
async function issueContext(issueId) {
  const { rows: [i] } = await db.query(
    `SELECT id, project_name, tracker, status, priority, author, assigned_to, subject, description,
            start_date::text AS start_date, due_date::text AS due_date, estimated_hours, spent_hours, done_ratio,
            fixed_version, custom_fields, created_on, updated_on
       FROM taskpilot.issues WHERE id = $1`, [issueId]);
  if (!i) return null;
  const { rows: journals } = await db.query(
    `SELECT user_name, notes, created_on FROM taskpilot.issue_journals
      WHERE issue_id = $1 AND notes IS NOT NULL AND notes <> '' ORDER BY created_on`, [issueId]);
  return { ...i, journals, url: redmine.issueUrl(issueId) };
}

router.post('/issues/:id/sessions', async (req, res, next) => {
  try {
    const issueId = Number(req.params.id);
    const { runner_id, repo, model, alias, instrucciones } = req.body || {};
    if (!runner_id || !model) return res.status(400).json({ error: 'runner_id y model son requeridos' });
    const { rows: [runner] } = await db.query(`SELECT * FROM taskpilot.runners WHERE id = $1 AND activo`, [Number(runner_id)]);
    if (!runner) return res.status(400).json({ error: 'Runner no encontrado o inactivo' });
    if (!runnerView(runner).online) return res.status(409).json({ error: `El runner "${runner.nombre}" no está conectado. Iniciá el runner en esa PC y volvé a intentar.` });
    const repos = Array.isArray(runner.repos) ? runner.repos : [];
    if (repo && !repos.some((r) => r.name === repo)) return res.status(400).json({ error: `El runner no tiene el repo "${repo}"` });
    const issue = await issueContext(issueId);
    if (!issue) return res.status(404).json({ error: 'Tarea no encontrada' });
    const { rows: [active] } = await db.query(
      `SELECT id FROM taskpilot.sessions WHERE issue_id = $1 AND estado IN ('esperando_runner','trabajando','esperando_usuario') ORDER BY id DESC LIMIT 1`, [issueId]);
    if (active && !req.body.force) {
      return res.status(409).json({ error: `La tarea ya tiene una sesión activa (#${active.id}). Abrila o cancelala antes de iniciar otra.`, session_id: active.id });
    }
    const owner = alias || runner.alias || null;
    const { rows: [s] } = await db.query(
      `INSERT INTO taskpilot.sessions (issue_id, alias, runner_id, repo, model, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [issueId, owner, runner.id, repo || null, model, req.user.email]);
    await addMessage(s.id, 'system', `Sesión iniciada por ${req.user.email} en el runner "${runner.nombre}"${repo ? `, repo ${repo}` : ', sin repositorio'}, modelo ${model}.`);
    if (instrucciones && String(instrucciones).trim()) await addMessage(s.id, 'user', String(instrucciones).trim(), { inicial: true });
    await addJob(s.id, runner.id, 'start', { issue, instrucciones: instrucciones || null, usuario: req.user.email });
    await setEtapa(issueId, 'analizando', { owner_alias: owner, repo, model }, req.user.email);
    await audit(req, 'session_start', 'session', s.id, { issue_id: issueId, runner: runner.nombre, repo, model });
    res.status(201).json(await loadSession(s.id));
  } catch (e) { next(e); }
});

router.get('/sessions/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const s = await loadSession(id);
    if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
    const since = Number(req.query.after) || 0;
    const { rows: messages } = await db.query(
      `SELECT * FROM taskpilot.messages WHERE session_id = $1 AND id > $2 ORDER BY id`, [id, since]);
    const { rows: approvals } = await db.query(
      `SELECT * FROM taskpilot.approvals WHERE session_id = $1 ORDER BY id`, [id]);
    const { rows: [report] } = await db.query(
      `SELECT * FROM taskpilot.reports WHERE session_id = $1 ORDER BY id DESC LIMIT 1`, [id]);
    res.json({ session: s, messages, approvals, report: report || null });
  } catch (e) { next(e); }
});

router.get('/sessions/:id/stream', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const s = await loadSession(id);
    if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
    events.subscribe(id, req, res);
  } catch (e) { next(e); }
});

async function requireLiveSession(req, res) {
  const s = await loadSession(Number(req.params.id));
  if (!s) { res.status(404).json({ error: 'Sesión no encontrada' }); return null; }
  if (['finalizada', 'cancelada'].includes(s.estado)) { res.status(409).json({ error: `La sesión está ${s.estado}` }); return null; }
  if (!s.runner_id) { res.status(409).json({ error: 'La sesión no tiene runner asignado' }); return null; }
  return s;
}

router.post('/sessions/:id/messages', async (req, res, next) => {
  try {
    const s = await requireLiveSession(req, res);
    if (!s) return;
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'text es requerido' });
    const m = await addMessage(s.id, 'user', text, { por: req.user.email });
    await addJob(s.id, s.runner_id, 'message', { text, usuario: req.user.email });
    await db.query(`UPDATE taskpilot.sessions SET estado = CASE WHEN estado = 'esperando_usuario' THEN 'esperando_runner' ELSE estado END, updated_at = NOW() WHERE id = $1`, [s.id]);
    events.publish(s.id, { type: 'session', session: await loadSession(s.id) });
    res.status(201).json(m);
  } catch (e) { next(e); }
});

router.post('/sessions/:id/approve-plan', async (req, res, next) => {
  try {
    const s = await requireLiveSession(req, res);
    if (!s) return;
    const comentario = String(req.body?.comentario || '').trim();
    const { rows: [pending] } = await db.query(
      `SELECT * FROM taskpilot.approvals WHERE session_id = $1 AND tipo = 'plan' AND estado = 'pendiente' ORDER BY id DESC LIMIT 1`, [s.id]);
    await db.query(
      `UPDATE taskpilot.sessions SET plan_aprobado_at = NOW(), plan_aprobado_por = $2, fase = 'ejecucion', updated_at = NOW() WHERE id = $1`,
      [s.id, req.user.email]);
    await addMessage(s.id, 'system', `Plan aprobado por ${req.user.email}.${comentario ? ' Comentario: ' + comentario : ''}`);
    if (pending) {
      await db.query(`UPDATE taskpilot.approvals SET estado = 'aprobado', motivo = $2, decidido_por = $3, decidido_at = NOW() WHERE id = $1`,
        [pending.id, comentario || null, req.user.email]);
      events.emit(`approval:${pending.id}`, { estado: 'aprobado' });
    } else {
      await addJob(s.id, s.runner_id, 'approve_plan', { comentario: comentario || null, usuario: req.user.email });
    }
    await setEtapa(s.issue_id, 'en_ejecucion', {}, req.user.email);
    await audit(req, 'plan_approve', 'session', s.id, { comentario: comentario || null });
    const fresh = await loadSession(s.id);
    events.publish(s.id, { type: 'session', session: fresh });
    res.json(fresh);
  } catch (e) { next(e); }
});

router.post('/approvals/:id/decide', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { decision, motivo } = req.body || {};
    if (!['aprobado', 'rechazado'].includes(decision)) return res.status(400).json({ error: 'decision debe ser aprobado o rechazado' });
    const { rows: [a] } = await db.query(
      `UPDATE taskpilot.approvals SET estado = $2, motivo = $3, decidido_por = $4, decidido_at = NOW()
        WHERE id = $1 AND estado = 'pendiente' RETURNING *`,
      [id, decision, motivo || null, req.user.email]);
    if (!a) return res.status(409).json({ error: 'La aprobación ya fue resuelta o no existe' });
    if (a.tipo === 'plan' && decision === 'aprobado') {
      await db.query(`UPDATE taskpilot.sessions SET plan_aprobado_at = NOW(), plan_aprobado_por = $2, fase = 'ejecucion', updated_at = NOW() WHERE id = $1`, [a.session_id, req.user.email]);
      const { rows: [s] } = await db.query(`SELECT issue_id FROM taskpilot.sessions WHERE id = $1`, [a.session_id]);
      if (s) await setEtapa(s.issue_id, 'en_ejecucion', {}, req.user.email);
    }
    const label = a.tipo === 'plan'
      ? (decision === 'aprobado' ? 'Plan aprobado' : 'Plan rechazado')
      : `Operación ${a.tool || ''} ${decision === 'aprobado' ? 'aprobada' : 'rechazada'}`;
    await addMessage(a.session_id, 'system', `${label} por ${req.user.email}${motivo ? ': ' + motivo : ''}.`);
    events.emit(`approval:${a.id}`, { estado: decision, motivo: motivo || null });
    events.publish(a.session_id, { type: 'approval', approval: a });
    await audit(req, 'approval_' + decision, 'approval', a.id, { session_id: a.session_id, tool: a.tool, tipo: a.tipo, motivo: motivo || null });
    res.json(a);
  } catch (e) { next(e); }
});

router.post('/sessions/:id/cancel', async (req, res, next) => {
  try {
    const s = await requireLiveSession(req, res);
    if (!s) return;
    await addJob(s.id, s.runner_id, 'cancel', { usuario: req.user.email });
    await db.query(`UPDATE taskpilot.approvals SET estado = 'expirado', decidido_at = NOW() WHERE session_id = $1 AND estado = 'pendiente'`, [s.id]);
    await db.query(`UPDATE taskpilot.sessions SET estado = 'cancelada', updated_at = NOW() WHERE id = $1`, [s.id]);
    await addMessage(s.id, 'system', `Sesión cancelada por ${req.user.email}.`);
    await setEtapa(s.issue_id, 'pendiente', {}, req.user.email);
    await audit(req, 'session_cancel', 'session', s.id, {});
    const fresh = await loadSession(s.id);
    events.publish(s.id, { type: 'session', session: fresh });
    res.json(fresh);
  } catch (e) { next(e); }
});

// Git desde TaskPilot: lo ejecuta el runner en la PC del usuario con su git y sus credenciales
// (el commit sale con el user.name / user.email del repo). Claude nunca corre estas operaciones.
const GIT_OPS = new Set(['status', 'diff', 'pull', 'commit', 'push']);
router.post('/sessions/:id/git', async (req, res, next) => {
  try {
    const s = await loadSession(Number(req.params.id));
    if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
    const { op, message } = req.body || {};
    if (!GIT_OPS.has(op)) return res.status(400).json({ error: 'Operación git no permitida' });
    if (!s.repo) return res.status(400).json({ error: 'La sesión no tiene repositorio' });
    if (!s.runner_id || !s.runner_online) return res.status(409).json({ error: 'El runner no está conectado' });
    if (s.estado === 'trabajando') return res.status(409).json({ error: 'Claude está trabajando; esperá a que termine el paso actual' });
    if (op === 'commit' && !String(message || '').trim()) return res.status(400).json({ error: 'Falta el mensaje de commit' });
    const { rows: [pending] } = await db.query(
      `SELECT id FROM taskpilot.jobs WHERE session_id = $1 AND tipo = 'git' AND estado IN ('pendiente','tomado') LIMIT 1`, [s.id]);
    if (pending) return res.status(409).json({ error: 'Ya hay una operación git en curso' });
    await addJob(s.id, s.runner_id, 'git', { op, message: message ? String(message).slice(0, 4000) : null, usuario: req.user.email });
    await audit(req, 'git_' + op, 'session', s.id, { repo: s.repo, message: op === 'commit' ? String(message).split('\n')[0].slice(0, 200) : null });
    res.status(202).json({ started: true, op });
  } catch (e) { next(e); }
});

// El usuario da por validado el trabajo (o la consulta no requiere testing): queda lista para registrar.
router.post('/sessions/:id/finish', async (req, res, next) => {
  try {
    const s = await loadSession(Number(req.params.id));
    if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
    if (s.runner_id && ['trabajando', 'esperando_runner'].includes(s.estado)) {
      await addJob(s.id, s.runner_id, 'cancel', { usuario: req.user.email, motivo: 'finalizada por el usuario' });
    }
    await db.query(`UPDATE taskpilot.approvals SET estado = 'expirado', decidido_at = NOW() WHERE session_id = $1 AND estado = 'pendiente'`, [s.id]);
    await db.query(`UPDATE taskpilot.sessions SET estado = 'finalizada', updated_at = NOW() WHERE id = $1`, [s.id]);
    await addMessage(s.id, 'system', `Trabajo validado por ${req.user.email}. La tarea queda lista para registrar la actividad.`);
    await setEtapa(s.issue_id, 'lista_registrar', {}, req.user.email);
    await audit(req, 'session_finish', 'session', s.id, {});
    const fresh = await loadSession(s.id);
    events.publish(s.id, { type: 'session', session: fresh });
    res.json(fresh);
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.helpers = { loadSession, addMessage, setEtapa, sha256, ONLINE_MS };
