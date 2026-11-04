// TaskPilot — tareas de Redmine, etapas del pipeline y sincronizacion.
// Schema: taskpilot. Requiere la vertical `taskpilot` (admin pasa siempre).
//
// GET   /status                 estado del sync, cuentas y conteos para el tablero
// POST  /sync { full }          dispara una corrida (devuelve enseguida; el tablero consulta /status)
// GET   /catalogs               proyectos, estados, tipos, prioridades, actividades, usuarios, cuentas
// GET   /issues?...             listado con filtros y paginacion (ver buildIssuesQuery)
// GET   /issues/:id             detalle con descripcion completa y journals (refresca desde Redmine)
// PATCH /issues/:id/status      cambia el estado en Redmine con la identidad del usuario que actua
// PATCH /issues/:id/etapa       cambia la etapa del pipeline de TaskPilot (local)
// GET   /accounts               cuentas de Redmine (sin keys) y usuarios de Arman para vincular
// PATCH /accounts/:alias        admin: vincula una cuenta a un usuario de Arman o la activa/desactiva

const express = require('express');
const db = require('../utils/db');
const log = require('../utils/logger');
const { requireVertical, requireAdmin } = require('../utils/auth');
const redmine = require('../utils/redmine');
const sync = require('../utils/taskpilotSync');
const store = require('../utils/taskpilotDb');
const HTMLtoPDFRenderer = require('../utils/htmltoPdfRenderer');

const router = express.Router();
router.use(requireVertical('taskpilot'));
router.use(require('./taskpilotSessions'));

const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ESTIMAR_SQL = `(SELECT id FROM taskpilot.redmine_catalogs WHERE tipo = 'status' AND lower(nombre) = 'estimar')`;

