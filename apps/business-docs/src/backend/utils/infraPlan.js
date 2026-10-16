// Plan de infraestructura contratado (licencia / free tier) que muestra /infra.
// Se guarda en admin_core.infra_plan (una sola fila) y se edita desde el dashboard,
// asi un cambio de plan no requiere tocar codigo. DEFAULT_PLAN solo siembra la tabla.
//
// Cada item puede tener `metric` para compararlo con lo medido en el servidor:
//   cores -> nucleos del host, memTotal -> RAM total (GB), diskTotal -> disco total (GB).

const db = require('./db');

const METRICS = ['cores', 'memTotal', 'diskTotal'];

const DEFAULT_PLAN = {
  provider: 'Oracle Cloud',
  name: 'Always Free',
  reviewedAt: '2026-10-16',
  source: 'https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm',
  items: [
    { key: 'a1_ocpu', label: 'Ampere A1 · OCPU', limit: 2, unit: 'OCPU', metric: 'cores',
      note: 'Total entre todas las instancias A1 de la cuenta. Reportado como reducido de 4 a 2 en ago-2026.' },
    { key: 'a1_ram', label: 'Ampere A1 · Memoria', limit: 12, unit: 'GB', metric: 'memTotal',
      note: 'Total entre todas las instancias A1. Reportado como reducido de 24 a 12 GB en ago-2026.' },
    { key: 'block', label: 'Block volume', limit: 200, unit: 'GB', metric: 'diskTotal',
      note: 'Boot + block volumes de toda la cuenta. Cada boot volume ocupa minimo 47 GB.' },
    { key: 'amd_micro', label: 'VM AMD Micro', limit: 2, unit: 'instancias', metric: null,
      note: '1/8 OCPU y 1 GB de RAM cada una.' },
    { key: 'object', label: 'Object Storage', limit: 20, unit: 'GB', metric: null,
      note: '20 GB entre los tres tiers en cuentas solo Always Free (10 GB por tier en cuentas pagas). 50.000 requests/mes.' },
    { key: 'egress', label: 'Transferencia saliente', limit: 10, unit: 'TB/mes', metric: null,
      note: 'Datos que salen de OCI hacia internet.' },
    { key: 'lb', label: 'Load balancer flexible', limit: 1, unit: 'instancia', metric: null,
      note: 'Ancho de banda fijo de 10 Mbps.' },
    { key: 'adb', label: 'Autonomous Database', limit: 2, unit: 'instancias', metric: null,
      note: 'Oracle DB administrada, 20 GB cada una.' },
  ],
};

async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_core.infra_plan (
      id          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      plan        JSONB NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by  TEXT
    )`);
  await db.query(
    `INSERT INTO admin_core.infra_plan (id, plan, updated_by) VALUES (1, $1, 'seed') ON CONFLICT (id) DO NOTHING`,
    [DEFAULT_PLAN]);
}

async function getPlan() {
  const { rows } = await db.query(`SELECT plan, updated_at, updated_by FROM admin_core.infra_plan WHERE id = 1`);
  if (!rows.length) return { ...DEFAULT_PLAN, updatedAt: null, updatedBy: null };
  return { ...rows[0].plan, updatedAt: rows[0].updated_at, updatedBy: rows[0].updated_by };
}

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

// Valida y normaliza lo que llega del formulario. Tira Error (status 400) con mensaje para el usuario.
function sanitizePlan(input) {
  if (!input || typeof input !== 'object') throw bad('Plan invalido');
  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length > 40) throw bad('Maximo 40 recursos');
  const plan = {
    provider: str(input.provider, 80),
    name: str(input.name, 80),
    reviewedAt: str(input.reviewedAt, 10),
    source: str(input.source, 300),
    items: items.map((it, i) => {
      const label = str(it.label, 80);
      if (!label) throw bad(`El recurso ${i + 1} no tiene nombre`);
      const limit = it.limit === '' || it.limit == null ? null : Number(it.limit);
      if (limit != null && !Number.isFinite(limit)) throw bad(`Limite invalido en "${label}"`);
      return {
        key: str(it.key, 40) || `item_${i + 1}`,
        label,
        limit,
        unit: str(it.unit, 30),
        metric: METRICS.includes(it.metric) ? it.metric : null,
        note: str(it.note, 300),
      };
    }),
  };
  if (!plan.name) throw bad('El plan necesita un nombre');
  if (plan.source && !/^https?:\/\//i.test(plan.source)) throw bad('La fuente debe ser un link http(s)');
  return plan;
}

async function savePlan(input, user) {
  const plan = sanitizePlan(input);
  await db.query(
    `INSERT INTO admin_core.infra_plan (id, plan, updated_at, updated_by) VALUES (1, $1, NOW(), $2)
     ON CONFLICT (id) DO UPDATE SET plan = EXCLUDED.plan, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [plan, user?.email || null]);
  return getPlan();
}

module.exports = { DEFAULT_PLAN, METRICS, ensureTable, getPlan, savePlan };
