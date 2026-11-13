// Generacion de contenido con IA (fal.ai) desde Arman Marketing.
//
// Reglas (gastar plata):
// - Cada generacion muestra antes el costo estimado y exige confirm:true + el mismo costo que vio el usuario.
// - Tope por generacion: MARKETING_MAX_USD_POR_GENERACION (por defecto USD 2).
// - No arranca si el saldo de fal.ai no alcanza para el maximo estimado.
// - Todo queda registrado (base de datos si hay DATABASE_URL; si no, generaciones.json en la carpeta del material).
// - El resultado se guarda en la galeria y queda ligado al pedido de fal.ai (falRequests).
//
// Precios: el precio base se lee en vivo de fal.ai. Lo que la API de precios no informa (precio por
// resolucion) sale de la pagina de cada modelo en fal.ai, con la fecha en que se leyo.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const log = require('./logger');
const marketingMedia = require('./marketingMedia');

const QUEUE = 'https://queue.fal.run';
const MAX_USD = () => Number(process.env.MARKETING_MAX_USD_POR_GENERACION || 2);
const PRICES_READ = '13/11/2026';

const PROMPT_PERSONA = `The same woman from the image, owner of this small neighborhood grocery store in Buenos Aires, stands behind the wooden counter holding her smartphone with the screen facing her (the screen is never visible to the camera). She looks straight into the camera and speaks in Argentine Rioplatense Spanish (voseo, Buenos Aires accent), warm, confident and natural, at a lively but clear pace:
"{{FRASE}}"
Important: "Arvo" is a brand name pronounced as one single word, "AR-vo" (like "árbol" without the "l"), never spelled out letter by letter.
Realistic, natural light, medium close-up, subtle handheld camera movement, she keeps both hands near the counter. Background shelves keep generic unbranded products with no readable text. Audio: only her voice and soft ambient store sound, no music, no other voices.`;

const PROMPT_ESCENA = `Photorealistic advertising photo for a small-business point of sale app. Use the reference image as the phone screen content. A friendly shop owner in a small neighborhood store in Buenos Aires holds a modern smartphone showing exactly the reference screen. Natural warm light, shallow depth of field. Shelves with generic unbranded products, no logos, no readable text except on the phone screen. {{IDEA}}`;

const PROMPT_IMAGEN = `Photorealistic advertising photo for ARVO, a mobile point of sale app for small shops in Argentina. {{IDEA}} Natural warm light, generic unbranded products, no logos and no readable text.`;

const FRASE_DEFAULT = '¿Seguís anotando las ventas en un cuaderno? Yo ahora vendo con Arvo: escaneo, cobro, y listo.';

