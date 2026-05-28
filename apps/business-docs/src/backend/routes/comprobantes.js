'use strict';

/**
 * comprobantes — Combina varios comprobantes (PDFs / imagenes) en un unico PDF.
 *
 * El PDF resultante tiene:
 *  - Una portada con branding y datos de contacto de Arman Travel, e indice por
 *    categoria (Vuelos, Hoteles, etc.) con un boton por cada comprobante.
 *  - Una pagina (o varias) por comprobante, con un enlace "volver al indice".
 *
 * Los botones del indice son enlaces internos (#cmp-N) que Chromium convierte en
 * destinos nombrados dentro del PDF: funcionan en cualquier visor.
 *
 * Los PDFs de entrada se rasterizan a imagen (pdfRasterize). Las imagenes se
 * incrustan directo (normalizadas con sharp).
 */

const express = require('express');
const router = express.Router();
const sharp = require('sharp');
const log = require('../utils/logger');
const { rasterizePdf } = require('../utils/pdfRasterize');
const HTMLtoPDFRenderer = require('../utils/htmltoPdfRenderer');

const MAX_PDF_PAGES = 15;
const RASTER_SCALE = 2;

const CATEGORIES = [
  { key: 'flight', label: 'Vuelos' },
  { key: 'hotel', label: 'Hoteles' },
  { key: 'transfer', label: 'Traslados' },
  { key: 'insurance', label: 'Seguros' },
  { key: 'tour', label: 'Tours' },
  { key: 'other', label: 'Otros' },
];

