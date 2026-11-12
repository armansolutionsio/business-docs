// Publicacion organica en Instagram (@ cuenta META_IG_ACCOUNT_ID) para Arman Marketing.
// Es una accion PUBLICA: la ruta exige confirm:true y la UI pide confirmacion explicita.
//
// - Videos (Reels): subida directa a Meta (upload_type=resumable). Funciona tambien en local.
// - Imagenes: Instagram las descarga de una URL publica. Hace falta MARKETING_PUBLIC_BASE_URL
//   (ej. https://docs.armansolutions.com) para armar un link firmado y temporal al archivo.
//
// Cada publicacion queda registrada en publicaciones.json, en la carpeta del material.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const log = require('./logger');
const marketingMedia = require('./marketingMedia');

const VERSION = process.env.META_API_VERSION || 'v27.0';
const BASE = `https://graph.facebook.com/${VERSION}`;
const LOG_FILE = path.join(marketingMedia.DIR, 'publicaciones.json');
const LINK_TTL_S = 60 * 60;
const inProgress = new Set();

const token = () => process.env.META_ACCESS_TOKEN;
const igId = () => process.env.META_IG_ACCOUNT_ID;
const publicBase = () => (process.env.MARKETING_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const secret = () => process.env.JWT_SECRET || 'arman-marketing';

function status() {
  return {
    configured: Boolean(token() && igId()),
    images: Boolean(publicBase()),
    videos: true,
    imagesHint: publicBase() ? null : 'Las imágenes se publican desde el servidor (Instagram necesita un link público al archivo). Los videos se pueden publicar desde acá.',
  };
}

async function graph(method, p, params = {}) {
  const url = new URL(`${BASE}/${p}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token()}` }, signal: AbortSignal.timeout(30000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const e = body.error || {};
    throw new Error(e.error_user_msg || (e.message ? `${e.message} (code ${e.code})` : `HTTP ${res.status}`));
  }
  return body;
}

// Link firmado y temporal para que Instagram descargue una imagen sin JWT.
function sign(file, exp) {
  return crypto.createHmac('sha256', secret()).update(`${file}:${exp}`).digest('hex').slice(0, 32);
}
function publicLink(file) {
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_S;
  return `${publicBase()}/marketing-publico/${encodeURIComponent(file)}?exp=${exp}&sig=${sign(file, exp)}`;
}
function checkLink(file, exp, sig) {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const want = Buffer.from(sign(file, String(exp)));
  const got = Buffer.from(String(sig));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

function readLog() {
  try { return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch { return []; }
}
function appendLog(entry) {
  const all = readLog();
  all.unshift(entry);
  fs.writeFileSync(LOG_FILE, JSON.stringify(all, null, 2));
}

async function waitFinished(containerId) {
  const until = Date.now() + 5 * 60 * 1000;
  while (Date.now() < until) {
    const s = await graph('GET', containerId, { fields: 'status_code,status' });
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram no pudo procesar el archivo: ${s.status || s.status_code}`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error('Instagram tardó más de 5 minutos en procesar el archivo. No se publicó.');
}

async function uploadVideo(containerUri, full) {
  const size = fs.statSync(full).size;
  const res = await fetch(containerUri, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token()}`, offset: '0', file_size: String(size), 'Content-Type': 'application/octet-stream' },
    body: fs.readFileSync(full),
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false || body.error) {
    throw new Error(`No se pudo subir el video a Meta: ${(body.error && (body.error.message || body.debug_info && body.debug_info.message)) || 'HTTP ' + res.status}`);
  }
}

async function publish({ file, caption, user }) {
  const st = status();
  if (!st.configured) throw Object.assign(new Error('Falta configurar META_ACCESS_TOKEN o META_IG_ACCOUNT_ID'), { status: 400 });
  const item = marketingMedia.list().find((m) => m.file === path.basename(String(file || '')));
  if (!item) throw Object.assign(new Error('Archivo no encontrado en el material'), { status: 404 });
  if (!['imagen', 'video'].includes(item.kind)) throw Object.assign(new Error('Solo se publican imágenes y videos'), { status: 400 });
  if (item.kind === 'video' && !/^Reel/.test(item.format || '')) throw Object.assign(new Error('Solo se publican los videos en formato Reel'), { status: 400 });
  if (item.kind === 'imagen' && !st.images) throw Object.assign(new Error(st.imagesHint), { status: 400 });
  const text = String(caption || '').trim();
  if (text.length > 2200) throw Object.assign(new Error('El texto supera los 2.200 caracteres que permite Instagram'), { status: 400 });
  if (inProgress.has(item.file)) throw Object.assign(new Error('Esta pieza ya se está publicando'), { status: 409 });

  inProgress.add(item.file);
  try {
    const full = marketingMedia.resolveFile(item.file);
    let container;
    if (item.kind === 'video') {
      container = await graph('POST', `${igId()}/media`, { media_type: 'REELS', upload_type: 'resumable', caption: text, share_to_feed: 'true' });
      await uploadVideo(container.uri || `https://rupload.facebook.com/ig-api-upload/${VERSION}/${container.id}`, full);
    } else {
      container = await graph('POST', `${igId()}/media`, { image_url: publicLink(item.file), caption: text });
    }
    await waitFinished(container.id);
    const pub = await graph('POST', `${igId()}/media_publish`, { creation_id: container.id });
    const info = await graph('GET', pub.id, { fields: 'permalink,timestamp' }).catch(() => ({}));
    const entry = { file: item.file, mediaId: pub.id, permalink: info.permalink || null, type: item.kind === 'video' ? 'reel' : 'post', caption: text, publishedAt: new Date().toISOString(), by: user || null };
    appendLog(entry);
    log.info('instagram_published', { file: item.file, mediaId: pub.id, by: user });
    return entry;
  } finally {
    inProgress.delete(item.file);
  }
}

module.exports = { status, publish, readLog, checkLink };
