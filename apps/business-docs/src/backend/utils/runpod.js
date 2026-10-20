// Estado de la cuenta de RunPod para /infra (requiere RUNPOD_API_KEY).
// - Live (GraphQL, cache 5 min): creditos, gasto/hora, limite de gasto, pods, network volumes
//   y endpoints serverless. Pods y extras van en consultas separadas para que un error en
//   volumes/endpoints no tape los creditos.
// - Historial (REST /v1/billing, cache 1 h): gasto diario de los ultimos 30 dias por pods,
//   network volumes y serverless.
// - Alertas: creditos para menos de RUNPOD_LOW_HOURS horas al ritmo actual y pods encendidos
//   sin uso de GPU. "Ocioso desde" es la primera lectura de este proceso con GPU al 0%, no el
//   historial real del pod. Un watcher revisa cada 5 min y, si RUNPOD_ALERT_EMAIL esta
//   configurado, manda un mail por alerta nueva (se vuelve a avisar solo si se resolvio antes).

const { requestJson } = require('./httpJson');
const { createTransporter } = require('./mailer');
const log = require('./logger');

const API_KEY = process.env.RUNPOD_API_KEY || '';
const LOW_HOURS = Number(process.env.RUNPOD_LOW_HOURS) || 24;
const IDLE_ALERT_MIN = Number(process.env.RUNPOD_IDLE_ALERT_MIN) || 30;
const ALERT_EMAIL = process.env.RUNPOD_ALERT_EMAIL || '';
const LIVE_TTL_MS = 5 * 60 * 1000;
const HISTORY_TTL_MS = 60 * 60 * 1000;
const HISTORY_DAYS = 30;

const auth = { Authorization: `Bearer ${API_KEY}` };

const CORE_QUERY = `query {
  myself {
    clientBalance
    currentSpendPerHr
    spendLimit
    pods {
      id name desiredStatus costPerHr gpuCount memoryInGb vcpuCount
      volumeInGb containerDiskInGb podType imageName lastStartedAt networkVolumeId
      machine { gpuDisplayName }
      runtime {
        uptimeInSeconds
        gpus { id gpuUtilPercent memoryUtilPercent }
        container { cpuPercent memoryPercent }
      }
    }
  }
}`;

const VOLUMES_QUERY = `query { myself { networkVolumes { id name size dataCenterId } } }`;
const ENDPOINTS_QUERY = `query { myself { endpoints { id name gpuIds workersMin workersMax idleTimeout } } }`;

async function graphql(query) {
  const res = await requestJson('https://api.runpod.io/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ query }),
  });
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data?.myself || {};
}

// podId -> ISO de la primera lectura con todas sus GPUs al 0%
const idleSince = new Map();

function trackIdle(pods) {
  const now = new Date().toISOString();
  const seen = new Set();
  for (const p of pods) {
    const utils = p.gpus.map((g) => g.gpuUtilPercent).filter((n) => n != null);
    const idle = p.status === 'RUNNING' && utils.length > 0 && utils.every((n) => n === 0);
    if (idle) {
      seen.add(p.id);
      if (!idleSince.has(p.id)) idleSince.set(p.id, now);
    }
  }
  for (const id of idleSince.keys()) if (!seen.has(id)) idleSince.delete(id);
  for (const p of pods) p.idleSince = idleSince.get(p.id) || null;
}

async function fetchLive() {
  const [core, vols, eps] = await Promise.allSettled([
    graphql(CORE_QUERY), graphql(VOLUMES_QUERY), graphql(ENDPOINTS_QUERY),
  ]);
  if (core.status === 'rejected') throw core.reason;
  const me = core.value;
  const pods = (me.pods || []).map((p) => ({
    id: p.id,
    name: p.name,
    status: p.desiredStatus,
    gpu: p.machine?.gpuDisplayName || null,
    gpuCount: p.gpuCount,
    vcpu: p.vcpuCount,
    ramGb: p.memoryInGb,
    costPerHr: p.costPerHr,
    volumeGb: p.volumeInGb ?? null,
    containerDiskGb: p.containerDiskInGb ?? null,
    podType: p.podType || null,
    image: p.imageName || null,
    networkVolumeId: p.networkVolumeId || null,
    lastStartedAt: p.lastStartedAt || null,
    uptimeSec: p.runtime?.uptimeInSeconds ?? null,
    gpus: p.runtime?.gpus || [],
    cpuPct: p.runtime?.container?.cpuPercent ?? null,
    memPct: p.runtime?.container?.memoryPercent ?? null,
  }));
  trackIdle(pods);
  if (vols.status === 'rejected') log.warn('runpod_volumes_error', { error: vols.reason?.message });
  if (eps.status === 'rejected') log.warn('runpod_endpoints_error', { error: eps.reason?.message });
  return {
    balance: me.clientBalance ?? null,
    spendPerHr: me.currentSpendPerHr ?? 0,
    spendLimit: me.spendLimit ?? null,
    pods,
    volumes: vols.status === 'fulfilled' ? (vols.value.networkVolumes || []).map((v) => ({
      id: v.id, name: v.name, sizeGb: v.size, dataCenter: v.dataCenterId,
    })) : null,
    volumesError: vols.status === 'rejected' ? vols.reason?.message : null,
    endpoints: eps.status === 'fulfilled' ? (eps.value.endpoints || []).map((e) => ({
      id: e.id, name: e.name, gpuIds: e.gpuIds, workersMin: e.workersMin, workersMax: e.workersMax, idleTimeout: e.idleTimeout,
    })) : null,
    endpointsError: eps.status === 'rejected' ? eps.reason?.message : null,
  };
}

