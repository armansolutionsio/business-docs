// fal.ai para Arman Marketing.
// - FAL_KEY (alcance API): generar imagenes y videos. Todavia no se usa: generar cuesta plata
//   y cada generacion necesita la aprobacion explicita del usuario.
// - FAL_ADMIN_KEY (preset "Full access"): leer saldo y precios. Nunca sale del servidor.

const log = require('./logger');

const BASE = 'https://api.fal.ai/v1';

// Modelos que la seccion ofrece; el precio se lee en vivo de fal.ai, no se escribe aca.
const MODELS = [
  { id: 'fal-ai/nano-banana-pro', label: 'Nano Banana Pro', kind: 'Imagen', use: 'Realista y con texto legible dentro de la imagen' },
  { id: 'fal-ai/flux-2-pro', label: 'Flux 2 Pro', kind: 'Imagen', use: 'Buena calidad a menor costo' },
];

async function falGet(path, key) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Key ${key}` },
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body.error && body.error.message) || `HTTP ${res.status}`);
  return body;
}

async function overview() {
  const adminKey = process.env.FAL_ADMIN_KEY;
  const out = {
    configured: Boolean(process.env.FAL_KEY),
    balance: null,
    balanceError: null,
    models: MODELS.map((m) => ({ ...m, price: null })),
    pricesError: null,
  };
  if (!adminKey) {
    out.balanceError = 'FAL_ADMIN_KEY no configurada';
    out.pricesError = 'FAL_ADMIN_KEY no configurada';
    return out;
  }

  const [billing, pricing] = await Promise.allSettled([
    falGet('/account/billing?expand=credits', adminKey),
    falGet('/models/pricing?' + MODELS.map((m) => 'endpoint_id=' + encodeURIComponent(m.id)).join('&'), adminKey),
  ]);

  if (billing.status === 'fulfilled' && billing.value.credits) {
    out.balance = { amount: Number(billing.value.credits.current_balance), currency: billing.value.credits.currency };
  } else {
    out.balanceError = billing.status === 'rejected' ? billing.reason.message : 'Respuesta sin saldo';
    log.warn('fal_balance_failed', { error: out.balanceError });
  }

  if (pricing.status === 'fulfilled') {
    const byId = Object.fromEntries((pricing.value.prices || []).map((p) => [p.endpoint_id, p]));
    out.models = out.models.map((m) => {
      const p = byId[m.id];
      return { ...m, price: p ? { amount: p.unit_price, unit: p.unit, currency: p.currency } : null };
    });
  } else {
    out.pricesError = pricing.reason.message;
    log.warn('fal_pricing_failed', { error: out.pricesError });
  }
  return out;
}

module.exports = { overview, MODELS };
