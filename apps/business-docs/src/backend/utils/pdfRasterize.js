'use strict';

/**
 * pdfRasterize — convierte un PDF a imágenes PNG por página.
 *
 * Usa pdf-parse v2 (PDFParse.getScreenshot) que internamente delega en pdfjs-dist
 * y renderiza sin requerir canvas nativo. Devuelve buffers PNG.
 *
 * Diseño RAM-friendly:
 *  - scale por defecto 1.5 (≈144 DPI) — suficiente para OCR, mitad de memoria que 2x.
 *  - procesa de a una página y libera referencias intermedias.
 *  - destruye el parser después de usarlo.
 */

/**
 * @param {Buffer} buf            PDF como Buffer
 * @param {Object} [opts]
 * @param {number} [opts.scale]   factor de escala (default 1.5)
 * @param {number} [opts.maxPages] tope de páginas a rasterizar (default 5)
 * @returns {Promise<{buffer:Buffer, pageNumber:number, width:number, height:number}[]>}
 */
async function rasterizePdf(buf, opts = {}) {
  const scale = opts.scale != null ? opts.scale : 1.5;
  const maxPages = opts.maxPages != null ? opts.maxPages : 5;

  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getScreenshot({ scale });
    if (!result || !Array.isArray(result.pages)) return [];

    const out = [];
    const pages = result.pages.slice(0, maxPages);
    for (const p of pages) {
      const buffer = pickBuffer(p);
      if (!buffer) continue;
      out.push({
        buffer,
        pageNumber: p.pageNumber || (out.length + 1),
        width: p.width || null,
        height: p.height || null,
      });
    }
    return out;
  } finally {
    try { await parser.destroy?.(); } catch (_) {}
  }
}

/** Resuelve buffer PNG desde el shape devuelto por getScreenshot (pueden venir como
 *  { buffer }, { data }, { png }, etc., según versión menor de pdf-parse). */
function pickBuffer(page) {
  if (!page) return null;
  const candidates = [page.buffer, page.png, page.data, page.image];
  for (const c of candidates) {
    if (Buffer.isBuffer(c)) return c;
    if (c && typeof c === 'object' && Buffer.isBuffer(c.buffer)) return c.buffer;
    if (c instanceof Uint8Array) return Buffer.from(c);
  }
  // Last resort: dataURL
  if (typeof page.dataUrl === 'string' && page.dataUrl.startsWith('data:image/')) {
    const b64 = page.dataUrl.split(',', 2)[1] || '';
    return Buffer.from(b64, 'base64');
  }
  return null;
}

module.exports = { rasterizePdf };
