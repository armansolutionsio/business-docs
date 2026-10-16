// Limites de la cuenta (licencia / free tier) que muestra /infra, cargados a mano.
// Se guarda en admin_core.infra_plan (una sola fila) y se edita desde el dashboard,
// asi un cambio de plan no requiere tocar codigo.
//
// Cada item puede tener `metric` para compararlo con lo medido en el servidor:
//   cores -> nucleos del host, memTotal -> RAM total (GB), diskTotal -> disco total (GB).

const db = require('./db');

const METRICS = ['cores', 'memTotal', 'diskTotal'];

// Vacio a proposito: los limites se cargan a mano desde la consola de Oracle
// (Limits, Quotas and Usage) hasta que la API de Limits este autorizada.
const DEFAULT_PLAN = { provider: '', name: '', reviewedAt: '', source: '', items: [] };

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