// Opciones de cada modelo. "price" devuelve { perUnit, unit, qty, note } segun las opciones elegidas.
const MODELS = {
  'gemini-omni': {
    group: 'habla', label: 'Gemini Omni Flash 1.2', by: 'Google', endpoint: 'google/gemini-omni-flash/v1.2/image-to-video', kind: 'video',
    status: 'Probado', use: 'Persona que habla con su voz, partiendo de una foto. El más barato con voz.',
    note: 'Probado a 360p: voz y gestos bien, imagen borrosa. Para publicar, 720p.',
    options: [
      { key: 'refs', type: 'images', label: 'Foto de la persona (primer cuadro del video)', min: 1, max: 1 },
      { key: 'frase', type: 'text', label: 'Lo que dice (máximo 8 a 10 segundos)', default: FRASE_DEFAULT },
      { key: 'resolution', type: 'select', label: 'Resolución', default: '720p',
        choices: [['360p', '360p (prueba de voz)'], ['720p', '720p (para publicar)'], ['1080p', '1080p']] },
      { key: 'duration', type: 'number', label: 'Segundos', min: 3, max: 15, default: 8 },
    ],
    template: PROMPT_PERSONA,
    // Pagina de fal.ai: 360p 0,0273; 720p 0,0819; 1080p 0,1229 USD/s. Facturo 8,45 s en un pedido de 8 s.
    price: (o) => ({ perUnit: { '360p': 0.0273, '720p': 0.0819, '1080p': 0.1229 }[o.resolution], unit: 'segundo', qty: Number(o.duration), margin: 0.08,
      note: 'fal.ai puede cobrar algo más de los segundos pedidos (en la prueba cobró 8,45 s por 8 s).' }),
    build: (o, prompt, refs) => ({ prompt, image_url: refs[0], aspect_ratio: '9:16', duration: Number(o.duration), resolution: o.resolution }),
  },
  'veo-fast': {
    group: 'habla', label: 'Veo 3.1 Fast', by: 'Google', endpoint: 'fal-ai/veo3.1/fast/image-to-video', kind: 'video',
    status: 'En uso', use: 'Persona que habla con su voz, partiendo de una foto. Mejor nitidez.',
    note: 'Usado en el video de la almacenera. Escribir "Arvo" (no "ARVO").',
    options: [
      { key: 'refs', type: 'images', label: 'Foto de la persona (primer cuadro del video, 720p o más)', min: 1, max: 1 },
      { key: 'frase', type: 'text', label: 'Lo que dice (máximo 8 segundos)', default: FRASE_DEFAULT },
      { key: 'resolution', type: 'select', label: 'Resolución', default: '720p', choices: [['720p', '720p'], ['1080p', '1080p (mismo precio)']] },
      { key: 'duration', type: 'select', label: 'Segundos', default: '8s', choices: [['4s', '4'], ['6s', '6'], ['8s', '8']] },
    ],
    template: PROMPT_PERSONA,
    // Pagina de fal.ai: USD 0,15/s con audio a 720p o 1080p.
    price: (o) => ({ perUnit: 0.15, unit: 'segundo', qty: parseInt(o.duration, 10), margin: 0 }),
    build: (o, prompt, refs) => ({ prompt, image_url: refs[0], aspect_ratio: '9:16', duration: o.duration, resolution: o.resolution, generate_audio: true }),
  },
  'nano-edit': {
    group: 'imagen', label: 'Nano Banana Pro (con imagen de base)', by: 'Google', endpoint: 'fal-ai/nano-banana-pro/edit', kind: 'imagen',
    status: 'En uso', use: 'Arma una escena alrededor de una captura o foto real que le das.',
    note: 'Usado en "Cobrá en segundos". La pantalla del celular después se reemplaza por la real.',
    options: [
      { key: 'refs', type: 'images', label: 'Imágenes de base (capturas reales, fotos)', min: 1, max: 3 },
      { key: 'idea', type: 'text', label: 'Qué escena querés', default: 'The owner smiles while a customer pays at the counter.' },
      { key: 'aspect_ratio', type: 'select', label: 'Formato', default: '4:5', choices: [['4:5', 'Feed 4:5'], ['1:1', 'Feed 1:1'], ['9:16', 'Historia 9:16']] },
      { key: 'resolution', type: 'select', label: 'Resolución', default: '2K', choices: [['1K', '1K'], ['2K', '2K (recomendada)']] },
    ],
    template: PROMPT_ESCENA,
    // Pagina de fal.ai: USD 0,15 por imagen; 4K cuesta el doble (no se ofrece).
    price: () => ({ perUnit: 0.15, unit: 'imagen', qty: 1, margin: 0 }),
    build: (o, prompt, refs) => ({ prompt, image_urls: refs, aspect_ratio: o.aspect_ratio, resolution: o.resolution, num_images: 1, output_format: 'jpeg' }),
  },
  'nano': {
    group: 'imagen', label: 'Nano Banana Pro (desde texto)', by: 'Google', endpoint: 'fal-ai/nano-banana-pro', kind: 'imagen',
    status: 'Sin probar', use: 'Imagen nueva desde un texto, realista y con texto legible.',
    options: [
      { key: 'idea', type: 'text', label: 'Qué imagen querés', default: 'A shop owner in a small grocery store uses her phone at the counter.' },
      { key: 'aspect_ratio', type: 'select', label: 'Formato', default: '4:5', choices: [['4:5', 'Feed 4:5'], ['1:1', 'Feed 1:1'], ['9:16', 'Historia 9:16']] },
      { key: 'resolution', type: 'select', label: 'Resolución', default: '2K', choices: [['1K', '1K'], ['2K', '2K (recomendada)']] },
    ],
    template: PROMPT_IMAGEN,
    price: () => ({ perUnit: 0.15, unit: 'imagen', qty: 1, margin: 0 }),
    build: (o, prompt) => ({ prompt, aspect_ratio: o.aspect_ratio, resolution: o.resolution, num_images: 1, output_format: 'jpeg' }),
  },
  'flux': {
    group: 'imagen', label: 'Flux 2 Pro', by: 'Black Forest Labs', endpoint: 'fal-ai/flux-2-pro', kind: 'imagen',
    status: 'Sin probar', use: 'Imagen nueva desde un texto, a muy bajo costo. Peor con textos dentro de la imagen.',
    options: [
      { key: 'idea', type: 'text', label: 'Qué imagen querés', default: 'A shop owner in a small grocery store uses her phone at the counter.' },
      { key: 'image_size', type: 'select', label: 'Formato', default: 'portrait_4_3', choices: [['portrait_4_3', 'Vertical 3:4'], ['portrait_16_9', 'Historia 9:16'], ['square_hd', 'Cuadrada']] },
    ],
    template: PROMPT_IMAGEN,
    // Precio en vivo: USD 0,03 por megapixel procesado; estos tamaños rondan 1 megapixel.
    price: () => ({ perUnit: 0.03, unit: 'megapíxel', qty: 1, margin: 0.5, note: 'Cobra por megapíxel: estos tamaños rondan 1 MP.' }),
    build: (o, prompt) => ({ prompt, image_size: o.image_size, output_format: 'jpeg' }),
  },
  'eleven-v4': {
    group: 'voz', label: 'ElevenLabs v4', by: 'ElevenLabs', endpoint: 'elevenlabs/tts/eleven-v4', kind: 'audio',
    status: 'Sin probar', use: 'Voz en off natural a partir de un texto. Sirve para narrar las pantallas.',
    options: [
      { key: 'text', type: 'text', label: 'Texto a leer', default: 'Con Arvo escaneás, cobrás y listo. La venta queda registrada y el stock al día.' },
      { key: 'voice', type: 'select', label: 'Voz', default: 'Laura', choices: [['Laura', 'Laura (mujer)'], ['Sarah', 'Sarah (mujer)'], ['Charlie', 'Charlie (hombre)'], ['George', 'George (hombre)']] },
    ],
    template: null,
    price: (o) => ({ perUnit: 0.08, unit: '1.000 letras', qty: Math.max(String(o.text || '').length, 1) / 1000, margin: 0 }),
    build: (o) => ({ text: o.text, voice: o.voice, language_code: 'es', output_format: 'mp3_44100_128' }),
  },
};