// ── historial de gasto ───────────────────────────────────────────────
const BILLING = { pods: 'pods', volumes: 'networkvolumes', serverless: 'endpoints' };

async function fetchHistory() {
  const start = new Date(Date.now() - HISTORY_DAYS * 86400000);
  start.setUTCHours(0, 0, 0, 0);
  const qs = `bucketSize=day&startTime=${start.toISOString().replace(/\.\d{3}Z$/, 'Z')}`;
  const keys = Object.keys(BILLING);
  const results = await Promise.allSettled(keys.map((k) =>
    requestJson(`https://rest.runpod.io/v1/billing/${BILLING[k]}?${qs}`, { headers: auth, timeout: 15000 })));
  const days = {};
  const errors = {};
  results.forEach((r, i) => {
    const k = keys[i];
    if (r.status === 'rejected') { errors[k] = r.reason?.message; return; }
    for (const rec of Array.isArray(r.value) ? r.value : []) {
      // pods/endpoints traen `time`; networkvolumes trae `startDate`
      const date = String(rec.time || rec.startDate || '').slice(0, 10);
      if (!date) continue;
      const d = days[date] || (days[date] = { date, pods: 0, volumes: 0, serverless: 0 });
      d[k] += Number(rec.amount) || 0;
    }
  });
  if (Object.keys(errors).length) log.warn('runpod_billing_error', errors);
  if (Object.keys(errors).length === keys.length) throw new Error(Object.values(errors)[0]);
  return { days: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)), errors };
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
  for (const p of live.pods) {
    if (!p.idleSince) continue;
    const min = (Date.now() - new Date(p.idleSince).getTime()) / 60000;
    if (min >= IDLE_ALERT_MIN) {
      alerts.push({ key: `idle_${p.id}`, level: 'warn',
        message: `El pod "${p.name}" está encendido con la GPU al 0% desde hace ${Math.round(min)} min (US$ ${Number(p.costPerHr).toFixed(2)}/h).` });
    }
  }
  for (const e of live.endpoints || []) {
    if (e.workersMin > 0) {
      alerts.push({ key: `workers_${e.id}`, level: 'warn',
        message: `El endpoint serverless "${e.name}" tiene ${e.workersMin} worker(s) mínimo(s): cobran aunque no haya pedidos.` });
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

// Lo que consume GET /api/sysmetrics (campo `gpu`).
async function getStatus(force = false) {
  const settings = { lowHours: LOW_HOURS, idleAlertMin: IDLE_ALERT_MIN, alertEmail: Boolean(ALERT_EMAIL) };
  if (!API_KEY) return { configured: false, settings };
  const [live, history] = await Promise.allSettled([getLive(force), getHistory(force)]);
  if (live.status === 'rejected') log.warn('sysmetrics_runpod_error', { error: live.reason?.message });
  if (history.status === 'rejected') log.warn('runpod_history_error', { error: history.reason?.message });
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
    subject: fresh.length === 1 ? 'RunPod: 1 alerta' : `RunPod: ${fresh.length} alertas`,
    text: fresh.map((a) => `- ${a.message}`).join('\n') + '\n\nDetalle en /infra.',
  });
  fresh.forEach((a) => notified.add(a.key));
  log.info('runpod_alert_sent', { keys: fresh.map((a) => a.key) });
}

function startWatcher() {
  if (!API_KEY || !ALERT_EMAIL) return;
  const tick = () => checkAndNotify().catch((e) => log.warn('runpod_alert_error', { error: e.message }));
  setTimeout(tick, 60 * 1000);
  setInterval(tick, LIVE_TTL_MS);
}

module.exports = { configured: Boolean(API_KEY), getStatus, startWatcher };
