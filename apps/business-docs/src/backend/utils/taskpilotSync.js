// Sincronizacion Redmine -> taskpilot.issues (solo lecturas contra Redmine).
//
// Alcance: SOLO las tareas asignadas a las cuentas configuradas (Santi y Gabi), en cualquier
// estado (pendientes, a estimar, en progreso, resueltas y cerradas). Las de otras personas no
// se guardan, y si una tarea deja de estar asignada al equipo se borra de la base local.
//
// - Un worker in-process corre cada TASKPILOT_SYNC_MINUTES (45 por defecto) y tambien se
//   dispara a mano desde el tablero (POST /api/taskpilot/sync). Si ya hay una corrida en
//   curso, se reutiliza en vez de arrancar otra.
// - Completa (una vez por dia, al primer arranque o con full=true): por cada cuenta pide a
//   Redmine "assigned_to_id=me" con status_id=*; al final borra lo que no volvio a aparecer.
// - Incremental: pide las issues visibles con updated_on >= inicio de la ultima corrida exitosa
//   menos 15 min de solapamiento, guarda las asignadas al equipo y borra las que se reasignaron.
// - Por cada cuenta se consultan proyectos e issues con su propia key, y se registra en
//   visible_to quien ve cada una. Los catalogos (estados, tipos, prioridades, actividades) se
//   leen con la primera cuenta que responda.
// - Cada corrida deja una fila en taskpilot.sync_log con el detalle por cuenta.

const db = require('./db');
const log = require('./logger');
const redmine = require('./redmine');
const store = require('./taskpilotDb');

const SYNC_MIN = Number(process.env.TASKPILOT_SYNC_MINUTES) || 45;
const OVERLAP_MS = 15 * 60 * 1000;
const FULL_EVERY_MS = 24 * 60 * 60 * 1000;

let inflight = null;
let nextRunAt = null;
let closedStatusIds = new Set();

// ── catalogos ────────────────────────────────────────────────────────
async function upsertCatalog(tipo, items, extraOf) {
  await db.query(`UPDATE taskpilot.redmine_catalogs SET activo = FALSE WHERE tipo = $1`, [tipo]);
  for (const [i, it] of items.entries()) {
    await db.query(
      `INSERT INTO taskpilot.redmine_catalogs (tipo, id, nombre, extra, activo, synced_at)
       VALUES ($1, $2, $3, $4::jsonb, TRUE, NOW())
       ON CONFLICT (tipo, id) DO UPDATE SET nombre = EXCLUDED.nombre, extra = EXCLUDED.extra, activo = TRUE, synced_at = NOW()`,
      [tipo, it.id, it.name, JSON.stringify({ position: i, ...(extraOf ? extraOf(it) : {}) })]
    );
  }
}

async function loadClosedStatuses() {
  const { rows } = await db.query(
    `SELECT id FROM taskpilot.redmine_catalogs WHERE tipo = 'status' AND (extra->>'is_closed')::boolean`);
  closedStatusIds = new Set(rows.map((r) => r.id));
}

async function syncCatalogs(apiKey) {
  const [statuses, trackers, priorities, activities] = await Promise.all([
    redmine.listStatuses(apiKey), redmine.listTrackers(apiKey),
    redmine.listPriorities(apiKey), redmine.listTimeEntryActivities(apiKey),
  ]);
  await upsertCatalog('status', statuses, (s) => ({ is_closed: Boolean(s.is_closed), is_default: Boolean(s.is_default) }));
  await upsertCatalog('tracker', trackers, (t) => ({ default_status_id: t.default_status?.id ?? null }));
  await upsertCatalog('priority', priorities, (p) => ({ is_default: Boolean(p.is_default) }));
  await upsertCatalog('activity', activities, (a) => ({ is_default: Boolean(a.is_default) }));
  await loadClosedStatuses();
  return { statuses: statuses.length, trackers: trackers.length, priorities: priorities.length, activities: activities.length };
}

