// Monitor de recursos del servidor (solo admin).
// - Host: CPU / RAM / carga leyendo /proc (el contenedor ve los valores del host).
//   Disco: statfs sobre / (el overlay del contenedor vive en el disco del host) y
//   tamano de cada volumen en /sys/block.
// - Instancia: forma, OCPU, memoria y region desde el servicio de metadatos de OCI.
//   Son los recursos asignados a esta VM, no los limites de la cuenta.
// - Contenedores: stats via docker-socket-proxy de solo lectura (DOCKER_PROXY_URL).
// - Postgres: tamano del volumen de cada contenedor postgres (GET /system/df del proxy)
//   y tamano de cada base del cluster al que se conecta business-docs.
// - GPU: RunPod (utils/runpod.js), con su propia cache de 5 min para no perder de vista un pod prendido.
// - En desarrollo, SYSMETRICS_SSH_HOST reemplaza host + contenedores por una lectura via SSH.
// - Plan: limites de la licencia / free tier (admin_core.infra_plan), editable via PUT /plan.
// - Costos: una muestra por hora de CPU/RAM de cada contenedor (admin_core.infra_samples) para
//   estimar su costo a precio de lista con el promedio de 30 dias. Lo toma un timer horario y
//   tambien cada lectura del dashboard (como mucho una muestra por hora).
// Las metricas del servidor se cachean 1 hora (?refresh=1 fuerza una lectura nueva); el plan se lee siempre.

const express = require('express');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { requireAdmin } = require('../utils/auth');
const db = require('../utils/db');
const infraPlan = require('../utils/infraPlan');
const infraSamples = require('../utils/infraSamples');
const runpod = require('../utils/runpod');
const { requestJson } = require('../utils/httpJson');
const log = require('../utils/logger');

const router = express.Router();
router.use(requireAdmin);

const CACHE_TTL_MS = 60 * 60 * 1000;
const DOCKER_PROXY_URL = process.env.DOCKER_PROXY_URL || 'http://docker-socket-proxy:2375';
const SSH_HOST = process.env.SYSMETRICS_SSH_HOST || '';

let cache = null;      // { data, ts }
let inflight = null;   // evita lecturas duplicadas si llegan dos refresh juntos

// ── helpers ──────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseCpuLine(line) {
  const v = line.trim().split(/\s+/).slice(1, 9).map(Number); // sin guest/guest_nice (ya incluidos en user)
  const idle = v[3] + (v[4] || 0); // idle + iowait
  const total = v.reduce((a, b) => a + b, 0);
  return { idle, total };
}

function cpuPctBetween(a, b) {
  const dt = b.total - a.total;
  return dt > 0 ? (1 - (b.idle - a.idle) / dt) * 100 : 0;
}

function parseMeminfo(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^(\w+):\s+(\d+)/);
    if (m) out[m[1]] = Number(m[2]) * 1024; // kB -> bytes
  }
  return out;
}

const readCpuTimes = () => parseCpuLine(fs.readFileSync('/proc/stat', 'utf8').split('\n')[0]);
const readMeminfo = () => parseMeminfo(fs.readFileSync('/proc/meminfo', 'utf8'));

function readDisk() {
  try {
    const s = fs.statfsSync('/');
    const total = s.blocks * s.bsize;
    return { diskTotal: total, diskUsed: total - s.bfree * s.bsize, diskFree: s.bavail * s.bsize };
  } catch (e) {
    return {};
  }
}

// Discos fisicos (sin loop/ram/device-mapper) con su tamano en bytes.
function readBlockDevices() {
  try {
    return fs.readdirSync('/sys/block')
      .filter((n) => !/^(loop|ram|dm-|zram|sr|md)/.test(n))
      .map((n) => ({ name: n, size: Number(fs.readFileSync(`/sys/block/${n}/size`, 'utf8')) * 512 }))
      .filter((d) => d.size > 0);
  } catch (e) {
    return [];
  }
}

// Solo campos descriptivos: el bloque `metadata` trae las llaves SSH y no se expone.
function pickInstance(d) {
  if (!d || !d.shape) return null;
  return {
    displayName: d.displayName,
    shape: d.shape,
    ocpus: d.shapeConfig?.ocpus ?? null,
    memoryGb: d.shapeConfig?.memoryInGBs ?? null,
    bandwidthGbps: d.shapeConfig?.networkingBandwidthInGbps ?? null,
    region: d.canonicalRegionName || d.region,
    availabilityDomain: d.availabilityDomain,
    faultDomain: d.faultDomain,
    state: d.state,
    createdAt: d.timeCreated ? new Date(d.timeCreated).toISOString() : null,
  };
}

