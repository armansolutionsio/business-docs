// Cliente REST de Redmine para TaskPilot (REDMINE_URL). Cada llamada recibe la
// API key del usuario que actua, asi Redmine aplica sus permisos y registra la
// identidad correcta (issues visibles, cambios de estado, time entries).
//
// - Paginacion: Redmine corta en 100 por pagina; listAll recorre offset/total_count.
// - Filtros de fecha: Redmine acepta operadores en el valor ("updated_on=>=2026-11-01T10:00:00Z").
// - Errores: RedmineError con status HTTP y los mensajes de validacion de Redmine.

const BASE = (process.env.REDMINE_URL || '').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.REDMINE_TIMEOUT_MS) || 25000;
const PAGE = 100;
// Paginas de issues pedidas en paralelo durante el sync (Redmine tarda 5-8 s por pagina de 100).
const PAGE_CONCURRENCY = Math.max(1, Number(process.env.REDMINE_PAGE_CONCURRENCY) || 3);
// Traba de seguridad: Redmine es el sistema real del cliente. Toda escritura (PUT/POST/DELETE)
// queda bloqueada salvo que REDMINE_ALLOW_WRITES=true este configurado a proposito.
const ALLOW_WRITES = process.env.REDMINE_ALLOW_WRITES === 'true';

class RedmineError extends Error {
  constructor(status, message, body) {
    super(message);
    this.name = 'RedmineError';
    this.status = status;
    this.body = body;
  }
}

function configured() { return Boolean(BASE); }
function writesEnabled() { return ALLOW_WRITES; }

async function request(path, { apiKey, method = 'GET', query, body } = {}) {
  if (!BASE) throw new RedmineError(0, 'REDMINE_URL no configurada');
  if (!apiKey) throw new RedmineError(0, 'Falta la API key de Redmine');
  if (method !== 'GET' && !ALLOW_WRITES) {
    throw new RedmineError(423, 'Escritura en Redmine deshabilitada: configurar REDMINE_ALLOW_WRITES=true para permitirla');
  }
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  const headers = { 'X-Redmine-API-Key': apiKey, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path + qs, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json = null;
  if (text) { try { json = JSON.parse(text); } catch { json = null; } }
  if (!res.ok) {
    const detail = json?.errors ? json.errors.join('; ') : text.slice(0, 200);
    const msg = res.status === 401 ? 'Redmine rechazo la API key (401)'
      : res.status === 403 ? 'Sin permiso en Redmine (403)'
      : res.status === 404 ? 'No encontrado en Redmine (404)'
      : res.status === 422 ? `Redmine rechazo los datos: ${detail}`
      : `Redmine HTTP ${res.status}${detail ? ': ' + detail : ''}`;
    throw new RedmineError(res.status, msg, json || text);
  }
  return json;
}

// Recorre todas las paginas de una coleccion. `onPage` recibe cada tanda (para procesar sin
// acumular miles de issues en memoria); si no se pasa, devuelve todo. Redmine tarda varios
// segundos por pagina, asi que las paginas restantes se piden de a `concurrency` en paralelo.
async function listAll(path, { apiKey, query = {}, key, onPage, max = Infinity, concurrency = 1 } = {}) {
  const all = [];
  const handle = async (items) => { if (onPage) await onPage(items); else all.push(...items); };
  const first = await request(path, { apiKey, query: { ...query, limit: PAGE, offset: 0 } });
  const firstItems = first?.[key] || [];
  const total = Math.min(first?.total_count ?? firstItems.length, max);
  await handle(firstItems);
  const offsets = [];
  for (let o = firstItems.length; o < total && firstItems.length; o += PAGE) offsets.push(o);
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, offsets.length)) }, async () => {
    for (;;) {
      const offset = offsets.shift();
      if (offset === undefined) return;
      const page = await request(path, { apiKey, query: { ...query, limit: PAGE, offset } });
      await handle(page?.[key] || []);
    }
  });
  await Promise.all(workers);
  return { items: all, total };
}

// ── Identidad y catalogos ─────────────────────────────────────────────
const currentUser = (apiKey) => request('/users/current.json', { apiKey }).then((r) => r.user);
const listProjects = (apiKey) => listAll('/projects.json', { apiKey, key: 'projects' }).then((r) => r.items);
const listStatuses = (apiKey) => request('/issue_statuses.json', { apiKey }).then((r) => r.issue_statuses || []);
const listTrackers = (apiKey) => request('/trackers.json', { apiKey }).then((r) => r.trackers || []);
const listPriorities = (apiKey) => request('/enumerations/issue_priorities.json', { apiKey }).then((r) => r.issue_priorities || []);
const listTimeEntryActivities = (apiKey) => request('/enumerations/time_entry_activities.json', { apiKey }).then((r) => r.time_entry_activities || []);

// ── Issues ────────────────────────────────────────────────────────────
// updatedSince: Date | null. Trae todas las issues visibles para la key (abiertas y cerradas).
function listIssues(apiKey, { updatedSince = null, statusId = '*', projectId, assignedTo, onPage, concurrency = PAGE_CONCURRENCY } = {}) {
  const query = { status_id: statusId, sort: 'updated_on:desc' };
  if (updatedSince) query.updated_on = '>=' + new Date(updatedSince).toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (projectId) query.project_id = projectId;
  if (assignedTo) query.assigned_to_id = assignedTo;
  return listAll('/issues.json', { apiKey, key: 'issues', query, onPage, concurrency });
}

const getIssue = (apiKey, id, include = 'journals,attachments') =>
  request(`/issues/${id}.json`, { apiKey, query: { include } }).then((r) => r.issue);

// fields: { status_id, notes, assigned_to_id, done_ratio, ... }. Redmine devuelve 204.
const updateIssue = (apiKey, id, fields) =>
  request(`/issues/${id}.json`, { apiKey, method: 'PUT', body: { issue: fields } });

// ── Time entries (fase 3) ─────────────────────────────────────────────
function listTimeEntries(apiKey, { issueId, userId, from, to, onPage } = {}) {
  const query = {};
  if (issueId) query.issue_id = issueId;
  if (userId) query.user_id = userId;
  if (from) query.from = from;
  if (to) query.to = to;
  return listAll('/time_entries.json', { apiKey, key: 'time_entries', query, onPage });
}

// entry: { issue_id, spent_on (YYYY-MM-DD), hours, activity_id, comments }
const createTimeEntry = (apiKey, entry) =>
  request('/time_entries.json', { apiKey, method: 'POST', body: { time_entry: entry } }).then((r) => r.time_entry);

const issueUrl = (id) => `${BASE}/issues/${id}`;

module.exports = {
  RedmineError, configured, writesEnabled, request, listAll,
  currentUser, listProjects, listStatuses, listTrackers, listPriorities, listTimeEntryActivities,
  listIssues, getIssue, updateIssue, listTimeEntries, createTimeEntry, issueUrl,
};