async function upsertUsers(users) {
  for (const [id, name] of users) {
    await db.query(
      `INSERT INTO taskpilot.redmine_catalogs (tipo, id, nombre) VALUES ('user', $1, $2)
       ON CONFLICT (tipo, id) DO UPDATE SET nombre = EXCLUDED.nombre, activo = TRUE, synced_at = NOW()`,
      [id, name]);
  }
}

// ── proyectos ────────────────────────────────────────────────────────
async function syncProjects(account) {
  const projects = await redmine.listProjects(account.apiKey);
  for (const p of projects) {
    await db.query(
      `INSERT INTO taskpilot.redmine_projects (id, identifier, name, parent_id, status, visible_to, raw, updated_on, synced_at)
       VALUES ($1, $2, $3, $4, $5, to_jsonb(ARRAY[$6::text]), $7::jsonb, $8, NOW())
       ON CONFLICT (id) DO UPDATE SET identifier = EXCLUDED.identifier, name = EXCLUDED.name, parent_id = EXCLUDED.parent_id,
         status = EXCLUDED.status, raw = EXCLUDED.raw, updated_on = EXCLUDED.updated_on, synced_at = NOW(),
         visible_to = CASE WHEN taskpilot.redmine_projects.visible_to ? $6 THEN taskpilot.redmine_projects.visible_to
                           ELSE taskpilot.redmine_projects.visible_to || to_jsonb(ARRAY[$6::text]) END`,
      [p.id, p.identifier, p.name, p.parent?.id ?? null, p.status ?? null, account.alias,
       JSON.stringify({ description: p.description || '', is_public: p.is_public ?? null }), p.updated_on || null]
    );
  }
  return projects.length;
}

// ── issues ───────────────────────────────────────────────────────────
const ISSUE_UPSERT = `
  WITH up AS (
    INSERT INTO taskpilot.issues (id, project_id, project_name, tracker_id, tracker, status_id, status, is_closed,
      priority_id, priority, author_id, author, assigned_to_id, assigned_to, subject, description, start_date, due_date,
      done_ratio, estimated_hours, spent_hours, fixed_version, parent_id, custom_fields, visible_to, raw,
      created_on, updated_on, closed_on, synced_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,
      to_jsonb(ARRAY[$25::text]), $26::jsonb, $27, $28, $29, NOW())
    ON CONFLICT (id) DO UPDATE SET
      project_id = EXCLUDED.project_id, project_name = EXCLUDED.project_name, tracker_id = EXCLUDED.tracker_id,
      tracker = EXCLUDED.tracker, status_id = EXCLUDED.status_id, status = EXCLUDED.status, is_closed = EXCLUDED.is_closed,
      priority_id = EXCLUDED.priority_id, priority = EXCLUDED.priority, author_id = EXCLUDED.author_id, author = EXCLUDED.author,
      assigned_to_id = EXCLUDED.assigned_to_id, assigned_to = EXCLUDED.assigned_to, subject = EXCLUDED.subject,
      description = EXCLUDED.description, start_date = EXCLUDED.start_date, due_date = EXCLUDED.due_date,
      done_ratio = EXCLUDED.done_ratio, estimated_hours = EXCLUDED.estimated_hours, spent_hours = EXCLUDED.spent_hours,
      fixed_version = EXCLUDED.fixed_version, parent_id = EXCLUDED.parent_id, custom_fields = EXCLUDED.custom_fields,
      raw = EXCLUDED.raw, created_on = EXCLUDED.created_on, updated_on = EXCLUDED.updated_on, closed_on = EXCLUDED.closed_on,
      synced_at = NOW(),
      visible_to = CASE WHEN taskpilot.issues.visible_to ? $25 THEN taskpilot.issues.visible_to
                        ELSE taskpilot.issues.visible_to || to_jsonb(ARRAY[$25::text]) END
    RETURNING id
  )
  INSERT INTO taskpilot.task_state (issue_id) SELECT id FROM up ON CONFLICT (issue_id) DO NOTHING`;