const IMDS_URL = 'http://169.254.169.254/opc/v2/instance/';
async function instanceMetadata() {
  return pickInstance(await requestJson(IMDS_URL, { headers: { Authorization: 'Bearer Oracle' }, timeout: 3000 }));
}

const isPostgres = (image) => /postgres|postgis|timescale|pgvector/i.test(image || '');

// ── host ─────────────────────────────────────────────────────────────
async function hostMetrics() {
  const cores = os.cpus().length;
  let cpuPct = null;
  let mem = { total: os.totalmem(), available: os.freemem() };
  let load = os.loadavg();
  try {
    const a = readCpuTimes();
    await sleep(2000);
    cpuPct = cpuPctBetween(a, readCpuTimes());
    const mi = readMeminfo();
    mem = { total: mi.MemTotal, available: mi.MemAvailable ?? mi.MemFree };
  } catch (e) {
    // fuera de Linux (dev local) no hay /proc: quedan los valores de os
  }
  return {
    hostname: os.hostname(),
    arch: os.arch(),
    cores,
    cpuPct,
    load: load.map((n) => Math.round(n * 100) / 100),
    memTotal: mem.total,
    memUsed: mem.total - mem.available,
    memAvailable: mem.available,
    ...readDisk(),
    blockDevices: readBlockDevices(),
  };
}

// ── contenedores ─────────────────────────────────────────────────────
function containerType(labels, name) {
  const t = labels['coolify.type'];
  if (t === 'application') return 'app';
  if (t === 'database' || /postgres|redis|mysql|mongo/i.test(labels['coolify.serviceName'] || '')) return 'db';
  if (t === 'service') return 'service';
  if (/^coolify/.test(name)) return 'sys';
  return 'other';
}

async function containerMetrics() {
  const list = await requestJson(`${DOCKER_PROXY_URL}/containers/json`);
  const rows = await Promise.all(list.map(async (c) => {
    const name = (c.Names?.[0] || c.Id.slice(0, 12)).replace(/^\//, '');
    const labels = c.Labels || {};
    try {
      const s = await requestJson(`${DOCKER_PROXY_URL}/containers/${c.Id}/stats?stream=false`);
      const cpuDelta = (s.cpu_stats?.cpu_usage?.total_usage || 0) - (s.precpu_stats?.cpu_usage?.total_usage || 0);
      const sysDelta = (s.cpu_stats?.system_cpu_usage || 0) - (s.precpu_stats?.system_cpu_usage || 0);
      const online = s.cpu_stats?.online_cpus || s.cpu_stats?.cpu_usage?.percpu_usage?.length || 1;
      const cache = s.memory_stats?.stats?.inactive_file ?? s.memory_stats?.stats?.cache ?? 0;
      return {
        name,
        project: labels['coolify.projectName'] || name,
        type: containerType(labels, name),
        cpuPct: sysDelta > 0 && cpuDelta > 0 ? (cpuDelta / sysDelta) * online * 100 : 0,
        memUsed: Math.max(0, (s.memory_stats?.usage || 0) - cache),
        memLimit: s.memory_stats?.limit || null,
        status: c.Status,
      };
    } catch (e) {
      return { name, project: labels['coolify.projectName'] || name, type: containerType(labels, name), error: e.message, status: c.Status };
    }
  }));
  return rows.sort((a, b) => (b.memUsed || 0) - (a.memUsed || 0));
}

// ── Postgres ─────────────────────────────────────────────────────────
// /system/df calcula el tamano de cada volumen; puede tardar varios segundos.
async function postgresVolumes() {
  const df = await requestJson(`${DOCKER_PROXY_URL}/system/df`, { timeout: 90000 });
  const volSize = {};
  for (const v of df.Volumes || []) volSize[v.Name] = v.UsageData?.Size ?? null;
  return (df.Containers || [])
    .filter((c) => isPostgres(c.Image))
    .map((c) => {
      const name = (c.Names?.[0] || c.Id.slice(0, 12)).replace(/^\//, '');
      const vols = (c.Mounts || []).filter((m) => m.Type === 'volume');
      const sizes = vols.map((m) => volSize[m.Name]).filter((n) => n != null && n >= 0);
      return {
        name,
        project: c.Labels?.['coolify.projectName'] || name,
        running: c.State === 'running',
        size: sizes.length ? sizes.reduce((a, b) => a + b, 0) : null,
        volumes: vols.map((m) => m.Name),
      };
    })
    .sort((a, b) => (b.size || 0) - (a.size || 0));
}

// Bases del cluster al que apunta DATABASE_URL (el de business-docs).
async function ownDatabases() {
  const { rows } = await db.query(
    `SELECT datname AS name, pg_database_size(datname)::bigint AS size,
            datname = current_database() AS current
       FROM pg_database WHERE NOT datistemplate ORDER BY 2 DESC`);
  return rows.map((r) => ({ name: r.name, size: Number(r.size), current: r.current }));
}

// ── modo SSH (desarrollo local) ──────────────────────────────────────
// Con SYSMETRICS_SSH_HOST=opc@host lee el servidor remoto por SSH con
// comandos de solo lectura, usando la llave SSH de quien corre el proceso.
const REMOTE_SCRIPT = [
  'head -1 /proc/stat', 'sleep 2', 'head -1 /proc/stat', 'echo @@',
  'cat /proc/meminfo', 'echo @@',
  'cat /proc/loadavg', 'nproc', 'hostname', 'uname -m', 'echo @@',
  'sudo docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}"', 'echo @@',
  'sudo docker ps --format "{{.Names}}|{{.Label \\"coolify.projectName\\"}}|{{.Label \\"coolify.type\\"}}|{{.Status}}"', 'echo @@',
  'df -B1 / | tail -1', 'echo @@',
  // por cada contenedor postgres: nombre|estado|volumen|bytes (du sobre el volumen)
  'sudo docker ps -a --no-trunc --format "{{.Names}}|{{.Image}}|{{.State}}|{{.Mounts}}" | grep -iE "postgres|postgis|timescale|pgvector" | '
    + 'while IFS="|" read n i st m; do for v in $(echo "$m" | tr "," " "); do '
    + 's=$(sudo du -sb "/var/lib/docker/volumes/$v/_data" 2>/dev/null | cut -f1); echo "$n|$st|$v|${s:--1}"; done; done', 'echo @@',
  `curl -s -m 5 -H "Authorization: Bearer Oracle" ${IMDS_URL}`, 'echo', 'echo @@',
  'lsblk -b -dn -o NAME,SIZE,TYPE',
].join('; ');

const UNITS = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3 };
function parseSize(s) {
  const m = String(s).trim().match(/^([\d.]+)\s*([a-z]+)$/i);
  return m ? Number(m[1]) * (UNITS[m[2].toUpperCase()] || 1) : 0;
}

function sshRun(host) {
  return new Promise((resolve, reject) => {
    execFile('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', host, REMOTE_SCRIPT],
      { timeout: 45000, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout, stderr) => err ? reject(new Error((stderr || err.message).trim().split('\n').pop())) : resolve(stdout));
  });
}

