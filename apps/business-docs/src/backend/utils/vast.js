// Estado de la cuenta de Vast.ai para /infra (requiere VAST_API_KEY). Espejo de utils/runpod.js.
// - Live (REST, cache 5 min): credito e instancias con su costo por hora y uso de GPU. El gasto por
//   hora es la suma de las instancias prendidas; las apagadas siguen pagando el disco hasta que se
//   destruyen, y eso se informa aparte (stoppedDiskPerHr).
// - Historial (GET /charges, cache 1 h): gasto diario de los ultimos dos meses por GPU, disco y ancho
//   de banda. Vast corta los cargos por dia UTC; un cargo que abarca varios dias se prorratea por horas.
// - Alertas: mismas reglas que RunPod (credito para pocas horas, GPU prendida al 0%) mas instancias
//   apagadas que siguen pagando disco. VAST_LOW_HOURS y VAST_IDLE_ALERT_MIN toman por defecto los
//   valores de RunPod; el mail sale a GPU_ALERT_EMAIL o, si falta, a RUNPOD_ALERT_EMAIL.
// Key: console.vast.ai -> Keys -> API Keys, con permisos instance_read, user_read y billing_read.

const { requestJson } = require('./httpJson');
const { createTransporter } = require('./mailer');
const log = require('./logger');

const API_KEY = process.env.VAST_API_KEY || '';
const LOW_HOURS = Number(process.env.VAST_LOW_HOURS || process.env.RUNPOD_LOW_HOURS) || 24;
const IDLE_ALERT_MIN = Number(process.env.VAST_IDLE_ALERT_MIN || process.env.RUNPOD_IDLE_ALERT_MIN) || 30;
const ALERT_EMAIL = process.env.GPU_ALERT_EMAIL || process.env.RUNPOD_ALERT_EMAIL || '';
const LIVE_TTL_MS = 5 * 60 * 1000;
const HISTORY_TTL_MS = 60 * 60 * 1000;
const HISTORY_DAYS = 62;   // dos meses: el dashboard filtra por hoy / 7 dias / 30 dias / este mes / mes anterior
const BASE = 'https://console.vast.ai/api';
const PAGE_LIMIT = 20; // tope de paginas por consulta, por si la API no corta

const auth = { Authorization: `Bearer ${API_KEY}` };
const get = (path, timeout = 15000) => requestJson(BASE + path, { headers: auth, timeout });

// Recorre una lista paginada por cursor (next_token / after_token).
async function paged(path, field, timeout) {
  const out = [];
  let token = null;
  for (let i = 0; i < PAGE_LIMIT; i++) {
    const page = await get(path + (token ? `&after_token=${encodeURIComponent(token)}` : ''), timeout);
    out.push(...(page[field] || []));
    token = page.next_token;
    if (!token) break;
  }
  return out;
}

// instanceId -> ISO de la primera lectura con la GPU al 0%
const idleSince = new Map();

function trackIdle(instances) {
  const now = new Date().toISOString();
  const seen = new Set();
  for (const m of instances) {
    if (m.status === 'running' && m.gpuUtilPercent != null && m.gpuUtilPercent === 0) {
      seen.add(m.id);
      if (!idleSince.has(m.id)) idleSince.set(m.id, now);
    }
  }
  for (const id of idleSince.keys()) if (!seen.has(id)) idleSince.delete(id);
  for (const m of instances) m.idleSince = idleSince.get(m.id) || null;
}

const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));

async function fetchLive() {
  const [me, list] = await Promise.all([get('/v0/users/current/'), paged('/v1/instances/?limit=25', 'instances')]);
  const instances = list.map((x) => {
    const total = num(x.dph_total);
    const base = num(x.dph_base);
    return {
      id: x.id,
      name: x.label || `instancia ${x.id}`,
      status: x.actual_status || x.cur_state || null,   // running / exited / loading / offline
      gpu: x.gpu_name || null,
      gpuCount: x.num_gpus ?? 1,
      costPerHr: total,                                    // GPU + disco, lo que cobra Vast por hora
      diskPerHr: total != null && base != null ? Math.max(0, total - base) : null,
      gpuUtilPercent: num(x.gpu_util),
      diskGb: num(x.disk_space),
      diskUsedGb: num(x.disk_usage),
      spot: Boolean(x.is_bid),
      location: x.geolocation || null,
      image: x.image_uuid || null,
      startedAt: x.start_date ? new Date(x.start_date * 1000).toISOString() : null,
    };
  });
  trackIdle(instances);
  const running = instances.filter((m) => m.status === 'running');
  const stopped = instances.filter((m) => m.status !== 'running');
  return {
    // `credit` es el saldo prepago que muestra la consola; `balance` queda en 0 en cuentas prepagas
    balance: num(me.credit) ?? num(me.balance),
    totalSpend: num(me.total_spend),
    spendPerHr: running.reduce((a, m) => a + (m.costPerHr || 0), 0),
    stoppedDiskPerHr: stopped.reduce((a, m) => a + (m.diskPerHr || 0), 0),
    instances,
  };
}

// ── historial de gasto ───────────────────────────────────────────────
const TIME_ZONE = 'America/Argentina/Buenos_Aires';
const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }); // YYYY-MM-DD
const ITEM = { gpu: 'gpu', disk: 'disk', bwd: 'bandwidth', bwu: 'bandwidth' };

// Reparte un cargo [start, end] (segundos UTC) entre sus dias UTC, proporcional al tiempo.
// add(fecha del mediodia UTC de ese dia, fraccion).
function spreadByDay(start, end, add) {
  const total = Math.max(0, end - start);
  let t = start;
  for (let i = 0; i < 400; i++) {
    const dayStart = Math.floor(t / 86400) * 86400;
    const next = dayStart + 86400;
    const share = total > 0 ? (Math.min(end, next) - t) / total : 1;
    add(new Date((dayStart + 43200) * 1000), share);
    if (total === 0 || next >= end) break;
    t = next;
  }
}