function issueParams(i, alias) {
  return [
    i.id, i.project?.id ?? null, i.project?.name ?? null, i.tracker?.id ?? null, i.tracker?.name ?? null,
    i.status?.id ?? null, i.status?.name ?? null, Boolean(i.status?.is_closed) || closedStatusIds.has(i.status?.id),
    i.priority?.id ?? null, i.priority?.name ?? null, i.author?.id ?? null, i.author?.name ?? null,
    i.assigned_to?.id ?? null, i.assigned_to?.name ?? null, i.subject || '(sin título)', i.description ?? null,
    i.start_date || null, i.due_date || null, i.done_ratio ?? null, i.estimated_hours ?? null, i.spent_hours ?? null,
    i.fixed_version?.name ?? null, i.parent?.id ?? null, JSON.stringify(i.custom_fields || []), alias,
    JSON.stringify(i), i.created_on || null, i.updated_on || null, i.closed_on || null,
  ];
}

// Guarda una issue (lista o detalle) y sus journals si vienen. Usado por el sync y por las rutas.
async function upsertIssue(issue, alias, client = db) {
  if (!closedStatusIds.size) await loadClosedStatuses();
  await client.query(ISSUE_UPSERT, issueParams(issue, alias));
  if (Array.isArray(issue.journals)) {
    for (const j of issue.journals) {
      await client.query(
        `INSERT INTO taskpilot.issue_journals (id, issue_id, user_id, user_name, notes, details, private_notes, created_on)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
         ON CONFLICT (id) DO UPDATE SET notes = EXCLUDED.notes, details = EXCLUDED.details, private_notes = EXCLUDED.private_notes`,
        [j.id, issue.id, j.user?.id ?? null, j.user?.name ?? null, j.notes ?? null,
         JSON.stringify(j.details || []), Boolean(j.private_notes), j.created_on || null]
      );
    }
  }
}

