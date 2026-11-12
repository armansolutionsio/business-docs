// Lectura de Meta (Facebook + Instagram + cuenta publicitaria) para Arman Marketing.
// Usa el token del usuario del sistema "arman-marketing-bot" (META_ACCESS_TOKEN).
// Este modulo SOLO LEE: no crea, edita ni prende nada en Meta.
// Montos: amount_spent / spend_cap / balance vienen en centavos de la moneda de la cuenta;
// spend de insights viene en unidades. Aca se normaliza todo a unidades.

const log = require('./logger');

const VERSION = process.env.META_API_VERSION || 'v27.0';
const BASE = `https://graph.facebook.com/${VERSION}`;

const ACCOUNT_STATUS = {
  1: 'Activa', 2: 'Deshabilitada', 3: 'Con deuda', 7: 'En revisión', 8: 'Pendiente de pago',
  9: 'En período de gracia', 100: 'Cierre pendiente', 101: 'Cerrada',
};

function configured() {
  return Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID);
}

async function graph(path, params = {}) {
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` },
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const msg = body.error ? `${body.error.message} (code ${body.error.code})` : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

const cents = (v) => (v == null ? null : Number(v) / 100);
const num = (v) => (v == null ? null : Number(v));

function insightsOf(raw) {
  const r = raw && raw.data && raw.data[0];
  if (!r) return { spend: 0, reach: 0, impressions: 0, clicks: 0 };
  return { spend: num(r.spend), reach: num(r.reach), impressions: num(r.impressions), clicks: num(r.clicks) };
}

// Cada bloque se lee por separado: si uno falla, los demas se muestran igual.
async function safe(name, fn) {
  try { return { data: await fn(), error: null }; }
  catch (e) {
    log.warn('meta_read_failed', { part: name, error: e.message });
    return { data: null, error: e.message };
  }
}

async function overview() {
  if (!configured()) return { configured: false };
  const act = process.env.META_AD_ACCOUNT_ID;
  const pageId = process.env.META_PAGE_ID;
  const igId = process.env.META_IG_ACCOUNT_ID;

  const [page, instagram, account, accountInsights, campaigns] = await Promise.all([
    pageId ? safe('page', async () => {
      const p = await graph(pageId, { fields: 'name,fan_count,followers_count,link' });
      return { id: p.id, name: p.name, followers: num(p.followers_count), likes: num(p.fan_count), link: p.link };
    }) : { data: null, error: 'META_PAGE_ID no configurado' },
    igId ? safe('instagram', async () => {
      const i = await graph(igId, { fields: 'username,name,followers_count,media_count' });
      return { id: i.id, username: i.username, name: i.name, followers: num(i.followers_count), posts: num(i.media_count) };
    }) : { data: null, error: 'META_IG_ACCOUNT_ID no configurado' },
    safe('account', async () => {
      const a = await graph(act, { fields: 'name,currency,account_status,amount_spent,spend_cap,balance,funding_source_details,timezone_name' });
      const cap = cents(a.spend_cap);
      return {
        id: a.id,
        name: a.name,
        currency: a.currency,
        timezone: a.timezone_name,
        status: ACCOUNT_STATUS[a.account_status] || `Estado ${a.account_status}`,
        active: a.account_status === 1,
        spentTotal: cents(a.amount_spent),
        spendCap: cap > 0 ? cap : null,
        balance: cents(a.balance),
        hasPaymentMethod: Boolean(a.funding_source_details),
        paymentMethod: a.funding_source_details ? a.funding_source_details.display_string || null : null,
      };
    }),
    safe('insights', async () => insightsOf(await graph(`${act}/insights`, {
      date_preset: 'last_30d', fields: 'spend,reach,impressions,clicks',
    }))),
    safe('campaigns', async () => {
      const r = await graph(`${act}/campaigns`, {
        fields: 'name,status,effective_status,objective,daily_budget,lifetime_budget,created_time,insights.date_preset(last_30d){spend,reach,impressions,clicks}',
        limit: '50',
      });
      return (r.data || []).map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        effectiveStatus: c.effective_status,
        objective: c.objective,
        dailyBudget: cents(c.daily_budget),
        lifetimeBudget: cents(c.lifetime_budget),
        createdAt: c.created_time,
        last30d: insightsOf(c.insights),
      }));
    }),
  ]);

  return { configured: true, page, instagram, account, insights: accountInsights, campaigns };
}

module.exports = { configured, overview };
