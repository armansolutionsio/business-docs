// Muestras horarias de CPU y RAM por contenedor (admin_core.infra_samples), para estimar
// el costo de cada uno con promedios del mes y no con una lectura suelta.
//
// La clave de cada contenedor es su nombre sin el sufijo numerico que Coolify agrega en cada
// deploy (app-uuid-123456789012 -> app-uuid), asi un redeploy no parte su historial.

const db = require('./db');

const MIN_GAP_MS = 55 * 60 * 1000;   // a lo sumo una muestra por hora
const RETENTION_DAYS = 90;
const WINDOW_DAYS = 30;

let lastSampleTs = null;   // se inicializa desde la tabla en ensureTable

const stableKey = (name) => name.replace(/-\d{6,}$/, '');

async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_core.infra_samples (
      ts         TIMESTAMPTZ NOT NULL,
      key        TEXT NOT NULL,
      project    TEXT,
      type       TEXT,
      cpu_pct    REAL NOT NULL,
      mem_bytes  BIGINT NOT NULL,
      PRIMARY KEY (ts, key)
    )`);
  const { rows } = await db.query(`SELECT MAX(ts) AS ts FROM admin_core.infra_samples`);
  lastSampleTs = rows[0].ts ? new Date(rows[0].ts).getTime() : null;
}

// Guarda una muestra si paso al menos MIN_GAP_MS desde la anterior. Ignora contenedores sin stats.
async function maybeRecord(containers) {
  if (lastSampleTs && Date.now() - lastSampleTs < MIN_GAP_MS) return false;
  const rows = (containers || []).filter((c) => !c.error && c.memUsed != null);
  if (!rows.length) return false;
  const ts = new Date();
  lastSampleTs = ts.getTime();
  const values = [];
  const params = [];
  rows.forEach((c, i) => {
    const o = i * 6;
    values.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6})`);
    params.push(ts, stableKey(c.name), c.project, c.type, c.cpuPct || 0, Math.round(c.memUsed));
  });
  await db.query(
    `INSERT INTO admin_core.infra_samples (ts, key, project, type, cpu_pct, mem_bytes)
     VALUES ${values.join(', ')} ON CONFLICT DO NOTHING`, params);
  await db.query(`DELETE FROM admin_core.infra_samples WHERE ts < NOW() - INTERVAL '${RETENTION_DAYS} days'`);
  return true;
}

// Promedios de los ultimos WINDOW_DAYS por contenedor: { key: { cores, memBytes, hours } }.
async function averages() {
  const { rows } = await db.query(
    `SELECT key, AVG(cpu_pct) / 100 AS cores, AVG(mem_bytes) AS mem, COUNT(*)::int AS hours
       FROM admin_core.infra_samples
      WHERE ts > NOW() - INTERVAL '${WINDOW_DAYS} days'
      GROUP BY key`);
  const out = {};
  for (const r of rows) out[r.key] = { cores: Number(r.cores), memBytes: Number(r.mem), hours: r.hours };
  return out;
}

module.exports = { WINDOW_DAYS, stableKey, ensureTable, maybeRecord, averages };