const GROUPS = [
  { key: 'habla', title: 'Persona hablando', what: 'Video de una persona que habla en español a cámara.' },
  { key: 'imagen', title: 'Imagen', what: 'Imagen para el feed o historias.' },
  { key: 'voz', title: 'Voz en off', what: 'Audio con una voz que lee un texto.' },
];

// ── Registro (base de datos o archivo) ────────────────────────────────────────
const useDb = () => Boolean(process.env.DATABASE_URL);
const db = () => require('./db');
const FILE = () => path.join(marketingMedia.DIR, 'generaciones.json');

const SQL = `
  CREATE SCHEMA IF NOT EXISTS marketing;
  CREATE TABLE IF NOT EXISTS marketing.generaciones (
    id              VARCHAR(40) PRIMARY KEY,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_email      VARCHAR(200),
    model_key       VARCHAR(40) NOT NULL,
    endpoint        VARCHAR(200) NOT NULL,
    kind            VARCHAR(20) NOT NULL,
    title           VARCHAR(200),
    prompt          TEXT,
    params          JSONB NOT NULL DEFAULT '{}'::jsonb,
    refs            JSONB NOT NULL DEFAULT '[]'::jsonb,
    estimate_usd    NUMERIC(10,4),
    estimate_max_usd NUMERIC(10,4),
    status          VARCHAR(20) NOT NULL,
    fal_request_id  VARCHAR(80),
    status_url      TEXT,
    response_url    TEXT,
    output_file     VARCHAR(200),
    output_url      TEXT,
    cost_usd        NUMERIC(10,4),
    error           TEXT,
    finished_at     TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_marketing_gen_created ON marketing.generaciones(created_at DESC);
`;
const COLS = ['id', 'created_at', 'user_email', 'model_key', 'endpoint', 'kind', 'title', 'prompt', 'params', 'refs', 'estimate_usd',
  'estimate_max_usd', 'status', 'fal_request_id', 'status_url', 'response_url', 'output_file', 'output_url', 'cost_usd', 'error', 'finished_at'];

