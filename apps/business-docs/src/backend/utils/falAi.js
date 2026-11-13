// fal.ai para Arman Marketing.
// - FAL_KEY (alcance API): generar imagenes y videos. Generar cuesta plata: cada generacion
//   necesita la aprobacion explicita del usuario.
// - FAL_ADMIN_KEY (preset "Full access"): leer saldo, catalogo y precios. Nunca sale del servidor.
//
// La seccion muestra una seleccion de modelos agrupada por uso (con precio en vivo y costo de una
// pieza tipica) y un buscador sobre el catalogo completo de fal.ai.

const log = require('./logger');

const BASE = 'https://api.fal.ai/v1';

// Pieza tipica por uso, para estimar cuanto sale una generacion con el precio en vivo.
const SAMPLES = {
  imagen: { label: '1 imagen 1080x1350', images: 1, megapixels: 1.46, units: 1, generations: 1 },
  habla: { label: 'una escena de 8 s', seconds: 8 },
  video: { label: 'un video de 8 s', seconds: 8 },
  voz: { label: '30 s de voz (unas 500 letras)', chars: 500 },
  subtitulos: { label: 'transcribir 15 s de audio', seconds: 15 },
  musica: { label: '1 pista o efecto', generations: 1, units: 1, seconds: 15 },
};

// Seleccion curada. "inUse" marca lo que ya se uso en piezas reales; "note" es nuestra
// experiencia o lo que falta probar. Los precios NO se escriben aca: se leen en vivo.
const GROUPS = [
  {
    key: 'imagen', title: 'Imágenes', what: 'Crear una imagen nueva o editar una foto o captura real.',
    models: [
      { id: 'fal-ai/nano-banana-pro/edit', label: 'Nano Banana Pro (editar)', by: 'Google', inUse: true,
        use: 'Arma una escena alrededor de una imagen de base y escribe texto legible.', note: 'Lo usamos para "Cobrá en segundos": después se le puso la pantalla real encima.' },
      { id: 'openai/gpt-image-2.6/flare/edit', label: 'GPT Image 2.6 Flare (editar)', by: 'OpenAI',
        use: 'Edición precisa: cambia solo lo que se pide y deja el resto igual.', note: 'Sin probar todavía.' },
      { id: 'google/nano-banana-2.1/edit', label: 'Nano Banana 2.1 (editar)', by: 'Google',
        use: 'Edición con instrucciones de texto, hasta 4K.', note: 'Sin probar todavía.' },
      { id: 'bytedance/seedream/v5.5/edit', label: 'Seedream 5.5 (editar)', by: 'ByteDance',
        use: 'Edición con hasta 10 imágenes de referencia, económica.', note: 'Sin probar todavía.' },
      { id: 'fal-ai/flux-2-pro', label: 'Flux 2 Pro', by: 'Black Forest Labs',
        use: 'Imagen nueva desde un texto, buena calidad a bajo costo.', note: 'Sin probar todavía.' },
    ],
  },
  {
    key: 'habla', title: 'Persona hablando', what: 'Video de una persona que habla en español, con voz y labios sincronizados.',
    models: [
      { id: 'fal-ai/veo3.1/fast/image-to-video', label: 'Veo 3.1 Fast', by: 'Google', inUse: true,
        use: 'Parte de una foto y genera a la persona hablando con su voz, hasta 8 s.', note: 'Lo usamos para la almacenera. Escribir "Arvo" (no "ARVO") para que no lo deletree.' },
      { id: 'google/gemini-omni-flash/v1.2/image-to-video', label: 'Gemini Omni Flash 1.2', by: 'Google',
        use: 'Anima una foto con audio sincronizado, de 3 a 15 s.', note: 'El precio mostrado es a 360p (sirve para probar). A 720p cobra USD 0,0819/s: 8 s = USD 0,66. Probado el 13/11 a 360p.' },
      { id: 'bytedance/omnihuman/v2', label: 'OmniHuman v2', by: 'ByteDance',
        use: 'Hace hablar a la persona de una foto con un audio que le damos (por ejemplo, una voz en off).', note: 'Sirve para usar siempre la misma voz. Sin probar todavía.' },
      { id: 'heygen/heygen-video/image-to-video', label: 'HeyGen Video', by: 'HeyGen',
        use: 'Anima una foto en un clip de 5 a 15 s, con sonido.', note: 'Sin probar todavía.' },
    ],
  },
  {
    key: 'video', title: 'Video sin diálogo', what: 'Movimiento de cámara, producto o escena, sin una persona hablando.',
    models: [
      { id: 'kling/v4/image-to-video', label: 'Kling 4.0', by: 'Kuaishou', use: 'Anima una imagen en un video de 3 a 30 s.', note: 'Sin probar todavía.' },
      { id: 'kling/v4/flash/image-to-video', label: 'Kling 4.0 Flash', by: 'Kuaishou', use: 'Versión más rápida y barata de Kling 4.0.', note: 'Sin probar todavía.' },
      { id: 'pixverse/v6/max/image-to-video', label: 'PixVerse V6 Max', by: 'PixVerse', use: 'Video desde una imagen, con audio opcional.', note: 'Sin probar todavía.' },
    ],
  },
  {
    key: 'voz', title: 'Voz en off', what: 'Leer un texto con una voz natural en español.',
    models: [
      { id: 'elevenlabs/tts/eleven-v4', label: 'ElevenLabs v4', by: 'ElevenLabs', use: 'Voz natural, muchos idiomas y acentos.', note: 'Sin probar todavía.' },
      { id: 'elevenlabs/tts/eleven-v4-turbo', label: 'ElevenLabs v4 Turbo', by: 'ElevenLabs', use: 'Más rápida y más barata.', note: 'Sin probar todavía.' },
      { id: 'google/gemini-3.8-flash-tts', label: 'Gemini 3.8 Flash TTS', by: 'Google', use: 'Voz de Google, económica.', note: 'Sin probar todavía.' },
    ],
  },
  {
    key: 'subtitulos', title: 'Subtítulos', what: 'Pasar el audio a texto con los tiempos exactos de cada palabra.',
    models: [
      { id: 'fal-ai/elevenlabs/speech-to-text/scribe-v2', label: 'ElevenLabs Scribe v2', by: 'ElevenLabs', use: 'Transcripción con tiempos por palabra.', note: 'Hoy los tiempos se calculan sin IA, midiendo los silencios.' },
      { id: 'fal-ai/speech-to-text/turbo', label: 'Speech to Text Turbo', by: 'fal', use: 'Transcripción rápida y barata.', note: 'Sin probar todavía.' },
    ],
  },
  {
    key: 'musica', title: 'Música y efectos', what: 'Música de fondo o sonidos para los videos.',
    models: [
      { id: 'google/lyria-3.5', label: 'Lyria 3.5', by: 'Google', use: 'Música de cualquier estilo desde un texto.', note: 'Sin probar todavía.' },
      { id: 'mureka/v9/generate/instrumental', label: 'Mureka v9 instrumental', by: 'Mureka', use: 'Música instrumental, con variaciones.', note: 'Sin probar todavía.' },
      { id: 'elevenlabs/sound-effects/v3', label: 'ElevenLabs efectos v3', by: 'ElevenLabs', use: 'Efectos de sonido (pitidos, ambiente, etc.).', note: 'Hoy los pitidos se generan sin IA.' },
    ],
  },
];