// since = null: pasada completa (solo "mis" tareas). since = Date: incremental sobre lo visible,
// quedandose con las asignadas al equipo (teamIds) y borrando las que ya no lo estan.
async function syncIssues(account, since, users, teamIds) {
  let count = 0, dropped = 0;
  const { total } = await redmine.listIssues(account.apiKey, {
    updatedSince: since,
    assignedTo: since ? undefined : 'me',
    onPage: async (items) => {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const toDrop = [];
        for (const i of items) {
          if (!teamIds.has(i.assigned_to?.id)) { toDrop.push(i.id); continue; }
          await upsertIssue(i, account.alias, client);
          if (i.author?.id) users.set(i.author.id, i.author.name);
          if (i.assigned_to?.id) users.set(i.assigned_to.id, i.assigned_to.name);
          count++;
        }
        if (toDrop.length) {
          const { rowCount } = await client.query(`DELETE FROM taskpilot.issues WHERE id = ANY($1::int[])`, [toDrop]);
          dropped += rowCount;
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  });
  return { count, total, dropped };
}

// ── horas cargadas (time entries de cada cuenta) ─────────────────────
// Completa: todas las horas del usuario. Incremental: se vuelven a leer los ultimos 90 dias
// (Redmine filtra por fecha de imputacion, no por fecha de modificacion).
const TE_WINDOW_DAYS = 90;

async function syncTimeEntries(account, full, runStart) {
  const from = full ? undefined : new Date(Date.now() - TE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  let count = 0;
  const { total } = await redmine.listTimeEntries(account.apiKey, {
    userId: 'me', from,
    onPage: async (items) => {
      for (const t of items) {
        await db.query(
          `INSERT INTO taskpilot.time_entries (id, alias, user_id, user_name, issue_id, project_id, project_name, activity_id, activity,
             hours, comments, spent_on, created_on, updated_on, synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
           ON CONFLICT (id) DO UPDATE SET alias = EXCLUDED.alias, user_id = EXCLUDED.user_id, user_name = EXCLUDED.user_name,
             issue_id = EXCLUDED.issue_id, project_id = EXCLUDED.project_id, project_name = EXCLUDED.project_name,
             activity_id = EXCLUDED.activity_id, activity = EXCLUDED.activity, hours = EXCLUDED.hours, comments = EXCLUDED.comments,
             spent_on = EXCLUDED.spent_on, created_on = EXCLUDED.created_on, updated_on = EXCLUDED.updated_on, synced_at = NOW()`,
          [t.id, account.alias, t.user?.id ?? null, t.user?.name ?? null, t.issue?.id ?? null, t.project?.id ?? null, t.project?.name ?? null,
           t.activity?.id ?? null, t.activity?.name ?? null, Number(t.hours) || 0, t.comments ?? null, t.spent_on || null,
           t.created_on || null, t.updated_on || null]);
        count++;
      }
    },
  });
  // Lo que no volvio a aparecer en el rango leido se borro en Redmine.
  const { rowCount } = full
    ? await db.query(`DELETE FROM taskpilot.time_entries WHERE alias = $1 AND synced_at < $2`, [account.alias, runStart])
    : await db.query(`DELETE FROM taskpilot.time_entries WHERE alias = $1 AND spent_on >= $2::date AND synced_at < $3`, [account.alias, from, runStart]);
  return { count, total, dropped: rowCount };
}

// ── corrida ──────────────────────────────────────────────────────────
async function doRun(trigger, fullRequested) {
  const started = Date.now();
  const { rows: [row] } = await db.query(`INSERT INTO taskpilot.sync_log (trigger) VALUES ($1) RETURNING id`, [trigger]);
  const detalle = { cuentas: {} };
  let ok = false, error = null, upserts = 0, full = Boolean(fullRequested);
  try {
    if (!redmine.configured()) throw new Error('REDMINE_URL no configurada');
    const accounts = await store.getAccounts({ withKeys: true });
    if (!accounts.length) throw new Error('No hay cuentas de Redmine configuradas (REDMINE_SEED_<ALIAS>_API_KEY)');

    // `since` parte del INICIO de la ultima corrida exitosa (no del fin): una corrida completa puede
    // tardar minutos y lo que cambio en Redmine mientras tanto tiene que entrar en la siguiente.
    const { rows: [prev] } = await db.query(
      `SELECT MAX(inicio) FILTER (WHERE ok) AS last_ok, MAX(fin) FILTER (WHERE ok AND full_sync) AS last_full
         FROM taskpilot.sync_log WHERE id <> $1`, [row.id]);
    if (!full && (!prev.last_ok || !prev.last_full || Date.now() - new Date(prev.last_full).getTime() > FULL_EVERY_MS)) full = true;
    const since = full ? null : new Date(new Date(prev.last_ok).getTime() - OVERLAP_MS);
    detalle.full = full;
    detalle.since = since ? since.toISOString() : null;

    // 1) Identidad de cada cuenta: hace falta conocer los ids de Redmine de todo el equipo
    //    antes de sincronizar, para quedarse solo con las tareas asignadas a ellos.
    const teamIds = new Set();
    for (const acc of accounts) {
      const c = { issues: 0, total: null, dropped: 0, projects: 0, error: null };
      detalle.cuentas[acc.alias] = c;
      try {
        const me = await redmine.currentUser(acc.apiKey);
        acc.redmine_user_id = me.id;
        teamIds.add(me.id);
        await store.updateAccount(acc.alias, {
          redmine_user_id: me.id, nombre: `${me.firstname || ''} ${me.lastname || ''}`.trim() || me.login,
          last_ok_at: new Date(), last_error: null,
        });
      } catch (e) {
        c.error = e.message;
        await store.updateAccount(acc.alias, { last_error: e.message });
        log.warn('taskpilot_sync_account_error', { alias: acc.alias, error: e.message });
      }
    }
    // 2) Catalogos, proyectos e issues por cuenta.
    let catalogsDone = false;
    const users = new Map();
    const runStart = new Date();
    for (const acc of accounts) {
      const c = detalle.cuentas[acc.alias];
      if (c.error) continue;
      try {
        if (!catalogsDone) { detalle.catalogos = await syncCatalogs(acc.apiKey); catalogsDone = true; }
        c.projects = await syncProjects(acc);
        const r = await syncIssues(acc, since, users, teamIds);
        c.issues = r.count; c.total = r.total; c.dropped = r.dropped;
        upserts += r.count;
        const { rows: [te] } = await db.query(`SELECT COUNT(*)::int AS n FROM taskpilot.time_entries WHERE alias = $1`, [acc.alias]);
        const h = await syncTimeEntries(acc, full || te.n === 0, runStart);
        c.horas = h.count; c.horas_total = h.total; c.horas_borradas = h.dropped;
      } catch (e) {
        c.error = e.message;
        await store.updateAccount(acc.alias, { last_error: e.message });
        log.warn('taskpilot_sync_account_error', { alias: acc.alias, error: e.message });
      }
    }
    await upsertUsers(users);
    const okAccounts = Object.values(detalle.cuentas).filter((c) => !c.error).length;
    ok = okAccounts > 0;
    if (!ok) error = Object.values(detalle.cuentas).map((c) => c.error).filter(Boolean).join(' | ') || 'sin cuentas válidas';
    // 3) En una pasada completa con todas las cuentas OK, lo que no volvio a aparecer ya no
    //    esta asignado al equipo (o se borro en Redmine): se saca de la base local.
    if (full && ok && okAccounts === accounts.length) {
      const { rowCount } = await db.query(`DELETE FROM taskpilot.issues WHERE synced_at < $1`, [runStart]);
      detalle.borradas = rowCount;
    }
  } catch (e) {
    error = e.message;
    log.error('taskpilot_sync_failed', { error: e.message, stack: e.stack });
  }
  const ms = Date.now() - started;
  await db.query(
    `UPDATE taskpilot.sync_log SET fin = NOW(), ok = $2, full_sync = $3, issues_upsert = $4, detalle = $5::jsonb, error = $6 WHERE id = $1`,
    [row.id, ok, full, upserts, JSON.stringify({ ...detalle, ms }), error]);
  log.info('taskpilot_sync_done', { id: row.id, trigger, ok, full, issues: upserts, ms, error: error || undefined });
  return { id: row.id, ok, full, issues: upserts, ms, detalle, error };
}

function run({ trigger = 'manual', full = false } = {}) {
  if (inflight) return inflight;
  inflight = doRun(trigger, full).finally(() => { inflight = null; });
  return inflight;
}

async function getStatus() {
  const { rows: [last] } = await db.query(
    `SELECT id, trigger, inicio, fin, ok, full_sync, issues_upsert, detalle, error
       FROM taskpilot.sync_log ORDER BY id DESC LIMIT 1`);
  const { rows: [lastOk] } = await db.query(`SELECT MAX(fin) AS fin FROM taskpilot.sync_log WHERE ok`);
  return {
    configured: redmine.configured(),
    running: Boolean(inflight),
    intervalMin: SYNC_MIN,
    nextRunAt,
    last: last || null,
    lastOkAt: lastOk?.fin || null,
    accounts: await store.getAccounts({ onlyActive: false }),
  };
}

function startWatcher() {
  if (!redmine.configured()) { log.warn('taskpilot_sync_disabled', { hint: 'configurar REDMINE_URL' }); return; }
  const period = SYNC_MIN * 60 * 1000;
  const tick = (trigger) => {
    nextRunAt = new Date(Date.now() + period).toISOString();
    run({ trigger }).catch((e) => log.warn('taskpilot_sync_tick_error', { error: e.message }));
  };
  setTimeout(() => tick('boot'), 20 * 1000);
  setInterval(() => tick('timer'), period);
  nextRunAt = new Date(Date.now() + 20 * 1000).toISOString();
}

module.exports = { run, getStatus, startWatcher, upsertIssue, loadClosedStatuses };