async function fetchHistory() {
  const cutoff = localDay.format(new Date(Date.now() - (HISTORY_DAYS - 1) * 86400000));
  const lte = Math.floor(Date.now() / 1000);
  const gte = lte - (HISTORY_DAYS + 1) * 86400;
  const filters = encodeURIComponent(JSON.stringify({ day: { gte, lte } }));
  const rows = await paged(`/v0/charges/?select_filters=${filters}&limit=500`, 'results', 30000);
  const days = {};
  for (const r of rows) {
    const items = Array.isArray(r.items) && r.items.length ? r.items : [{ type: 'gpu', amount: r.amount }];
    for (const it of items) {
      const amount = Number(it.amount) || 0;
      if (!amount) continue;
      spreadByDay(Number(it.start ?? r.start), Number(it.end ?? r.end ?? r.start), (when, share) => {
        const date = localDay.format(when);
        if (date < cutoff) return;
        const d = days[date] || (days[date] = { date, gpu: 0, disk: 0, bandwidth: 0 });
        d[ITEM[it.type] || 'gpu'] += amount * share;
      });
    }
  }
  return { days: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)), errors: {} };
}

// ── alertas ──────────────────────────────────────────────────────────
function computeAlerts(live) {
  const alerts = [];
  if (live.balance != null && live.spendPerHr > 0) {
    const hours = live.balance / live.spendPerHr;
    if (hours < LOW_HOURS) {
      alerts.push({ key: 'low_credit', level: 'crit',
        message: `Quedan US$ ${live.balance.toFixed(2)} de crédito: alcanza para ${hours.toFixed(1)} h al gasto actual (US$ ${live.spendPerHr.toFixed(2)}/h).` });
    }
  }
  for (const m of live.instances) {
    if (m.idleSince) {
      const min = (Date.now() - new Date(m.idleSince).getTime()) / 60000;
      if (min >= IDLE_ALERT_MIN) {
        alerts.push({ key: `idle_${m.id}`, level: 'warn',
          message: `La instancia "${m.name}" está encendida con la GPU al 0% desde hace ${Math.round(min)} min (US$ ${Number(m.costPerHr).toFixed(2)}/h).` });
      }
    }
    if (m.status !== 'running' && m.diskPerHr > 0) {
      alerts.push({ key: `stopped_${m.id}`, level: 'warn',
        message: `La instancia "${m.name}" está apagada pero sigue pagando el disco (US$ ${m.diskPerHr.toFixed(3)}/h). Si no se va a usar, hay que destruirla.` });
    }
  }
  return alerts;
}

// ── cache ────────────────────────────────────────────────────────────
function cached(fn, ttl) {
  let entry = null, inflight = null;
  return (force) => {
    if (!force && entry && Date.now() - entry.ts < ttl) return Promise.resolve(entry.value);
    if (!inflight) {
      inflight = fn()
        .then((value) => { entry = { value, ts: Date.now() }; return value; })
        .finally(() => { inflight = null; });
    }
    return inflight;
  };
}

const getLive = cached(fetchLive, LIVE_TTL_MS);
const getHistory = cached(fetchHistory, HISTORY_TTL_MS);

// Lo que consume GET /api/sysmetrics (campo `gpu.vast`), con la misma forma que runpod.getStatus.
async function getStatus(force = false) {
  const settings = { lowHours: LOW_HOURS, idleAlertMin: IDLE_ALERT_MIN, alertEmail: Boolean(ALERT_EMAIL) };
  if (!API_KEY) return { configured: false, settings };
  const [live, history] = await Promise.allSettled([getLive(force), getHistory(force)]);
  if (live.status === 'rejected') log.warn('sysmetrics_vast_error', { error: live.reason?.message });
  if (history.status === 'rejected') log.warn('vast_history_error', { error: history.reason?.message });
  return {
    configured: true,
    settings,
    collectedAt: new Date().toISOString(),
    data: live.status === 'fulfilled' ? live.value : null,
    error: live.status === 'rejected' ? live.reason?.message : null,
    alerts: live.status === 'fulfilled' ? computeAlerts(live.value) : [],
    history: history.status === 'fulfilled' ? history.value : null,
    historyError: history.status === 'rejected' ? history.reason?.message : null,
  };
}

// ── watcher de alertas por mail ──────────────────────────────────────
const notified = new Set();

async function checkAndNotify() {
  const alerts = computeAlerts(await getLive());
  const active = new Set(alerts.map((a) => a.key));
  for (const key of notified) if (!active.has(key)) notified.delete(key);
  const fresh = alerts.filter((a) => !notified.has(a.key));
  if (!fresh.length) return;
  await createTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: ALERT_EMAIL,
    subject: fresh.length === 1 ? 'Vast.ai: 1 alerta' : `Vast.ai: ${fresh.length} alertas`,
    text: fresh.map((a) => `- ${a.message}`).join('\n') + '\n\nDetalle en /infra.',
  });
  fresh.forEach((a) => notified.add(a.key));
  log.info('vast_alert_sent', { keys: fresh.map((a) => a.key) });
}

function startWatcher() {
  if (!API_KEY || !ALERT_EMAIL) return;
  const tick = () => checkAndNotify().catch((e) => log.warn('vast_alert_error', { error: e.message }));
  setTimeout(tick, 90 * 1000);
  setInterval(tick, LIVE_TTL_MS);
}

module.exports = { configured: Boolean(API_KEY), getStatus, startWatcher, spreadByDay };