async function sshMetrics(host) {
  const [cpu, mem, sys, stats, ps, disk, pg = '', imds = '', lsblk = ''] = (await sshRun(host)).split('@@\n');
  const [c1, c2] = cpu.trim().split('\n');
  const [loadLine, nproc, hostname, arch] = sys.trim().split('\n');
  const mi = parseMeminfo(mem);
  const meta = {};
  for (const line of ps.trim().split('\n')) {
    const [name, project, type, status] = line.split('|');
    meta[name] = { project, type, status };
  }
  const containers = stats.trim().split('\n').filter(Boolean).map((line) => {
    const [name, cpuPerc, memUsage] = line.split('|');
    const m = meta[name] || {};
    const labels = { 'coolify.type': m.type, 'coolify.projectName': m.project };
    return {
      name,
      project: m.project || name,
      type: containerType(labels, name),
      cpuPct: parseFloat(cpuPerc) || 0,
      memUsed: parseSize(memUsage.split('/')[0]),
      memLimit: parseSize(memUsage.split('/')[1]),
      status: m.status,
    };
  }).sort((a, b) => b.memUsed - a.memUsed);
  // df: Filesystem 1B-blocks Used Available Use% Mounted
  const [, dTotal, dUsed, dAvail] = disk.trim().split(/\s+/).map(Number);
  const pgMap = {};
  for (const line of pg.trim().split('\n').filter(Boolean)) {
    const [name, state, vol, bytes] = line.split('|');
    const e = pgMap[name] || (pgMap[name] = {
      name, project: meta[name]?.project || name, running: state === 'running', size: null, volumes: [],
    });
    e.volumes.push(vol);
    if (Number(bytes) >= 0) e.size = (e.size || 0) + Number(bytes);
  }
  let instance = null;
  try { instance = pickInstance(JSON.parse(imds)); } catch (e) { /* sin metadatos */ }
  const blockDevices = lsblk.trim().split('\n').map((l) => l.trim().split(/\s+/))
    .filter(([, , type]) => type === 'disk').map(([name, size]) => ({ name, size: Number(size) }));
  return {
    instance,
    host: {
      hostname: hostname.trim(),
      arch: arch.trim() === 'aarch64' ? 'arm64' : arch.trim(),
      cores: Number(nproc),
      cpuPct: cpuPctBetween(parseCpuLine(c1), parseCpuLine(c2)),
      load: loadLine.split(' ').slice(0, 3).map(Number),
      memTotal: mi.MemTotal,
      memUsed: mi.MemTotal - mi.MemAvailable,
      memAvailable: mi.MemAvailable,
      diskTotal: dTotal,
      diskUsed: dUsed,
      diskFree: dAvail,
      blockDevices,
    },
    containers,
    postgres: Object.values(pgMap).sort((a, b) => (b.size || 0) - (a.size || 0)),
  };
}