async function ensureTable() {
  if (useDb()) await db().query(SQL);
}

function readFile() { try { return JSON.parse(fs.readFileSync(FILE(), 'utf8')); } catch { return []; } }
function writeFile(rows) { fs.mkdirSync(path.dirname(FILE()), { recursive: true }); fs.writeFileSync(FILE(), JSON.stringify(rows, null, 2)); }
const num = (v) => (v == null ? null : Number(v));
const norm = (r) => ({ ...r, estimate_usd: num(r.estimate_usd), estimate_max_usd: num(r.estimate_max_usd), cost_usd: num(r.cost_usd) });

async function insertRow(row) {
  if (!useDb()) { writeFile([row, ...readFile()]); return row; }
  const vals = COLS.map((c) => (c === 'params' || c === 'refs' ? JSON.stringify(row[c] || (c === 'refs' ? [] : {})) : row[c] ?? null));
  await db().query(`INSERT INTO marketing.generaciones (${COLS.join(',')}) VALUES (${COLS.map((_, i) => '$' + (i + 1)).join(',')})`, vals);
  return row;
}

async function updateRow(id, patch) {
  if (!useDb()) { writeFile(readFile().map((r) => (r.id === id ? { ...r, ...patch } : r))); return; }
  const keys = Object.keys(patch);
  await db().query(`UPDATE marketing.generaciones SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...keys.map((k) => patch[k])]);
}

async function listRows(limit = 50) {
  if (!useDb()) return readFile().slice(0, limit).map(norm);
  const { rows } = await db().query(`SELECT ${COLS.join(',')} FROM marketing.generaciones ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows.map(norm);
}

// ── Opciones, estimacion y generacion ─────────────────────────────────────────
function publicModels() {
  return GROUPS.map((g) => ({
    ...g,
    models: Object.entries(MODELS).filter(([, m]) => m.group === g.key).map(([key, m]) => ({
      key, label: m.label, by: m.by, kind: m.kind, status: m.status, use: m.use, note: m.note || '', options: m.options, template: m.template,
    })),
  }));
}

function cleanOptions(m, raw = {}) {
  const o = {};
  for (const op of m.options) {
    if (op.type === 'images') continue;
    let v = raw[op.key] ?? op.default;
    if (op.type === 'select' && !op.choices.some(([c]) => c === v)) v = op.default;
    if (op.type === 'number') v = Math.min(op.max, Math.max(op.min, Math.round(Number(v) || op.default)));
    if (op.type === 'text') v = String(v || '').trim().slice(0, 1500);
    o[op.key] = v;
  }
  return o;
}

function estimate(modelKey, rawOptions) {
  const m = MODELS[modelKey];
  if (!m) throw Object.assign(new Error('Modelo desconocido'), { status: 400 });
  const o = cleanOptions(m, rawOptions);
  const p = m.price(o);
  const amount = Math.round(p.perUnit * p.qty * 10000) / 10000;
  const max = Math.round(amount * (1 + (p.margin || 0)) * 10000) / 10000;
  return { model: modelKey, options: o, perUnit: p.perUnit, unit: p.unit, qty: Math.round(p.qty * 1000) / 1000, amount, max, cap: MAX_USD(),
    note: p.note || null, pricesRead: PRICES_READ };
}

function buildPrompt(m, o, customPrompt) {
  if (!m.template) return null;
  const base = String(customPrompt || '').trim() || m.template;
  return base.replace('{{FRASE}}', o.frase || '').replace('{{IDEA}}', o.idea || '').slice(0, 4000);
}

async function balanceUsd() {
  const key = process.env.FAL_ADMIN_KEY;
  if (!key) return null;
  const r = await fetch('https://api.fal.ai/v1/account/billing?expand=credits', { headers: { Authorization: `Key ${key}` }, signal: AbortSignal.timeout(10000) });
  const d = await r.json().catch(() => ({}));
  return d.credits ? Number(d.credits.current_balance) : null;
}

const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'video/mp4': '.mp4', 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3' };

async function start({ model: modelKey, options, prompt: customPrompt, refs = [], title, confirm, expectedUsd, user }) {
  if (!process.env.FAL_KEY) throw Object.assign(new Error('Falta FAL_KEY'), { status: 400 });
  const m = MODELS[modelKey];
  if (!m) throw Object.assign(new Error('Modelo desconocido'), { status: 400 });
  const est = estimate(modelKey, options);
  if (confirm !== true) throw Object.assign(new Error('Falta la confirmación explícita del gasto'), { status: 400 });
  if (Math.abs(Number(expectedUsd) - est.max) > 0.0001) throw Object.assign(new Error('El costo cambió. Revisá el estimado y confirmá de nuevo.'), { status: 409 });
  if (est.max > est.cap) throw Object.assign(new Error(`Supera el tope de US$ ${est.cap} por generación`), { status: 400 });
  const bal = await balanceUsd().catch(() => null);
  if (bal != null && bal < est.max) throw Object.assign(new Error(`El saldo de fal.ai (US$ ${bal.toFixed(2)}) no alcanza`), { status: 400 });

  const imgOpt = m.options.find((x) => x.type === 'images');
  const refFiles = (Array.isArray(refs) ? refs : []).map((f) => path.basename(String(f))).slice(0, imgOpt ? imgOpt.max : 0);
  if (imgOpt && refFiles.length < imgOpt.min) throw Object.assign(new Error('Elegí la imagen de base'), { status: 400 });
  const refUrls = refFiles.map((f) => {
    const full = marketingMedia.resolveFile(f);
    if (!full || !/\.(jpe?g|png|webp)$/i.test(full)) throw Object.assign(new Error('Imagen de base no válida: ' + f), { status: 400 });
    const mime = /\.png$/i.test(full) ? 'image/png' : /\.webp$/i.test(full) ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,` + fs.readFileSync(full).toString('base64');
  });
  const prompt = buildPrompt(m, est.options, customPrompt);
  const input = m.build(est.options, prompt, refUrls);

  const row = {
    id: crypto.randomUUID(), created_at: new Date().toISOString(), user_email: user || null, model_key: modelKey, endpoint: m.endpoint, kind: m.kind,
    title: String(title || '').trim().slice(0, 200) || m.label, prompt: prompt || est.options.text || null, params: est.options, refs: refFiles,
    estimate_usd: est.amount, estimate_max_usd: est.max, status: 'en_cola', fal_request_id: null, status_url: null, response_url: null,
    output_file: null, output_url: null, cost_usd: null, error: null, finished_at: null,
  };
  await insertRow(row);
  try {
    const res = await fetch(`${QUEUE}/${m.endpoint}`, {
      method: 'POST', headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input), signal: AbortSignal.timeout(60000),
    });
    const sub = await res.json().catch(() => ({}));
    if (!sub.request_id) throw new Error((sub.detail && JSON.stringify(sub.detail).slice(0, 300)) || sub.message || `HTTP ${res.status}`);
    const patch = { status: 'generando', fal_request_id: sub.request_id, status_url: sub.status_url, response_url: sub.response_url };
    await updateRow(row.id, patch);
    Object.assign(row, patch);
    log.info('marketing_gen_started', { id: row.id, model: modelKey, estimate: est.max, by: user });
    kick();
  } catch (e) {
    await updateRow(row.id, { status: 'error', error: 'No se pudo enviar a fal.ai: ' + e.message, finished_at: new Date().toISOString(), cost_usd: 0 });
    throw Object.assign(new Error('No se pudo enviar a fal.ai: ' + e.message), { status: 502 });
  }
  return norm(row);
}

// ── Seguimiento: consulta fal.ai hasta que termine y guarda el resultado en la galeria ──
let timer = null;
let busy = false;
function kick() { if (!timer) timer = setInterval(() => { tick().catch((e) => log.warn('marketing_gen_tick_failed', { error: e.message })); }, 5000); }

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const active = (await listRows(100)).filter((r) => r.status === 'generando' && r.status_url);
    if (!active.length) { clearInterval(timer); timer = null; return; }
    const H = { Authorization: `Key ${process.env.FAL_KEY}` };
    for (const r of active) {
      const st = await (await fetch(r.status_url, { headers: H, signal: AbortSignal.timeout(20000) })).json().catch(() => ({}));
      if (st.status !== 'COMPLETED') continue;
      const res = await (await fetch(r.response_url, { headers: H, signal: AbortSignal.timeout(30000) })).json().catch(() => ({}));
      const out = (res.video) || (res.images && res.images[0]) || res.image || res.audio;
      if (!out || !out.url) {
        await updateRow(r.id, { status: 'error', error: 'fal.ai no devolvió el archivo: ' + JSON.stringify(res.detail || res).slice(0, 300), finished_at: new Date().toISOString() });
        continue;
      }
      const bin = Buffer.from(await (await fetch(out.url, { signal: AbortSignal.timeout(120000) })).arrayBuffer());
      const ext = MIME_EXT[out.content_type] || path.extname(new URL(out.url).pathname) || '.bin';
      const m = MODELS[r.model_key] || {};
      const format = r.kind === 'video' ? 'Reel / Historia 9:16' : r.kind === 'audio' ? 'Audio' : ({ '4:5': 'Feed 4:5', '1:1': 'Feed 1:1', '9:16': 'Reel / Historia 9:16' }[r.params.aspect_ratio] || 'Imagen');
      const entry = marketingMedia.add(bin, {
        originalName: (r.title || 'generado') + ext, title: r.title, kind: r.kind, format, origin: 'Generado con IA',
        notes: `${m.label || r.endpoint}. Generado desde business-docs.`, by: r.user_email,
      }, { costUsd: r.estimate_usd, falRequests: [r.fal_request_id] });
      await updateRow(r.id, { status: 'listo', output_file: entry.file, output_url: out.url, finished_at: new Date().toISOString() });
      log.info('marketing_gen_done', { id: r.id, file: entry.file });
    }
  } finally {
    busy = false;
  }
}

// Al arrancar el servidor, retoma las generaciones que quedaron a mitad de camino.
function resume() { setTimeout(() => { listRows(100).then((rows) => { if (rows.some((r) => r.status === 'generando')) kick(); }).catch(() => {}); }, 8000); }

// Completa el costo real con lo que facturo fal.ai (historial de Gastos en IA).
async function withRealCost(rows, history) {
  const byId = Object.fromEntries((history && history.requests || []).map((h) => [h.id, h]));
  for (const r of rows) {
    const h = r.fal_request_id && byId[r.fal_request_id];
    if (h && h.cost != null && h.costExact && r.cost_usd == null) {
      r.cost_usd = Math.round(h.cost * 10000) / 10000;
      await updateRow(r.id, { cost_usd: r.cost_usd }).catch(() => {});
    }
  }
  return rows;
}

module.exports = { publicModels, estimate, start, listRows, withRealCost, ensureTable, resume, MAX_USD };
