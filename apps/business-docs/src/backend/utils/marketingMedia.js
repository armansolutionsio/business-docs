// Galeria de Arman Marketing: imagenes, videos y capturas listas para usar en campanas.
// Los archivos viven en MARKETING_MEDIA_DIR (por defecto apps/business-docs/uploads/marketing),
// fuera de git. manifest.json describe cada pieza (titulo, formato, origen, costo).

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

module.exports = { list, resolveFile, DIR };