const UNIT_ES = {
  images: 'imagen', 'processed megapixels': 'megapíxel', seconds: 'segundo', minutes: 'minuto',
  '1000 characters': '1.000 letras', generations: 'generación', units: 'unidad', '1000 tokens': '1.000 tokens',
};

// Costo de la pieza tipica segun la unidad que cobra fal. Si la unidad no se puede traducir, null.
function estimate(price, sample) {
  if (!price || !sample) return null;
  const q = {
    images: sample.images, 'processed megapixels': sample.megapixels, seconds: sample.seconds,
    minutes: sample.seconds != null ? sample.seconds / 60 : undefined, '1000 characters': sample.chars != null ? sample.chars / 1000 : undefined,
    generations: sample.generations,
  }[price.unit];
  return q == null ? null : Math.round(price.amount * q * 10000) / 10000;
}

async function falGet(path, key, tries = 3) {
  for (let i = 0; ; i++) {
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Key ${key}` }, signal: AbortSignal.timeout(15000) });
    const body = await res.json().catch(() => ({}));
    if (res.status === 429 && i < tries - 1) { await new Promise((r) => setTimeout(r, 1500 * (i + 1))); continue; }
    if (!res.ok) throw new Error((body.error && body.error.message) || body.message || `HTTP ${res.status}`);
    return body;
  }
}

// Precios de muchos modelos: de a 10 por pedido; si un lote falla (por ejemplo, un modelo dado de
// baja), se reintenta de a uno para no perder los demas.
async function prices(ids, key) {
  const out = {};
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    try {
      const d = await falGet('/models/pricing?' + chunk.map((x) => 'endpoint_id=' + encodeURIComponent(x)).join('&'), key);
      for (const p of d.prices || []) out[p.endpoint_id] = { amount: p.unit_price, unit: p.unit, unitEs: UNIT_ES[p.unit] || p.unit, currency: p.currency };
    } catch {
      for (const id of chunk) {
        try {
          const d = await falGet('/models/pricing?endpoint_id=' + encodeURIComponent(id), key);
          const p = (d.prices || [])[0];
          if (p) out[id] = { amount: p.unit_price, unit: p.unit, unitEs: UNIT_ES[p.unit] || p.unit, currency: p.currency };
        } catch { /* sin datos para ese modelo */ }
      }
    }
  }
  return out;
}

async function overview() {
  const adminKey = process.env.FAL_ADMIN_KEY;
  const out = {
    configured: Boolean(process.env.FAL_KEY),
    balance: null, balanceError: null,
    groups: GROUPS.map((g) => ({ ...g, sample: SAMPLES[g.key].label, models: g.models.map((m) => ({ ...m, price: null, estimate: null })) })),
    pricesError: null,
    catalogTotal: catalog.items ? catalog.items.length : null,
  };
  if (!adminKey) {
    out.balanceError = out.pricesError = 'FAL_ADMIN_KEY no configurada';
    return out;
  }
  const ids = GROUPS.flatMap((g) => g.models.map((m) => m.id));
  const [billing, pricing] = await Promise.allSettled([falGet('/account/billing?expand=credits', adminKey), prices(ids, adminKey)]);

  if (billing.status === 'fulfilled' && billing.value.credits) {
    out.balance = { amount: Number(billing.value.credits.current_balance), currency: billing.value.credits.currency };
  } else {
    out.balanceError = billing.status === 'rejected' ? billing.reason.message : 'Respuesta sin saldo';
    log.warn('fal_balance_failed', { error: out.balanceError });
  }
  if (pricing.status === 'fulfilled') {
    out.groups = out.groups.map((g) => ({
      ...g,
      models: g.models.map((m) => {
        const price = pricing.value[m.id] || null;
        return { ...m, price, estimate: estimate(price, SAMPLES[g.key]) };
      }),
    }));
  } else {
    out.pricesError = pricing.reason.message;
    log.warn('fal_pricing_failed', { error: out.pricesError });
  }
  return out;
}

// Catalogo completo de fal.ai (mas de mil modelos), en memoria por 6 horas.
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
const catalog = { at: 0, items: null, loading: null };

async function loadCatalog() {
  const key = process.env.FAL_ADMIN_KEY;
  if (!key) throw new Error('FAL_ADMIN_KEY no configurada');
  if (catalog.items && Date.now() - catalog.at < CATALOG_TTL_MS) return catalog.items;
  if (catalog.loading) return catalog.loading;
  catalog.loading = (async () => {
    const items = [];
    let cursor = null;
    for (let i = 0; i < 50; i++) {
      const d = await falGet('/models?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), key);
      for (const m of d.models || []) {
        const md = m.metadata || {};
        if (md.status && md.status !== 'active') continue;
        items.push({ id: m.endpoint_id, name: md.display_name || m.endpoint_id, category: md.category || 'unknown',
          description: md.description || '', license: md.license_type || null, date: md.date || null, url: md.model_url || null });
      }
      if (!d.has_more) break;
      cursor = d.next_cursor;
    }
    catalog.items = items;
    catalog.at = Date.now();
    return items;
  })().finally(() => { catalog.loading = null; });
  return catalog.loading;
}

const CATEGORY_ES = {
  'text-to-image': 'Imagen desde texto', 'image-to-image': 'Editar imagen', 'text-to-video': 'Video desde texto',
  'image-to-video': 'Video desde imagen', 'video-to-video': 'Editar video', 'audio-to-video': 'Video desde audio',
  'text-to-speech': 'Voz', 'text-to-audio': 'Música y sonido', 'speech-to-text': 'Transcripción', 'audio-to-audio': 'Editar audio',
};

// Busca en el catalogo y devuelve hasta 20 resultados con su precio en vivo.
async function searchCatalog({ q = '', category = '' } = {}) {
  const items = await loadCatalog();
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  const hits = items
    .filter((m) => !category || m.category === category)
    .filter((m) => words.every((w) => (m.id + ' ' + m.name + ' ' + m.description).toLowerCase().includes(w)))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const page = hits.slice(0, 20);
  const p = await prices(page.map((m) => m.id), process.env.FAL_ADMIN_KEY).catch(() => ({}));
  const counts = {};
  for (const m of items) counts[m.category] = (counts[m.category] || 0) + 1;
  return {
    total: items.length, matches: hits.length,
    categories: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, label: CATEGORY_ES[k] || k, count: n })),
    results: page.map((m) => ({ ...m, categoryEs: CATEGORY_ES[m.category] || m.category, price: p[m.id] || null })),
  };
}

// Historial de gastos: lo que fal.ai cobro (por modelo y por dia) y cada pedido con su prompt
// y su resultado. Las imagenes de referencia que viajan en base64 se reemplazan por un texto corto.
const HISTORY_TTL_MS = 5 * 60 * 1000;
const history = { at: 0, data: null };

function cleanInput(v) {
  if (typeof v === 'string') return v.startsWith('data:') ? `[archivo adjunto, ${v.slice(5, v.indexOf(';')) || 'datos'}]` : v;
  if (Array.isArray(v)) return v.map(cleanInput);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cleanInput(x)]));
  return v;
}

function outputOf(o) {
  if (!o) return null;
  if (o.video && o.video.url) return { type: 'video', url: o.video.url, bytes: o.video.file_size || null };
  const img = (o.images && o.images[0]) || o.image;
  if (img && img.url) return { type: 'imagen', url: img.url, bytes: img.file_size || null };
  if (o.audio && o.audio.url) return { type: 'audio', url: o.audio.url, bytes: o.audio.file_size || null };
  return null;
}

async function spendHistory({ days = 90, force = false, pieces = [] } = {}) {
  const key = process.env.FAL_ADMIN_KEY;
  if (!key) throw new Error('FAL_ADMIN_KEY no configurada');
  if (!force && history.data && Date.now() - history.at < HISTORY_TTL_MS) return withPieces(history.data, pieces);
  const start = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10) + 'T00:00:00Z';
  const usage = await falGet(`/models/usage?start=${start}&expand=time_series&timeframe=day`, key);

  // Gasto por modelo y por dia (dato oficial de facturacion)
  const buckets = [];
  for (const b of usage.time_series || []) {
    for (const r of b.results || []) buckets.push({ day: b.bucket.slice(0, 10), endpoint: r.endpoint_id, unit: r.unit, qty: r.quantity, cost: r.cost_total ?? r.cost, currency: r.currency });
  }
  const endpoints = [...new Set(buckets.map((b) => b.endpoint))];

  // Pedidos de cada modelo usado, con prompt y resultado
  const requests = [];
  for (const ep of endpoints) {
    try {
      const d = await falGet(`/models/requests/by-endpoint?endpoint_id=${encodeURIComponent(ep)}&limit=50&start=${start}&expand=payloads`, key);
      for (const it of d.items || []) {
        requests.push({ id: it.request_id, endpoint: ep, at: it.started_at || it.sent_at, ok: it.status_code === 200, status: it.status_code,
          seconds: it.duration != null ? Math.round(it.duration) : null, input: cleanInput(it.json_input || null), output: outputOf(it.json_output) });
      }
    } catch (e) {
      log.warn('fal_requests_failed', { endpoint: ep, error: e.message });
    }
  }

  // Costo por pedido: el gasto de ese modelo ese dia, repartido entre sus pedidos exitosos de ese dia.
  for (const r of requests) {
    const day = String(r.at || '').slice(0, 10);
    const b = buckets.find((x) => x.endpoint === r.endpoint && x.day === day);
    const same = requests.filter((x) => x.endpoint === r.endpoint && String(x.at || '').slice(0, 10) === day && x.ok);
    r.cost = b && r.ok ? b.cost / same.length : r.ok ? null : 0;
    r.costExact = Boolean(b) && same.length === 1;
    r.currency = b ? b.currency : 'USD';
    r.billed = b && same.length === 1 ? { qty: b.qty, unit: UNIT_ES[b.unit] || b.unit } : null;
  }
  requests.sort((a, b) => String(b.at).localeCompare(String(a.at)));

  const names = { ...Object.fromEntries(GROUPS.flatMap((g) => g.models.map((m) => [m.id, m.label]))), 'fal-ai/veo3.1/fast': 'Veo 3.1 Fast (desde texto)' };
  for (const r of requests) r.model = names[r.endpoint] || r.endpoint;
  const byModel = endpoints.map((ep) => ({ endpoint: ep, model: names[ep] || ep,
    cost: buckets.filter((b) => b.endpoint === ep).reduce((s, b) => s + b.cost, 0),
    count: requests.filter((r) => r.endpoint === ep && r.ok).length })).sort((a, b) => b.cost - a.cost);
  const total = buckets.reduce((s, b) => s + b.cost, 0);

  history.data = { since: start.slice(0, 10), total, currency: 'USD', byModel, requests };
  history.at = Date.now();
  return withPieces(history.data, pieces);
}

// Cruza cada pedido con las piezas de la galeria que lo usaron (campo falRequests del manifest).
function withPieces(data, pieces) {
  return { ...data, requests: data.requests.map((r) => ({ ...r, usedIn: pieces.filter((p) => (p.falRequests || []).includes(r.id)).map((p) => ({ file: p.file, title: p.title })) })) };
}

module.exports = { overview, searchCatalog, spendHistory, GROUPS };