// ── recolector ───────────────────────────────────────────────────────
async function collect() {
  const remote = SSH_HOST ? sshMetrics(SSH_HOST) : null;
  const [host, containers, pgVolumes, pgDbs, instance] = await Promise.allSettled([
    remote ? remote.then((r) => r.host) : hostMetrics(),
    remote ? remote.then((r) => r.containers) : containerMetrics(),
    remote ? remote.then((r) => r.postgres) : postgresVolumes(),
    ownDatabases(),
    remote ? remote.then((r) => r.instance) : instanceMetadata(),
  ]);
  if (containers.status === 'rejected') log.warn('sysmetrics_docker_error', { error: containers.reason?.message });
  else recordSample(containers.value);
  if (pgVolumes.status === 'rejected') log.warn('sysmetrics_pg_volumes_error', { error: pgVolumes.reason?.message });
  if (pgDbs.status === 'rejected') log.warn('sysmetrics_pg_dbs_error', { error: pgDbs.reason?.message });
  return {
    collectedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
    host: host.status === 'fulfilled' ? host.value : null,
    instance: instance.status === 'fulfilled' ? instance.value : null,
    containers: containers.status === 'fulfilled'
      ? containers.value.map((c) => ({ ...c, key: infraSamples.stableKey(c.name) })) : [],
    dockerError: containers.status === 'rejected' ? containers.reason?.message : null,
    postgres: {
      volumes: pgVolumes.status === 'fulfilled' ? pgVolumes.value : [],
      volumesError: pgVolumes.status === 'rejected' ? pgVolumes.reason?.message : null,
      databases: pgDbs.status === 'fulfilled' ? pgDbs.value : [],
      databasesError: pgDbs.status === 'rejected' ? pgDbs.reason?.message : null,
    },
  };
}

// ── muestras para costos ─────────────────────────────────────────────
function recordSample(containers) {
  infraSamples.maybeRecord(containers)
    .then((saved) => { if (saved) log.debug('sysmetrics_sample_saved', { containers: containers.length }); })
    .catch((e) => log.warn('sysmetrics_sample_error', { error: e.message }));
}

// Muestra liviana (sin Postgres ni host) para el timer horario.
async function sampleNow() {
  const containers = SSH_HOST ? (await sshMetrics(SSH_HOST)).containers : await containerMetrics();
  recordSample(containers);
}

router.startSampler = () => {
  const tick = () => sampleNow().catch((e) => log.warn('sysmetrics_sample_error', { error: e.message }));
  setTimeout(tick, 2 * 60 * 1000);
  setInterval(tick, 60 * 60 * 1000);
};

async function costData() {
  try {
    return { windowDays: infraSamples.WINDOW_DAYS, averages: await infraSamples.averages() };
  } catch (e) {
    log.warn('sysmetrics_costs_error', { error: e.message });
    return { windowDays: infraSamples.WINDOW_DAYS, averages: {}, error: e.message };
  }
}

// ── GET /api/sysmetrics ──────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const force = req.query.refresh === '1';
    const fresh = cache && Date.now() - cache.ts < CACHE_TTL_MS;
    const planP = infraPlan.getPlan().catch((e) => { log.warn('sysmetrics_plan_error', { error: e.message }); return null; });
    const gpuP = runpod.getStatus(force);
    if (!force && fresh) {
      return res.json({ ...cache.data, plan: await planP, gpu: await gpuP, costs: await costData(), cached: true });
    }
    if (!inflight) {
      inflight = collect()
        .then((data) => { cache = { data, ts: Date.now() }; return data; })
        .finally(() => { inflight = null; });
    }
    const data = await inflight;
    res.json({ ...data, plan: await planP, gpu: await gpuP, costs: await costData(), cached: false });
  } catch (err) { next(err); }
});

// ── PUT /api/sysmetrics/plan ─────────────────────────────────────────
router.put('/plan', async (req, res, next) => {
  try {
    res.json(await infraPlan.savePlan(req.body, req.user));
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
