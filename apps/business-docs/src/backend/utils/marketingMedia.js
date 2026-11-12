// Galeria de Arman Marketing: imagenes, videos y capturas listas para usar en campanas.
// Los archivos viven en MARKETING_MEDIA_DIR (por defecto apps/business-docs/uploads/marketing),
// fuera de git. manifest.json describe cada pieza (titulo, formato, origen, costo).
// En el servidor (Coolify) MARKETING_MEDIA_DIR tiene que apuntar a un volumen persistente.

const fs = require('fs');
const path = require('path');

const DIR = process.env.MARKETING_MEDIA_DIR || path.join(__dirname, '../../../uploads/marketing');
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4' };

function readManifest() {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')); }
  catch { return []; }
}

function list() {
  return readManifest()
    .map((m) => {
      const file = path.basename(m.file || '');
      try {
        const st = fs.statSync(path.join(DIR, file));
        return { ...m, file, bytes: st.size, mime: MIME[path.extname(file).toLowerCase()] || null };
      } catch { return null; }
    })
    .filter(Boolean);
}

// Solo sirve archivos que figuran en el manifest (evita leer cualquier cosa del disco).
function resolveFile(name) {
  const file = path.basename(String(name || ''));
  if (!readManifest().some((m) => path.basename(m.file || '') === file)) return null;
  const full = path.join(DIR, file);
  return fs.existsSync(full) ? full : null;
}

const KINDS = ['imagen', 'video', 'captura'];
const MAX_BYTES = 300 * 1024 * 1024;

// Nombre de archivo seguro: minusculas, sin acentos ni espacios, y sin pisar uno existente.
function safeName(original, ext) {
  const base = path.basename(String(original || 'pieza'), path.extname(String(original || '')))
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'pieza';
  let name = base + ext;
  for (let i = 2; fs.existsSync(path.join(DIR, name)) || name === 'manifest.json'; i++) name = `${base}-${i}${ext}`;
  return name;
}

// Guarda una pieza nueva y la agrega al principio del manifest.
function add(buffer, meta = {}) {
  const ext = path.extname(String(meta.originalName || '')).toLowerCase();
  if (!MIME[ext]) throw Object.assign(new Error('Formato no permitido. Usá JPG, PNG, WEBP o MP4.'), { status: 400 });
  if (!buffer || !buffer.length) throw Object.assign(new Error('El archivo está vacío'), { status: 400 });
  if (buffer.length > MAX_BYTES) throw Object.assign(new Error('El archivo supera los 300 MB'), { status: 400 });
  const isVideo = ext === '.mp4';
  const kind = KINDS.includes(meta.kind) ? meta.kind : (isVideo ? 'video' : 'imagen');
  if ((kind === 'video') !== isVideo) throw Object.assign(new Error('El tipo elegido no coincide con el archivo'), { status: 400 });
  const title = String(meta.title || '').trim().slice(0, 120);
  if (!title) throw Object.assign(new Error('Falta el título'), { status: 400 });

  fs.mkdirSync(DIR, { recursive: true });
  const file = safeName(meta.originalName, ext);
  fs.writeFileSync(path.join(DIR, file), buffer);
  const int = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);
  const entry = {
    file, title, kind,
    format: String(meta.format || '').trim().slice(0, 40) || 'Sin formato',
    width: int(meta.width), height: int(meta.height),
    origin: String(meta.origin || 'Subido a mano').trim().slice(0, 60),
    costUsd: 0,
    createdAt: new Date().toISOString().slice(0, 10),
    notes: String(meta.notes || '').trim().slice(0, 500),
  };
  const caption = String(meta.caption || '').trim().slice(0, 2200);
  if (caption) entry.caption = caption;
  if (meta.by) entry.uploadedBy = String(meta.by);
  const all = readManifest();
  all.unshift(entry);
  fs.writeFileSync(path.join(DIR, 'manifest.json'), JSON.stringify(all, null, 2));
  return entry;
}

module.exports = { list, resolveFile, add, DIR, MAX_BYTES };