function toBuf(input) {
  if (!input) return null;
  if (Buffer.isBuffer(input)) return input;
  let s = String(input);
  if (s.startsWith('data:')) s = s.split(',')[1] || '';
  return Buffer.from(s, 'base64');
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function normalizeCategory(type) {
  const t = String(type || '').toLowerCase();
  if (CATEGORIES.some(c => c.key === t)) return t;
  return 'other';
}

/** Convierte un comprobante (imagen o PDF) a un array de data URLs (una por pagina). */
async function itemToPageImages(item) {
  const buf = toBuf(item.fileData);
  if (!buf || !buf.length) return [];

  const mt = (item.mimeType || '').toLowerCase();
  const isPdf = mt === 'application/pdf' || /\.pdf$/i.test(item.fileName || '');

  if (isPdf) {
    try {
      const pages = await rasterizePdf(buf, { scale: RASTER_SCALE, maxPages: MAX_PDF_PAGES });
      return pages.map(p => `data:image/png;base64,${p.buffer.toString('base64')}`);
    } catch (e) {
      return [];
    }
  }

  // Imagen: normalizar orientacion y recomprimir para achicar el PDF.
  try {
    const norm = await sharp(buf).rotate().jpeg({ quality: 82 }).toBuffer();
    return [`data:image/jpeg;base64,${norm.toString('base64')}`];
  } catch (e) {
    return [`data:${mt || 'image/jpeg'};base64,${buf.toString('base64')}`];
  }
}

function buildHtml(processed, opts) {
  const { docTitle, logoDataUrl, company, dateStr, total } = opts;
  const co = company || {};

  // Agrupar para el indice, respetando el orden de CATEGORIES.
  const groups = CATEGORIES
    .map(cat => ({ ...cat, items: processed.filter(p => p.category === cat.key) }))
    .filter(g => g.items.length);

  const brand = logoDataUrl
    ? `<img class="c-logo" src="${logoDataUrl}" alt="Arman Travel">`
    : `<div class="c-brand-text">
         <div class="c-brand-title">ARMAN</div>
         <div class="c-brand-sub">&mdash; TRAVEL &mdash;</div>
         <div class="c-brand-leg">LEG ${escapeHtml(co.legajo || '20758')}</div>
       </div>`;

  const contactRows = [
    co.phone ? `<div><span class="c-ic">T</span>${escapeHtml(co.phone)}</div>` : '',
    co.instagram ? `<div><span class="c-ic">I</span>${escapeHtml(co.instagram)}</div>` : '',
    co.email ? `<div><span class="c-ic">@</span>${escapeHtml(co.email)}</div>` : '',
    co.address ? `<div><span class="c-ic">D</span>${escapeHtml(co.address)}</div>` : '',
  ].join('');

  const indexGroups = groups.map(g => `
    <div class="c-grp">
      <h2>
        <span class="c-grp-ico">${escapeHtml(g.label.charAt(0))}</span>
        ${escapeHtml(g.label)}
        <span class="c-grp-count">${g.items.length}</span>
      </h2>
      <div class="c-btns">
        ${g.items.map(it => `
          <a class="c-btn" href="#cmp-${it.idx}">
            <span class="c-btn-ico">${escapeHtml(it.iconText)}</span>
            <span class="c-btn-txt">${escapeHtml(it.title)}</span>
            <span class="c-btn-arrow">&#8594;</span>
          </a>`).join('')}
      </div>
    </div>`).join('');

  const annexes = processed.map(it => {
    const pages = it.images.map((src, i) => `
      <div class="c-pageimg">
        ${i === 0 ? `<div class="c-anexo-bar">
          <span class="c-anexo-title">${escapeHtml(it.title)}</span>
          <a class="c-back" href="#indice">&#8593; Volver al indice</a>
        </div>` : ''}
        <img src="${src}">
      </div>`).join('');
    return `<section class="c-anexo" id="cmp-${it.idx}">${pages}</section>`;
  }).join('');

  const plural = total === 1 ? '' : 's';

  return `
  <style>
    * { box-sizing: border-box; }
    body { color: #1f2937; font-family: 'Segoe UI', Arial, sans-serif; }

    .c-header {
      display: flex; align-items: center; justify-content: space-between; gap: 18px;
      padding-bottom: 14px; border-bottom: 2px solid #1A1864; margin-bottom: 16px;
    }
    .c-brand { display: flex; align-items: center; gap: 14px; }
    .c-logo { width: 115px; height: auto; object-fit: contain; }
    .c-brand-title { font-size: 24pt; font-weight: 800; color: #1A1864; letter-spacing: 1.5px; line-height: 1; }
    .c-brand-sub { font-size: 9pt; color: #555; letter-spacing: 2.5px; margin-top: 2px; }
    .c-brand-leg { font-size: 8pt; color: #888; letter-spacing: 1.5px; margin-top: 1px; }
    .c-contact { font-size: 8.5pt; color: #333; line-height: 1.7; }
    .c-contact div { display: flex; align-items: center; gap: 6px; }
    .c-ic {
      display: inline-flex; align-items: center; justify-content: center;
      width: 15px; height: 15px; border-radius: 50%; flex: 0 0 auto;
      background: #1A1864; color: #fff; font-size: 8pt; font-weight: 700;
    }

    .c-titlebar {
      display: flex; align-items: center; justify-content: space-between; gap: 14px;
      background: #1A1864; color: #fff; border-radius: 8px; padding: 14px 20px; margin-bottom: 16px;
    }
    .c-titlebar-t { font-size: 18pt; font-weight: 800; letter-spacing: 1.5px; }
    .c-titlebar-s { font-size: 9pt; opacity: .9; margin-top: 3px; letter-spacing: 1.2px; }
    .c-titlebar-box { background: #fff; color: #1A1864; border-radius: 6px; padding: 8px 16px; text-align: center; min-width: 120px; }
    .c-titlebar-box .l { font-size: 7.5pt; letter-spacing: 1.5px; font-weight: 700; }
    .c-titlebar-box .v { font-size: 13pt; font-weight: 800; }

    .c-client {
      display: flex; align-items: center; gap: 10px; margin: 0 0 14px 0;
      padding: 9px 14px; background: #f4f3fb; border: 1px solid #e6e4f4;
      border-left: 3px solid #1A1864; border-radius: 6px;
    }
    .c-client-l { font-size: 7.5pt; font-weight: 700; color: #6b6f80; letter-spacing: 1px; }
    .c-client-v { font-size: 11pt; font-weight: 700; color: #1A1864; }

    .c-intro { font-size: 10pt; color: #555; margin: 0 0 18px 0; }
    .c-intro b { color: #1A1864; }

    .c-grp { margin-bottom: 16px; page-break-inside: avoid; }
    .c-grp h2 {
      display: flex; align-items: center; gap: 8px;
      font-size: 11.5pt; font-weight: 800; color: #1A1864; margin: 0 0 10px 0;
      padding-bottom: 6px; border-bottom: 1px solid #e6e4f4; letter-spacing: .5px;
    }
    .c-grp-ico {
      display: inline-flex; align-items: center; justify-content: center;
      width: 22px; height: 22px; border-radius: 5px;
      background: #1A1864; color: #fff; font-size: 10pt; font-weight: 800;
    }
    .c-grp-count {
      margin-left: auto; font-size: 8.5pt; font-weight: 700; color: #6b6f80;
      background: #ecebf7; border-radius: 999px; padding: 2px 10px;
    }

    .c-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .c-btn {
      display: flex; align-items: center; gap: 11px; text-decoration: none;
      border: 1px solid #d8d6ea; border-radius: 8px; padding: 11px 14px;
      background: #fafafd; color: #1f2937;
    }
    .c-btn-ico {
      display: inline-flex; align-items: center; justify-content: center;
      width: 26px; height: 26px; border-radius: 6px; flex: 0 0 auto;
      background: #1A1864; color: #fff; font-size: 11pt; font-weight: 800;
    }
    .c-btn-txt { font-size: 10pt; font-weight: 600; flex: 1 1 auto; word-break: break-word; }
    .c-btn-arrow { color: #1A1864; font-weight: 800; font-size: 12pt; }

    .c-footer {
      margin-top: 22px; padding: 16px; border-radius: 8px;
      background: linear-gradient(135deg, #1A1864 0%, #3D3791 100%);
      color: #fff; text-align: center; page-break-inside: avoid;
    }
    .c-thanks { font-size: 14pt; font-style: italic; font-weight: 700; margin-bottom: 4px; }
    .c-sub { font-size: 9.5pt; opacity: .9; }
    .c-footer-info { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; font-size: 8.5pt; }
    .c-fi { text-align: center; line-height: 1.5; }
    .c-fi-t { font-weight: 700; letter-spacing: .8px; font-size: 9pt; }

    .c-anexo { page-break-before: always; }
    .c-pageimg { text-align: center; }
    .c-pageimg + .c-pageimg { page-break-before: always; }
    .c-pageimg img { max-width: 100%; max-height: 25.5cm; object-fit: contain; border: 1px solid #ececec; }
    .c-anexo-bar {
      display: flex; align-items: center; justify-content: space-between;
      background: #1A1864; color: #fff; border-radius: 6px; padding: 8px 14px; margin-bottom: 10px; text-align: left;
    }
    .c-anexo-title { font-size: 11pt; font-weight: 700; }
    .c-back { color: #fff; text-decoration: none; font-size: 8.5pt; opacity: .9; white-space: nowrap; }
  </style>

  <div class="c-index" id="indice">
    <div class="c-header">
      <div class="c-brand">${brand}</div>
      <div class="c-contact">${contactRows}</div>
    </div>

    <div class="c-titlebar">
      <div>
        <div class="c-titlebar-t">COMPROBANTES DE VIAJE</div>
        <div class="c-titlebar-s">DOCUMENTACIÓN DE TU RESERVA</div>
      </div>
      <div class="c-titlebar-box">
        <div class="l">EMITIDO</div>
        <div class="v">${escapeHtml(dateStr)}</div>
      </div>
    </div>

    ${docTitle ? `<div class="c-client"><span class="c-client-l">PREPARADO PARA</span><span class="c-client-v">${escapeHtml(docTitle)}</span></div>` : ''}

    <p class="c-intro"><b>${total}</b> comprobante${plural} adjunto${plural} en este PDF. Tocá cada botón para ir directo al archivo original.</p>

    ${indexGroups}

    <div class="c-footer">
      <div class="c-thanks">Gracias por confiar en nosotros</div>
      <div class="c-sub">Estamos felices de ser parte de tu próximo viaje. ¡Que disfrutes esta experiencia única!</div>
      <div class="c-footer-info">
        <div class="c-fi"><div class="c-fi-t">ESTAMOS PARA VOS</div><div>Ante cualquier consulta, escribinos.</div></div>
        <div class="c-fi"><div class="c-fi-t">EXPLORÁ MÁS DESTINOS</div><div>www.armantravel.com</div></div>
        <div class="c-fi"><div class="c-fi-t">ESCRIBINOS</div><div>${escapeHtml(co.phone || '')}</div></div>
      </div>
    </div>
  </div>

  ${annexes}
  `;
}

/**
 * POST /api/comprobantes/combine
 *
 * Body: {
 *   title?: string,
 *   logo?: string (dataURL),
 *   company?: { phone, instagram, email, address, legajo },
 *   items: [{ fileName, fileData (dataURL/base64), mimeType, type, title }]
 * }
 */
router.post('/combine', async (req, res) => {
  const t0 = Date.now();
  try {
    const { items, title, logo, company } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Se requiere al menos un comprobante (items)' });
    }

    const processed = [];
    let idx = 0;
    for (const item of items) {
      const images = await itemToPageImages(item);
      if (!images.length) continue;
      const category = normalizeCategory(item.type);
      const catLabel = (CATEGORIES.find(c => c.key === category) || {}).label || 'Otros';
      processed.push({
        idx,
        category,
        title: (item.title && String(item.title).trim()) || item.fileName || `Comprobante ${idx + 1}`,
        iconText: catLabel.charAt(0).toUpperCase(),
        images,
      });
      idx++;
    }

    if (!processed.length) {
      return res.status(422).json({ error: 'No se pudo procesar ningún comprobante (archivos vacíos o ilegibles)' });
    }

    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

    const html = buildHtml(processed, {
      docTitle: (title && String(title).trim()) || '',
      logoDataUrl: typeof logo === 'string' && logo.startsWith('data:') ? logo : '',
      company: company || {},
      dateStr,
      total: processed.length,
    });

    const pdfBuffer = await HTMLtoPDFRenderer.render(html, {
      format: 'A4',
      margin: { top: '10mm', right: '12mm', bottom: '10mm', left: '12mm' },
    });

    log.info(req, 'comprobantes_combine', {
      items: items.length,
      processed: processed.length,
      pages: processed.reduce((a, p) => a + p.images.length, 0),
      ms: Date.now() - t0,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=comprobantes_${Date.now()}.pdf`);
    return res.send(pdfBuffer);
  } catch (err) {
    log.error(req, 'comprobantes_combine_error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
