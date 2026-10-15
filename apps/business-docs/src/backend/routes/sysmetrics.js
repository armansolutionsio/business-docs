// Monitor de recursos del servidor (solo admin).
// - Host: CPU / RAM / carga leyendo /proc (el contenedor ve los valores del host).
// - Contenedores: stats via docker-socket-proxy de solo lectura (DOCKER_PROXY_URL).
// - GPU: creditos y pods de RunPod si RUNPOD_API_KEY esta configurada.
// - En desarrollo, SYSMETRICS_SSH_HOST reemplaza host + contenedores por una lectura via SSH.
// El resultado se cachea 1 hora; ?refresh=1 fuerza una lectura nueva.

const express = require('express');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const { execFile } = require('child_process');
const { requireAdmin } = require('../utils/auth');
const log = require('../utils/logger');

const router = express.Router();
router.use(requireAdmin);

const CACHE_TTL_MS = 60 * 60 * 1000;
const DOCKER_PROXY_URL = process.env.DOCKER_PROXY_URL || 'http://docker-socket-proxy:2375';
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY || '';
const SSH_HOST = process.env.SYSMETRICS_SSH_HOST || '';

let cache = null;      // { data, ts }
let inflight = null;   // evita lecturas duplicadas si llegan dos refresh juntos

// ── helpers ──────────────────────────────────────────────────────────
function requestJson(url, { method = 'GET', headers = {}, body, timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method, headers, timeout }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

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

// ── modo SSH (desarrollo local) ──────────────────────────────────────
// Con SYSMETRICS_SSH_HOST=opc@host lee el servidor remoto por SSH con
// comandos de solo lectura, usando la llave SSH de quien corre el proceso.
const REMOTE_SCRIPT = [
  'head -1 /proc/stat', 'sleep 2', 'head -1 /proc/stat', 'echo @@',
  'cat /proc/meminfo', 'echo @@',
  'cat /proc/loadavg', 'nproc', 'hostname', 'uname -m', 'echo @@',
  'sudo docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}"', 'echo @@',
  'sudo docker ps --format "{{.Names}}|{{.Label \\"coolify.projectName\\"}}|{{.Label \\"coolify.type\\"}}|{{.Status}}"',
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
  const [cpu, mem, sys, stats, ps] = (await sshRun(host)).split('@@\n');
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
  return {
    host: {
      hostname: hostname.trim(),
      arch: arch.trim() === 'aarch64' ? 'arm64' : arch.trim(),
      cores: Number(nproc),
      cpuPct: cpuPctBetween(parseCpuLine(c1), parseCpuLine(c2)),
      load: loadLine.split(' ').slice(0, 3).map(Number),
      memTotal: mi.MemTotal,
      memUsed: mi.MemTotal - mi.MemAvailable,
      memAvailable: mi.MemAvailable,
    },
    containers,
  };
}

// ── RunPod (GPU) ─────────────────────────────────────────────────────
const RUNPOD_QUERY = `query {
  myself {
    clientBalance
    currentSpendPerHr
    pods {
      id name desiredStatus costPerHr gpuCount memoryInGb vcpuCount
      machine { gpuDisplayName }
      runtime {
        uptimeInSeconds
        gpus { id gpuUtilPercent memoryUtilPercent }
        container { cpuPercent memoryPercent }
      }
    }
  }
}`;

async function runpodMetrics() {
  const res = await requestJson('https://api.runpod.io/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RUNPOD_API_KEY}` },
    body: JSON.stringify({ query: RUNPOD_QUERY }),
  });
  if (res.errors?.length) throw new Error(res.errors[0].message);
  const me = res.data?.myself || {};
  return {
    balance: me.clientBalance ?? null,
    spendPerHr: me.currentSpendPerHr ?? 0,
    pods: (me.pods || []).map((p) => ({
      id: p.id,
      name: p.name,
      status: p.desiredStatus,
      gpu: p.machine?.gpuDisplayName || null,
      gpuCount: p.gpuCount,
      vcpu: p.vcpuCount,
      ramGb: p.memoryInGb,
      costPerHr: p.costPerHr,
      uptimeSec: p.runtime?.uptimeInSeconds ?? null,
      gpus: p.runtime?.gpus || [],
      cpuPct: p.runtime?.container?.cpuPercent ?? null,
      memPct: p.runtime?.container?.memoryPercent ?? null,
    })),
  };
}

// ── recolector ───────────────────────────────────────────────────────
async function collect() {
  const remote = SSH_HOST ? sshMetrics(SSH_HOST) : null;
  const [host, containers, gpu] = await Promise.allSettled([
    remote ? remote.then((r) => r.host) : hostMetrics(),
    remote ? remote.then((r) => r.containers) : containerMetrics(),
    RUNPOD_API_KEY ? runpodMetrics() : Promise.resolve(null),
  ]);
  if (containers.status === 'rejected') log.warn('sysmetrics_docker_error', { error: containers.reason?.message });
  if (gpu.status === 'rejected') log.warn('sysmetrics_runpod_error', { error: gpu.reason?.message });
  return {
    collectedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
    host: host.status === 'fulfilled' ? host.value : null,
    containers: containers.status === 'fulfilled' ? containers.value : [],
    dockerError: containers.status === 'rejected' ? containers.reason?.message : null,
    gpu: {
      configured: Boolean(RUNPOD_API_KEY),
      data: gpu.status === 'fulfilled' ? gpu.value : null,
      error: gpu.status === 'rejected' ? gpu.reason?.message : null,
    },
  };
}

// ── GET /api/sysmetrics ──────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const force = req.query.refresh === '1';
    const fresh = cache && Date.now() - cache.ts < CACHE_TTL_MS;
    if (!force && fresh) return res.json({ ...cache.data, cached: true });
    if (!inflight) {
      inflight = collect()
        .then((data) => { cache = { data, ts: Date.now() }; return data; })
        .finally(() => { inflight = null; });
    }
    res.json({ ...(await inflight), cached: false });
  } catch (err) { next(err); }
});

module.exports = router;