// Hoy, inicio de semana (lunes) e inicio de mes en hora de Argentina, como fechas YYYY-MM-DD.
function periodos() {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
  const [y, m, d] = hoy.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const lunes = new Date(utc.getTime() - ((utc.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
  const mesAnterior = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  return { hoy, semana: lunes, mes: `${hoy.slice(0, 8)}01`, mesAnterior };
}
const mesDesde = (n) => { // primer dia del mes, n meses atras (hora Argentina)
  const { mes } = periodos();
  const [y, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 - n, 1)).toISOString().slice(0, 10);
};

async function audit(req, accion, recurso_id, payload) {
  try {
    await db.query(
      `INSERT INTO admin_core.audit_global (vertical, usuario, accion, recurso, recurso_id, payload, ip)
       VALUES ('taskpilot', $1, $2, 'issue', $3, $4::jsonb, $5)`,
      [req.user?.email || 'system', accion, String(recurso_id), JSON.stringify(payload || {}), req.ip]);
  } catch (e) {
    log.warn('taskpilot_audit_failed', { accion, error: e.message });
  }
}

// Cuenta de Redmine con la que actua el usuario logueado: la vinculada a su usuario de Arman,
// o la que pida con `as` si es admin (o si esa cuenta es la suya).
async function resolveActingAccount(req, as) {
  const accounts = await store.getAccounts({ withKeys: true });
  const own = accounts.find((a) => a.user_id === req.user.id);
  if (as) {
    const wanted = accounts.find((a) => a.alias === as);
    if (!wanted) return { error: `No existe la cuenta "${as}"` };
    if (req.user.rol !== 'admin' && wanted.user_id !== req.user.id) return { error: 'No podés actuar con esa cuenta de Redmine' };
    return { account: wanted };
  }
  if (own) return { account: own };
  return { error: 'Tu usuario no está vinculado a ninguna cuenta de Redmine. Elegí con qué cuenta actuar o pedile al admin que te vincule.' };
}

// Cuenta que puede ver una issue (para refrescar el detalle): la propia, la primera que la ve, o cualquiera.
async function viewerAccount(req, issue) {
  const accounts = await store.getAccounts({ withKeys: true });
  if (!accounts.length) return null;
  const own = accounts.find((a) => a.user_id === req.user.id);
  const visible = Array.isArray(issue?.visible_to) ? issue.visible_to : [];
  if (own && (!visible.length || visible.includes(own.alias))) return own;
  return accounts.find((a) => visible.includes(a.alias)) || accounts[0];
}

// ── estado y sync ─────────────────────────────────────────────────────
router.get('/status', async (req, res, next) => {
  try {
    const status = await sync.getStatus();
    const p = periodos();
    const { rows: byAccount } = await db.query(
      `SELECT a.alias, a.nombre, a.redmine_user_id,
              COUNT(i.id) FILTER (WHERE NOT i.is_closed)::int AS abiertas,
              COUNT(i.id) FILTER (WHERE i.is_closed)::int AS cerradas,
              COUNT(i.id) FILTER (WHERE NOT i.is_closed AND i.status_id IN ${ESTIMAR_SQL})::int AS a_estimar,
              COALESCE((SELECT SUM(hours) FROM taskpilot.time_entries t WHERE t.alias = a.alias AND t.spent_on = $1::date), 0)::float AS horas_hoy,
              COALESCE((SELECT SUM(hours) FROM taskpilot.time_entries t WHERE t.alias = a.alias AND t.spent_on >= $2::date), 0)::float AS horas_semana,
              COALESCE((SELECT SUM(hours) FROM taskpilot.time_entries t WHERE t.alias = a.alias AND t.spent_on >= $3::date), 0)::float AS horas_mes,
              COALESCE((SELECT SUM(hours) FROM taskpilot.time_entries t WHERE t.alias = a.alias AND t.spent_on >= $4::date AND t.spent_on < $3::date), 0)::float AS horas_mes_anterior,
              COALESCE((SELECT SUM(hours) FROM taskpilot.time_entries t WHERE t.alias = a.alias), 0)::float AS horas_total,
              (SELECT COUNT(*) FROM taskpilot.time_entries t WHERE t.alias = a.alias)::int AS cargas,
              (SELECT MAX(spent_on)::text FROM taskpilot.time_entries t WHERE t.alias = a.alias) AS ultima_carga
         FROM taskpilot.redmine_accounts a
         LEFT JOIN taskpilot.issues i ON i.assigned_to_id = a.redmine_user_id
        WHERE a.activo GROUP BY a.alias, a.nombre, a.redmine_user_id ORDER BY a.alias`, [p.hoy, p.semana, p.mes, p.mesAnterior]);
    const { rows: etapas } = await db.query(
      `SELECT COALESCE(t.etapa, 'pendiente') AS etapa, COUNT(*)::int AS n
         FROM taskpilot.issues i LEFT JOIN taskpilot.task_state t ON t.issue_id = i.id
        WHERE NOT i.is_closed GROUP BY 1`);
    const { rows: [tot] } = await db.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE NOT is_closed)::int AS abiertas, MAX(updated_on) AS ultima_actualizacion
         FROM taskpilot.issues`);
    res.json({ ...status, redmineWrites: redmine.writesEnabled(), byAccount, etapas, totals: tot, etapaLabels: store.ETAPA_LABEL, periodos: p });
  } catch (e) { next(e); }
});

router.post('/sync', async (req, res, next) => {
  try {
    if (!redmine.configured()) return res.status(503).json({ error: 'REDMINE_URL no configurada' });
    const full = Boolean(req.body?.full);
    sync.run({ trigger: 'manual', full }).catch((e) => log.warn('taskpilot_manual_sync_error', { error: e.message }));
    await audit(req, 'sync', 0, { full });
    res.status(202).json({ started: true, full });
  } catch (e) { next(e); }
});

// ── horas cargadas en Redmine (time entries del equipo) ───────────────
// GET /hours/summary?months=12  -> por mes y por persona, del mes actual hacia atras
router.get('/hours/summary', async (req, res, next) => {
  try {
    const months = Math.min(Math.max(Number(req.query.months) || 12, 1), 36);
    const desde = mesDesde(months - 1);
    const { rows } = await db.query(
      `SELECT to_char(date_trunc('month', spent_on), 'YYYY-MM') AS mes, alias, SUM(hours)::float AS horas, COUNT(*)::int AS cargas
         FROM taskpilot.time_entries WHERE spent_on >= $1::date GROUP BY 1, 2 ORDER BY 1 DESC`, [desde]);
    const accounts = (await store.getAccounts()).map((a) => a.alias);
    const byMes = {};
    for (let n = 0; n < months; n++) {
      const mes = mesDesde(n).slice(0, 7);
      byMes[mes] = { mes, total: 0, cargas: 0, por_alias: Object.fromEntries(accounts.map((a) => [a, { horas: 0, cargas: 0 }])) };
    }
    for (const r of rows) {
      const m = byMes[r.mes]; if (!m) continue;
      m.por_alias[r.alias] = { horas: r.horas, cargas: r.cargas };
      m.total += r.horas; m.cargas += r.cargas;
    }
    const { rows: [tot] } = await db.query(`SELECT COALESCE(SUM(hours), 0)::float AS horas, COUNT(*)::int AS cargas, MIN(spent_on)::text AS primera, MAX(spent_on)::text AS ultima FROM taskpilot.time_entries`);
    const { rows: totAlias } = await db.query(`SELECT alias, SUM(hours)::float AS horas, COUNT(*)::int AS cargas FROM taskpilot.time_entries GROUP BY alias`);
    res.json({ accounts, months: Object.values(byMes), historico: { ...tot, por_alias: Object.fromEntries(totAlias.map((r) => [r.alias, { horas: r.horas, cargas: r.cargas }])) }, periodos: periodos() });
  } catch (e) { next(e); }
});

// GET /hours/entries?mes=YYYY-MM | from=&to= ; alias=; project=; limit=; offset=
router.get('/hours/entries', async (req, res, next) => {
  try {
    const q = req.query;
    let from = q.from, to = q.to;
    if (q.mes && /^\d{4}-\d{2}$/.test(q.mes)) {
      const [y, m] = q.mes.split('-').map(Number);
      from = `${q.mes}-01`;
      to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // ultimo dia del mes
    }
    if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) return res.status(400).json({ error: 'Indicá mes=YYYY-MM o from/to' });
    const where = ['t.spent_on >= $1::date', 't.spent_on <= $2::date'];
    const params = [from, to];
    if (q.alias) { params.push(q.alias); where.push(`t.alias = $${params.length}`); }
    if (num(q.project)) { params.push(num(q.project)); where.push(`t.project_id = $${params.length}`); }
    const W = where.join(' AND ');
    const { rows: byProject } = await db.query(
      `SELECT t.project_id, COALESCE(t.project_name, '(sin proyecto)') AS project_name, t.alias, SUM(t.hours)::float AS horas, COUNT(*)::int AS cargas
         FROM taskpilot.time_entries t WHERE ${W} GROUP BY 1, 2, 3 ORDER BY 2, 3`, params);
    const { rows: byAlias } = await db.query(
      `SELECT t.alias, SUM(t.hours)::float AS horas, COUNT(*)::int AS cargas FROM taskpilot.time_entries t WHERE ${W} GROUP BY 1`, params);
    const { rows: byActivity } = await db.query(
      `SELECT COALESCE(t.activity, '-') AS activity, t.alias, SUM(t.hours)::float AS horas FROM taskpilot.time_entries t WHERE ${W} GROUP BY 1, 2 ORDER BY 1`, params);
    const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500);
    const offset = Math.max(Number(q.offset) || 0, 0);
    params.push(limit, offset);
    const { rows: items } = await db.query(
      `SELECT t.id, t.alias, t.spent_on::text AS spent_on, t.issue_id, i.subject AS issue_subject, COALESCE(t.project_name, i.project_name) AS project_name,
              t.activity, t.hours::float AS hours, t.comments, COUNT(*) OVER() AS total
         FROM taskpilot.time_entries t LEFT JOIN taskpilot.issues i ON i.id = t.issue_id
        WHERE ${W} ORDER BY t.spent_on DESC, t.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    const total = items.length ? Number(items[0].total) : 0;
    res.json({ from, to, total, limit, offset, items: items.map(({ total: _t, ...r }) => r), by_project: byProject, by_alias: byAlias, by_activity: byActivity });
  } catch (e) { next(e); }
});

// ── contexto para Claude (global y por repositorio) ───────────────────
router.get('/contexts', async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT key, contenido, updated_by, updated_at FROM taskpilot.contexts ORDER BY key`);
    const { rows: runners } = await db.query(`SELECT repos FROM taskpilot.runners WHERE activo`);
    const repoNames = new Set();
    for (const r of runners) for (const x of (Array.isArray(r.repos) ? r.repos : [])) if (x?.name) repoNames.add(x.name);
    for (const r of rows) if (r.key.startsWith('repo:')) repoNames.add(r.key.slice(5));
    res.json({ items: rows, repos: [...repoNames].sort() });
  } catch (e) { next(e); }
});

router.put('/contexts/:key', async (req, res, next) => {
  try {
    const key = String(req.params.key || '').trim();
    if (!(key === 'global' || /^repo:[\w.@-]{1,120}$/.test(key))) return res.status(400).json({ error: 'Clave inválida: usá global o repo:<nombre>' });
    const contenido = String(req.body?.contenido ?? '');
    if (contenido.length > 60000) return res.status(400).json({ error: 'El contexto supera los 60.000 caracteres' });
    const { rows: [row] } = await db.query(
      `INSERT INTO taskpilot.contexts (key, contenido, updated_by, updated_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET contenido = EXCLUDED.contenido, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING key, contenido, updated_by, updated_at`, [key, contenido, req.user.email]);
    await audit(req, 'context_save', 0, { key, chars: contenido.length });
    res.json(row);
  } catch (e) { next(e); }
});

// ── catalogos ─────────────────────────────────────────────────────────
router.get('/catalogs', async (req, res, next) => {
  try {
    const { rows: cat } = await db.query(
      `SELECT tipo, id, nombre, extra FROM taskpilot.redmine_catalogs WHERE activo
        ORDER BY tipo, (extra->>'position')::int NULLS LAST, nombre`);
    const by = (tipo) => cat.filter((c) => c.tipo === tipo).map(({ tipo: _t, ...c }) => c);
    // Solo los proyectos que tienen tareas del equipo (y sus padres, para mostrar la jerarquia).
    const { rows: projects } = await db.query(
      `SELECT id, identifier, name, parent_id, visible_to FROM taskpilot.redmine_projects
        WHERE id IN (SELECT DISTINCT project_id FROM taskpilot.issues)
           OR id IN (SELECT DISTINCT p.parent_id FROM taskpilot.redmine_projects p
                      WHERE p.id IN (SELECT DISTINCT project_id FROM taskpilot.issues) AND p.parent_id IS NOT NULL)
        ORDER BY name`);
    const accounts = await store.getAccounts();
    res.json({
      projects, statuses: by('status'), trackers: by('tracker'), priorities: by('priority'),
      activities: by('activity'), users: by('user').sort((a, b) => a.nombre.localeCompare(b.nombre)),
      accounts, etapas: store.ETAPAS.map((e) => ({ id: e, nombre: store.ETAPA_LABEL[e] })),
    });
  } catch (e) { next(e); }
});

// ── listado ───────────────────────────────────────────────────────────
function buildIssuesQuery(q) {
  const where = [];
  const params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('$?', `$${params.length}`)); };

  if (q.assigned === 'none') where.push('i.assigned_to_id IS NULL');
  else if (q.assigned === 'team') where.push(`i.assigned_to_id IN (SELECT redmine_user_id FROM taskpilot.redmine_accounts WHERE activo AND redmine_user_id IS NOT NULL)`);
  else if (q.assigned && /^\d+$/.test(q.assigned)) add('i.assigned_to_id = $?', Number(q.assigned));
  else if (q.assigned) add('i.assigned_to_id = (SELECT redmine_user_id FROM taskpilot.redmine_accounts WHERE alias = $?)', q.assigned);

  if (num(q.project)) {
    params.push(num(q.project));
    where.push(`(i.project_id = $${params.length} OR i.project_id IN (SELECT id FROM taskpilot.redmine_projects WHERE parent_id = $${params.length}))`);
  }
  if (num(q.status)) add('i.status_id = $?', num(q.status));
  else if (q.status_group === 'closed') where.push('i.is_closed');
  else if (q.status_group !== 'all') where.push('NOT i.is_closed');
  if (num(q.tracker)) add('i.tracker_id = $?', num(q.tracker));
  if (num(q.priority)) add('i.priority_id = $?', num(q.priority));
  if (q.estimar === '1') where.push(`i.status_id IN ${ESTIMAR_SQL}`);
  else if (q.estimar === '0') where.push(`i.status_id NOT IN ${ESTIMAR_SQL}`);
  if (q.from && DATE_RE.test(q.from)) add('i.updated_on >= $?::date', q.from);
  if (q.to && DATE_RE.test(q.to)) add('i.updated_on < ($?::date + 1)', q.to);
  if (q.created_from && DATE_RE.test(q.created_from)) add('i.created_on >= $?::date', q.created_from);
  if (q.created_to && DATE_RE.test(q.created_to)) add('i.created_on < ($?::date + 1)', q.created_to);
  if (q.etapa && store.ETAPAS.includes(q.etapa)) add(`COALESCE(t.etapa, 'pendiente') = $?`, q.etapa);
  if (q.visible) add('jsonb_exists(i.visible_to, $?)', q.visible);
  if (q.q && String(q.q).trim()) {
    const text = String(q.q).trim();
    const idMatch = text.match(/^#?(\d+)$/);
    params.push(`%${text}%`);
    const like = `$${params.length}`;
    if (idMatch) {
      params.push(Number(idMatch[1]));
      where.push(`(i.id = $${params.length} OR i.subject ILIKE ${like})`);
    } else {
      where.push(`(i.subject ILIKE ${like} OR i.description ILIKE ${like})`);
    }
  }

  const sorts = {
    updated: 'i.updated_on DESC NULLS LAST',
    created: 'i.created_on DESC NULLS LAST',
    created_asc: 'i.created_on ASC NULLS LAST',
    priority: `(pr.extra->>'position')::int DESC NULLS LAST, i.created_on DESC NULLS LAST`,
    due: 'i.due_date ASC NULLS LAST, i.created_on DESC',
    id: 'i.id DESC',
  };
  const order = sorts[q.sort] || sorts.updated;
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
  const offset = Math.max(Number(q.offset) || 0, 0);
  params.push(limit, offset);

  const sql = `
    SELECT i.id, i.project_id, i.project_name, i.tracker_id, i.tracker, i.status_id, i.status, i.is_closed,
           i.priority_id, i.priority, i.author, i.assigned_to_id, i.assigned_to, i.subject,
           i.start_date::text AS start_date, i.due_date::text AS due_date,
           i.done_ratio, i.estimated_hours, i.spent_hours, i.created_on, i.updated_on, i.visible_to,
           COALESCE(t.etapa, 'pendiente') AS etapa, t.owner_alias,
           COALESCE(th.horas, '{}'::jsonb) AS horas_equipo,
           COUNT(*) OVER() AS total
      FROM taskpilot.issues i
      LEFT JOIN taskpilot.task_state t ON t.issue_id = i.id
      LEFT JOIN taskpilot.redmine_catalogs pr ON pr.tipo = 'priority' AND pr.id = i.priority_id
      LEFT JOIN LATERAL (
        SELECT jsonb_object_agg(x.alias, x.h) AS horas
          FROM (SELECT te.alias, SUM(te.hours)::float AS h FROM taskpilot.time_entries te WHERE te.issue_id = i.id GROUP BY te.alias) x
      ) th ON TRUE
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY ${order}
     LIMIT $${params.length - 1} OFFSET $${params.length}`;
  return { sql, params, limit, offset };
}

router.get('/issues', async (req, res, next) => {
  try {
    const { sql, params, limit, offset } = buildIssuesQuery(req.query);
    const { rows } = await db.query(sql, params);
    const total = rows.length ? Number(rows[0].total) : 0;
    res.json({ total, limit, offset, items: rows.map(({ total: _t, ...r }) => r) });
  } catch (e) { next(e); }
});

// ── detalle ───────────────────────────────────────────────────────────
async function loadIssue(id) {
  const { rows: [issue] } = await db.query(
    `SELECT i.id, i.project_id, i.project_name, i.tracker_id, i.tracker, i.status_id, i.status, i.is_closed,
            i.priority_id, i.priority, i.author_id, i.author, i.assigned_to_id, i.assigned_to, i.subject, i.description,
            i.start_date::text AS start_date, i.due_date::text AS due_date,
            i.done_ratio, i.estimated_hours, i.spent_hours, i.fixed_version, i.parent_id,
            i.custom_fields, i.visible_to, i.created_on, i.updated_on, i.closed_on, i.synced_at,
            COALESCE(t.etapa, 'pendiente') AS etapa, t.owner_alias, t.repo, t.model, t.notas AS etapa_notas,
            t.updated_by AS etapa_updated_by, t.updated_at AS etapa_updated_at
       FROM taskpilot.issues i LEFT JOIN taskpilot.task_state t ON t.issue_id = i.id
      WHERE i.id = $1`, [id]);
  if (!issue) return null;
  const { rows: journals } = await db.query(
    `SELECT id, user_id, user_name, notes, details, private_notes, created_on
       FROM taskpilot.issue_journals WHERE issue_id = $1 ORDER BY created_on, id`, [id]);
  const { rows: time_entries } = await db.query(
    `SELECT id, alias, user_name, activity, hours::float AS hours, comments, spent_on::text AS spent_on
       FROM taskpilot.time_entries WHERE issue_id = $1 ORDER BY spent_on DESC, id DESC`, [id]);
  const horas_equipo = {};
  for (const t of time_entries) horas_equipo[t.alias] = (horas_equipo[t.alias] || 0) + Number(t.hours || 0);
  return { issue, journals, time_entries, horas_equipo };
}

// ── PDF de la tarea ───────────────────────────────────────────────────
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtHoras = (h) => {
  const total = Math.round(Number(h || 0) * 60);
  if (!total) return '0 min';
  const hh = Math.floor(total / 60), mm = total % 60;
  return [hh ? `${hh} h` : '', mm ? `${mm} min` : ''].filter(Boolean).join(' ');
};
const fmtFecha = (d) => (d ? new Date(d).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }) : '-');
const fmtDia = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('es-AR') : '-');

function issuePdfHtml({ issue: i, journals, time_entries, horas_equipo }) {
  const cfs = (i.custom_fields || []).filter((c) => c.value !== '' && c.value !== null && !(Array.isArray(c.value) && !c.value.length));
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
  const notas = journals.filter((j) => j.notes && j.notes.trim());
  const totalEquipo = Object.values(horas_equipo).reduce((a, b) => a + b, 0);
  // Fragmento: el renderizador lo envuelve en su propio <html><body>.
  return `<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;font-size:11.5px;line-height:1.45;margin:0}
  h1{font-size:18px;margin:0 0 4px}
  .sub{color:#555;font-size:11px;margin-bottom:14px}
  h2{font-size:12.5px;margin:18px 0 6px;padding-bottom:3px;border-bottom:1px solid #999;text-transform:uppercase;letter-spacing:.6px;color:#333}
  table{width:100%;border-collapse:collapse}
  td,th{padding:4px 6px;vertical-align:top;border-bottom:1px solid #ddd;text-align:left}
  th{background:#f0f0f0;font-weight:600;font-size:10.5px}
  .meta td:first-child{color:#555;width:28%}
  .desc{white-space:pre-wrap;word-break:break-word;background:#fafafa;border:1px solid #ddd;padding:10px;border-radius:4px}
  .nota{margin-bottom:8px;padding-left:8px;border-left:2px solid #bbb}
  .nota .who{color:#555;font-size:10px}
  .nota .txt{white-space:pre-wrap}
  .foot{margin-top:18px;color:#777;font-size:9.5px;border-top:1px solid #ddd;padding-top:6px}
</style>
<h1>#${i.id} · ${escHtml(i.subject)}</h1>
<div class="sub">${escHtml(i.project_name || '')} · ${escHtml(i.tracker || '')} · Estado: ${escHtml(i.status || '')} · Prioridad: ${escHtml(i.priority || '')}</div>
<table class="meta">
  <tr><td>Autor</td><td>${escHtml(i.author || '-')}</td></tr>
  <tr><td>Asignada a</td><td>${escHtml(i.assigned_to || 'Sin asignar')}</td></tr>
  <tr><td>Creada</td><td>${escHtml(fmtFecha(i.created_on))}</td></tr>
  <tr><td>Actualizada</td><td>${escHtml(fmtFecha(i.updated_on))}</td></tr>
  <tr><td>Inicio / Vencimiento</td><td>${escHtml(fmtDia(i.start_date))} / ${escHtml(fmtDia(i.due_date))}</td></tr>
  <tr><td>Horas estimadas / cargadas</td><td>${i.estimated_hours != null ? escHtml(fmtHoras(i.estimated_hours)) : '-'} / ${i.spent_hours != null ? escHtml(fmtHoras(i.spent_hours)) : '-'}</td></tr>
  <tr><td>% realizado</td><td>${i.done_ratio ?? 0}%</td></tr>
  ${i.fixed_version ? `<tr><td>Versión</td><td>${escHtml(i.fixed_version)}</td></tr>` : ''}
  <tr><td>Etapa en TaskPilot</td><td>${escHtml(store.ETAPA_LABEL[i.etapa] || i.etapa || '-')}</td></tr>
</table>
<h2>Descripción</h2>
<div class="desc">${i.description && i.description.trim() ? escHtml(i.description) : '(sin descripción)'}</div>
${cfs.length ? `<h2>Campos de Redmine</h2><table class="meta">${cfs.map((c) => `<tr><td>${escHtml(c.name)}</td><td>${escHtml(Array.isArray(c.value) ? c.value.join(', ') : c.value)}</td></tr>`).join('')}</table>` : ''}
<h2>Notas del historial (${notas.length})</h2>
${notas.length ? notas.map((j) => `<div class="nota"><div class="who">${escHtml(j.user_name || '')} · ${escHtml(fmtFecha(j.created_on))}</div><div class="txt">${escHtml(j.notes)}</div></div>`).join('') : '<div>Sin notas</div>'}
<h2>Horas cargadas por el equipo (${escHtml(fmtHoras(totalEquipo))})</h2>
${time_entries.length ? `<table><tr><th>Fecha</th><th>Quién</th><th>Actividad</th><th>Horas</th><th>Comentario</th></tr>${time_entries.map((t) => `<tr><td>${escHtml(fmtDia(t.spent_on))}</td><td>${escHtml(cap(t.alias))}</td><td>${escHtml(t.activity || '')}</td><td>${escHtml(fmtHoras(t.hours))}</td><td>${escHtml(t.comments || '')}</td></tr>`).join('')}</table>` : '<div>Sin horas cargadas por Santi ni Gabi</div>'}
<div class="foot">Generado por TaskPilot el ${escHtml(fmtFecha(new Date()))} · ${escHtml(redmine.issueUrl(i.id))}</div>`;
}

router.get('/issues/:id/pdf', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = await loadIssue(id);
    if (!data) return res.status(404).json({ error: 'Tarea no encontrada' });
    const out = await HTMLtoPDFRenderer.render(issuePdfHtml(data), { format: 'A4' });
    const buf = Buffer.isBuffer(out) ? out : Buffer.from(out);
    const nombre = `${id} - ${String(data.issue.subject).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nombre)}`);
    res.send(buf);
  } catch (e) { next(e); }
});

router.get('/issues/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    let data = await loadIssue(id);
    let refreshed = false, refreshError = null;
    if (req.query.cached !== '1' || !data) {
      const viewer = await viewerAccount(req, data?.issue);
      if (viewer) {
        try {
          const fresh = await redmine.getIssue(viewer.apiKey, id);
          await sync.upsertIssue(fresh, viewer.alias);
          data = await loadIssue(id);
          refreshed = true;
        } catch (e) {
          refreshError = e.message;
          if (!data) return res.status(e.status === 404 ? 404 : 502).json({ error: e.message });
        }
      }
    }
    if (!data) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json({ ...data, refreshed, refreshError, url: redmine.issueUrl(id) });
  } catch (e) { next(e); }
});

// ── cambio de estado en Redmine ───────────────────────────────────────
router.patch('/issues/:id/status', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status_id, notes, as, confirm_close } = req.body || {};
    if (!Number.isInteger(id) || !num(status_id)) return res.status(400).json({ error: 'status_id es requerido' });
    const { rows: [target] } = await db.query(
      `SELECT id, nombre, (extra->>'is_closed')::boolean AS is_closed FROM taskpilot.redmine_catalogs WHERE tipo = 'status' AND id = $1`,
      [num(status_id)]);
    if (!target) return res.status(400).json({ error: 'Estado desconocido' });
    if (target.is_closed && !confirm_close) {
      return res.status(400).json({ error: `"${target.nombre}" cierra la tarea: hace falta confirmarlo explícitamente`, needs_confirm: true });
    }
    const before = await loadIssue(id);
    if (!before) return res.status(404).json({ error: 'Tarea no encontrada; sincronizá primero' });
    const acting = await resolveActingAccount(req, as);
    if (acting.error) return res.status(403).json({ error: acting.error });

    const fields = { status_id: target.id };
    if (notes && String(notes).trim()) fields.notes = String(notes).trim();
    await redmine.updateIssue(acting.account.apiKey, id, fields);
    const fresh = await redmine.getIssue(acting.account.apiKey, id);
    await sync.upsertIssue(fresh, acting.account.alias);
    await audit(req, 'redmine_status', id, {
      as: acting.account.alias, from: before.issue.status_id, to: target.id, to_name: target.nombre, notes: fields.notes || null,
    });
    const data = await loadIssue(id);
    res.json({ ...data, url: redmine.issueUrl(id) });
  } catch (e) {
    if (e instanceof redmine.RedmineError) return res.status(e.status >= 400 && e.status < 600 ? e.status : 502).json({ error: e.message });
    next(e);
  }
});

// ── etapa del pipeline (local) ────────────────────────────────────────
router.patch('/issues/:id/etapa', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { etapa, owner_alias, notas } = req.body || {};
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    if (!store.ETAPAS.includes(etapa)) return res.status(400).json({ error: 'Etapa inválida' });
    const { rows } = await db.query(
      `INSERT INTO taskpilot.task_state (issue_id, etapa, owner_alias, notas, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (issue_id) DO UPDATE SET etapa = EXCLUDED.etapa,
         owner_alias = COALESCE(EXCLUDED.owner_alias, taskpilot.task_state.owner_alias),
         notas = COALESCE(EXCLUDED.notas, taskpilot.task_state.notas),
         updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING *`,
      [id, etapa, owner_alias || null, notas ?? null, req.user.email]);
    if (!rows.length) return res.status(404).json({ error: 'Tarea no encontrada' });
    await audit(req, 'etapa', id, { etapa, owner_alias: owner_alias || null });
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23503') return res.status(404).json({ error: 'Tarea no encontrada; sincronizá primero' });
    next(e);
  }
});

// ── cuentas ───────────────────────────────────────────────────────────
router.get('/accounts', async (req, res, next) => {
  try {
    const accounts = await store.getAccounts({ onlyActive: false });
    const { rows: users } = await db.query(`SELECT id, email, nombre FROM admin_core.users WHERE activo ORDER BY email`);
    res.json({ accounts, users, me: req.user.id });
  } catch (e) { next(e); }
});

router.patch('/accounts/:alias', requireAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    const fields = {};
    if (b.user_id !== undefined) fields.user_id = b.user_id === null || b.user_id === '' ? null : Number(b.user_id);
    if (b.activo !== undefined) fields.activo = Boolean(b.activo);
    await store.updateAccount(req.params.alias, fields);
    const accounts = await store.getAccounts({ onlyActive: false });
    const acc = accounts.find((a) => a.alias === req.params.alias);
    if (!acc) return res.status(404).json({ error: 'Cuenta no encontrada' });
    res.json(acc);
  } catch (e) { next(e); }
});

module.exports = router;
