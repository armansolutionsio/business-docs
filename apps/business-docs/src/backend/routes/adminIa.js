'use strict';

/**
 * Admin IA — Extracción de comprobantes (factura, nota de crédito, recibo, etc.).
 *
 * Pipeline:
 *  1. QR-first: si el comprobante es factura electrónica AR, leemos el QR
 *     (https://www.afip.gob.ar/fe/qr/?p=BASE64_JSON) y obtenemos los campos
 *     fiscales clave directo del payload firmado por AFIP.
 *  2. PDF text: extraemos texto plano del PDF y completamos los campos que el
 *     QR no trae (IVA discriminado, percepciones, exentos, etc.) con regex
 *     adaptado a comprobantes argentinos.
 *  3. OCR fallback: si el archivo es imagen sin QR (foto de un comprobante
 *     impreso), corremos tesseract.js sobre la imagen y aplicamos los mismos
 *     regex que con el texto del PDF.
 *
 * El resultado se devuelve con el ORDEN EXACTO de columnas del libro IVA /
 * "Mis Comprobantes" de AFIP, así calza 1:1 con el Sheet del usuario.
 */

const express = require('express');
const router = express.Router();
const sharp = require('sharp');
const log = require('../utils/logger');

// ───────────────────────── Catálogos AFIP ──────────────────────────

// Tipos de comprobante (AFIP RG 1415, principales)
const AFIP_TIPO_CMP = {
  1:  'Factura A',
  2:  'Nota de Débito A',
  3:  'Nota de Crédito A',
  4:  'Recibo A',
  5:  'Nota de Venta al Contado A',
  6:  'Factura B',
  7:  'Nota de Débito B',
  8:  'Nota de Crédito B',
  9:  'Recibo B',
  10: 'Nota de Venta al Contado B',
  11: 'Factura C',
  12: 'Nota de Débito C',
  13: 'Nota de Crédito C',
  15: 'Recibo C',
  19: 'Factura E',
  20: 'Nota de Débito E',
  21: 'Nota de Crédito E',
  39: 'Otros comprobantes A no autorizados a discriminar IVA',
  40: 'Otros comprobantes B no autorizados a discriminar IVA',
  51: 'Factura M',
  52: 'Nota de Débito M',
  53: 'Nota de Crédito M',
  54: 'Recibo M',
  60: 'Cta. de Venta y Líquido producto A',
  61: 'Cta. de Venta y Líquido producto B',
  63: 'Liquidación A',
  64: 'Liquidación B',
  81: 'Tique Factura A',
  82: 'Tique Factura B',
  83: 'Tique',
  111: 'Tique Factura C',
  112: 'Tique Nota de Crédito A',
  113: 'Tique Nota de Crédito B',
  114: 'Tique Nota de Crédito C',
  115: 'Tique Nota de Débito A',
  116: 'Tique Nota de Débito B',
  117: 'Tique Nota de Débito C',
  201: 'Factura de Crédito Electrónica MiPyMEs (FCE) A',
  202: 'Nota de Débito Electrónica MiPyMEs (FCE) A',
  203: 'Nota de Crédito Electrónica MiPyMEs (FCE) A',
  206: 'Factura de Crédito Electrónica MiPyMEs (FCE) B',
  207: 'Nota de Débito Electrónica MiPyMEs (FCE) B',
  208: 'Nota de Crédito Electrónica MiPyMEs (FCE) B',
  211: 'Factura de Crédito Electrónica MiPyMEs (FCE) C',
  212: 'Nota de Débito Electrónica MiPyMEs (FCE) C',
  213: 'Nota de Crédito Electrónica MiPyMEs (FCE) C',
};

const AFIP_TIPO_DOC = {
  80: 'CUIT',
  86: 'CUIL',
  87: 'CDI',
  89: 'LE',
  90: 'LC',
  91: 'CI Extranjera',
  92: 'En trámite',
  93: 'Acta Nacimiento',
  94: 'Pasaporte',
  95: 'CI Bs.As. RNP',
  96: 'DNI',
  99: 'Sin identificar/venta global diaria',
};

// AFIP usa códigos de moneda propios (no ISO).
const AFIP_MONEDAS = {
  PES: 'ARS', // Peso Argentino
  DOL: 'USD', // Dólar Estadounidense
  '012': 'CHF', '014': 'CAD', '021': 'GBP', '060': 'EUR',
  '002': 'USD', // (algunos PDFs vienen con códigos numéricos)
};

// ───────────────────────── Schema (orden del Sheet) ──────────────────────────

// Este es el ORDEN EXACTO que vamos a mostrar y exportar. Las claves coinciden
// con los nombres de columna que pasó el usuario.
const FIELD_SCHEMA = [
  { key: 'fecha',                     label: 'Fecha',                     type: 'date'   },
  { key: 'tipo',                      label: 'Tipo',                      type: 'string' },
  { key: 'puntoVenta',                label: 'Punto de Venta',            type: 'string' },
  { key: 'numeroDesde',               label: 'Número Desde',              type: 'string' },
  { key: 'numeroHasta',               label: 'Número Hasta',              type: 'string' },
  { key: 'codAutorizacion',           label: 'Cód. Autorización',         type: 'string' },
  { key: 'tipoDocEmisor',             label: 'Tipo Doc. Emisor',          type: 'string' },
  { key: 'nroDocEmisor',              label: 'Nro. Doc. Emisor',          type: 'string' },
  { key: 'denominacionEmisor',        label: 'Denominación Emisor',       type: 'string' },
  { key: 'tipoDocReceptor',           label: 'Tipo Doc. Receptor',        type: 'string' },
  { key: 'nroDocReceptor',            label: 'Nro. Doc. Receptor',        type: 'string' },
  { key: 'denominacionReceptor',      label: 'Denominación Receptor',     type: 'string' },
  { key: 'tipoCambio',                label: 'Tipo Cambio',               type: 'number' },
  { key: 'moneda',                    label: 'Moneda',                    type: 'string' },
  { key: 'netoGravIva0',              label: 'Neto Grav. IVA 0%',         type: 'number' },
  { key: 'iva25',                     label: 'IVA 2,5%',                  type: 'number' },
  { key: 'netoGravIva25',             label: 'Neto Grav. IVA 2,5%',       type: 'number' },
  { key: 'iva5',                      label: 'IVA 5%',                    type: 'number' },
  { key: 'netoGravIva5',              label: 'Neto Grav. IVA 5%',         type: 'number' },
  { key: 'iva105',                    label: 'IVA 10,5%',                 type: 'number' },
  { key: 'netoGravIva105',            label: 'Neto Grav. IVA 10,5%',      type: 'number' },
  { key: 'iva21',                     label: 'IVA 21%',                   type: 'number' },
  { key: 'netoGravIva21',             label: 'Neto Grav. IVA 21%',        type: 'number' },
  { key: 'iva27',                     label: 'IVA 27%',                   type: 'number' },
  { key: 'netoGravIva27',             label: 'Neto Grav. IVA 27%',        type: 'number' },
  { key: 'netoGravadoTotal',          label: 'Neto Gravado Total',        type: 'number' },
  { key: 'netoNoGravado',             label: 'Neto No Gravado',           type: 'number' },
  { key: 'opExentas',                 label: 'Op. Exentas',               type: 'number' },
  { key: 'otrosTributos',             label: 'Otros Tributos',            type: 'number' },
  { key: 'totalIva',                  label: 'Total IVA',                 type: 'number' },
  { key: 'impTotal',                  label: 'Imp. Total',                type: 'number' },
];

// ─────────────────────── Utilidades parsing ────────────────────────────

/** Parsea un número con formato ES (12.345,67 o 12345,67 o 12345.67). */
function parseEsNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // Negativos con paréntesis: (1.234,56)
  let negative = false;
  if (/^\(.+\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (/^-/.test(s))       { negative = true; s = s.slice(1); }
  // Quitar símbolo $ y unidades raras
  s = s.replace(/[\s$£€]/g, '').replace(/(?:^|[^a-z])(ARS|USD|EUR|U\$S|U\$D|\$|\$\$)$/i, '');
  // Quitar separadores de miles "."  → reemplazo todos los puntos que NO son último decimal.
  // Heurística: si tiene coma como decimal, los puntos son miles.
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // 12.345,67 → coma decimal
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // 12,345.67 → coma miles
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes('.')) {
    // Si tiene un solo punto y le siguen 3 dígitos, podría ser miles. Heurística:
    // si los dígitos a la derecha son exactamente 3 y no hay otros separadores → miles.
    const m = s.match(/^(-?\d+)\.(\d{3})$/);
    if (m) s = m[1] + m[2];
  }
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return negative ? -n : n;
}

/** Convierte fecha de varios formatos a ISO yyyy-mm-dd. */
function toIsoDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // yyyymmdd (QR)
  let m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // yyyy-mm-dd
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // dd/mm/yyyy o dd-mm-yyyy
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let yyyy = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${yyyy}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  }
  return null;
}

/** Devuelve null si el valor cae bajo el umbral de confianza. */
function nz(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && (isNaN(v) || !isFinite(v))) return null;
  return v;
}

/** Construye un objeto vacío con todas las keys del schema. */
function emptyRecord() {
  const r = {};
  for (const f of FIELD_SCHEMA) r[f.key] = null;
  return r;
}

// ─────────────────────── Decode QR de AFIP ─────────────────────────────

/**
 * Intenta decodificar la URL del QR de AFIP en datos del comprobante.
 * Formato: https://www.afip.gob.ar/fe/qr/?p=BASE64_DEL_JSON
 */
function decodeAfipQrUrl(url) {
  try {
    const m = String(url || '').match(/[?&]p=([A-Za-z0-9+/=_-]+)/);
    if (!m) return null;
    let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    // Padding
    while (b64.length % 4 !== 0) b64 += '=';
    const json = Buffer.from(b64, 'base64').toString('utf8');
    const obj = JSON.parse(json);
    return obj;
  } catch (_) { return null; }
}

/** Mapea el JSON del QR de AFIP al schema canónico. */
function fromAfipQr(qr) {
  if (!qr) return {};
  const r = {};
  if (qr.fecha)        r.fecha = toIsoDate(qr.fecha);
  if (qr.tipoCmp != null) r.tipo = AFIP_TIPO_CMP[Number(qr.tipoCmp)] || ('Tipo ' + qr.tipoCmp);
  if (qr.ptoVta != null)  r.puntoVenta = String(qr.ptoVta).padStart(5, '0');
  if (qr.nroCmp != null)  { r.numeroDesde = String(qr.nroCmp).padStart(8, '0'); r.numeroHasta = r.numeroDesde; }
  if (qr.codAut)         r.codAutorizacion = String(qr.codAut);
  if (qr.cuit)           { r.tipoDocEmisor = 'CUIT'; r.nroDocEmisor = String(qr.cuit); }
  if (qr.tipoDocRec != null) r.tipoDocReceptor = AFIP_TIPO_DOC[Number(qr.tipoDocRec)] || String(qr.tipoDocRec);
  if (qr.nroDocRec != null && Number(qr.nroDocRec) > 0) r.nroDocReceptor = String(qr.nroDocRec);
  if (qr.moneda)         r.moneda = AFIP_MONEDAS[qr.moneda] || qr.moneda;
  if (qr.ctz != null)    r.tipoCambio = parseFloat(qr.ctz);
  if (qr.importe != null) r.impTotal = parseFloat(qr.importe);
  return r;
}

// ─────────────────────── Regex extractor (texto OCR/PDF) ────────────────

function extractFromText(text) {
  const r = {};
  if (!text) return r;
  const T = text.replace(/ /g, ' '); // nbsp → space
  // Tipo (heurístico por encabezado, soporta "FAC A0022-..." y "A FAC ..." de software de gestión)
  const tipoMap = [
    [/\bfac(?:tura)?\s*a\b|^\s*a\s+fac/im,            'Factura A'],
    [/\bfac(?:tura)?\s*b\b|^\s*b\s+fac/im,            'Factura B'],
    [/\bfac(?:tura)?\s*c\b|^\s*c\s+fac/im,            'Factura C'],
    [/\bfac(?:tura)?\s*e\b/i,                          'Factura E'],
    [/\bfac(?:tura)?\s*m\b/i,                          'Factura M'],
    [/nota\s+de\s+cr[eé]dito\s*a\b|^\s*ncr?\s*a\b/im, 'Nota de Crédito A'],
    [/nota\s+de\s+cr[eé]dito\s*b\b|^\s*ncr?\s*b\b/im, 'Nota de Crédito B'],
    [/nota\s+de\s+cr[eé]dito\s*c\b|^\s*ncr?\s*c\b/im, 'Nota de Crédito C'],
    [/nota\s+de\s+d[eé]bito\s*a\b|^\s*ndb?\s*a\b/im,  'Nota de Débito A'],
    [/nota\s+de\s+d[eé]bito\s*b\b|^\s*ndb?\s*b\b/im,  'Nota de Débito B'],
    [/nota\s+de\s+d[eé]bito\s*c\b|^\s*ndb?\s*c\b/im,  'Nota de Débito C'],
    [/recibo\s+a\b/i,                                  'Recibo A'],
    [/recibo\s+b\b/i,                                  'Recibo B'],
    [/recibo\s+c\b/i,                                  'Recibo C'],
    [/tique[\-\s]?factura\s+a\b/i,                     'Tique Factura A'],
    [/tique[\-\s]?factura\s+b\b/i,                     'Tique Factura B'],
    [/cod\.?\s*0?1\b/i, 'Factura A'],
    [/cod\.?\s*0?6\b/i, 'Factura B'],
    [/cod\.?\s*1?1\b/i, 'Factura C'],
  ];
  for (const [rx, label] of tipoMap) {
    if (rx.test(T)) { r.tipo = label; break; }
  }

  // Punto de venta + número.
  // Soporta:
  //   "Punto de Venta: 0001 Comp. Nro: 12345"  (con o sin guion entre PV y Nro)
  //   "Punto de Venta:    Comp. Nro:    00001 00000001"  (labels en una línea, valores en otra: AFIP estándar)
  //   "FAC A0022-00085193"  (letra de tipo pegada al PV)
  //   "A 0022-00085193"
  //   "0001-00012345"
  let m = T.match(/(?:punto\s+de\s+venta|pto\.?\s*v(?:enta|ta\.))\s*:?\s*(\d{1,5})\s*(?:[-–]|\bcomp(?:robante)?\.?\s*n(?:[°ºor]+)?\.?\s*:?\s*)\s*(\d{1,12})/i);
  // Layout AFIP estándar: labels en una línea, valores en otra: "Punto de Venta: Comp. Nro:    00001 00000001"
  if (!m) m = T.match(/punto\s+de\s+venta\s*:?\s*comp(?:robante)?\.?\s*nro?\.?\s*:?\s*(\d{4,5})\s+(\d{6,8})/i);
  if (!m) m = T.match(/\b(?:fac|ncr|nc|ndb|nd|rec|tique)\s*[ABCEM]\s*(\d{4,5})-(\d{6,8})\b/i);
  if (!m) m = T.match(/(?:^|\s)[ABCEM]\s*(\d{4,5})\s*[-–]\s*(\d{6,8})\b/);
  if (!m) m = T.match(/\b(\d{4,5})\s*[-–]\s*(\d{6,8})\b/);
  if (m) {
    r.puntoVenta = String(m[1]).padStart(5, '0');
    r.numeroDesde = String(m[2]).padStart(8, '0');
    r.numeroHasta = r.numeroDesde;
  }

  // Fecha de emisión: priorizamos "fecha emisión" / "fecha:" y descartamos contextos
  // de vencimiento, salida, llegada, CAE, etc.
  m = T.match(/fecha\s*(?:de\s*)?emisi[oó]n\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (!m) m = T.match(/(?:^|\n)\s*fecha\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (!m) {
    const head = T.split(/\r?\n/).slice(0, 12).join('\n');
    const allDates = [...head.matchAll(/(\d{1,2}\/\d{1,2}\/\d{2,4})/g)];
    for (const d of allDates) {
      const ctx = head.slice(Math.max(0, d.index - 35), d.index).toLowerCase();
      if (!/(venc|salida|llegada|cae|cobrar|vto)/i.test(ctx)) { m = d; break; }
    }
  }
  if (m) r.fecha = toIsoDate(m[1]);

  // CAE / Cód. Autorización (14 dígitos típicamente).
  // Soporta:
  //   "CAE: 12345678901234"
  //   "CAE NRO:86172723073848"  (sin espacio)
  //   "CAE N°:\n...\n86173280412693"  (label y número en líneas separadas, layout AFIP)
  m = T.match(/c\.?\s*a\.?\s*e\.?\s*(?:n[°ºor]+\.?)?\s*:?\s*(\d{10,16})/i)
   || T.match(/(?:c[oó]d(?:igo)?\.?\s+(?:de\s+)?autorizaci[oó]n)\s*:?\s*(\d{10,16})/i);
  if (m) r.codAutorizacion = m[1];
  if (!r.codAutorizacion) {
    // CAE label sin número en la misma línea: buscamos un número de 13-16 dígitos
    // dentro de los 600 chars siguientes al label (pdf-parse linealiza columnas).
    const caeIdx = T.search(/\bc\.?\s*a\.?\s*e\.?\s*(?:n[°ºor]+\.?)?\s*:/i);
    if (caeIdx >= 0) {
      const after = T.slice(caeIdx, caeIdx + 600);
      const nm = after.match(/\b(\d{13,16})\b/);
      if (nm) r.codAutorizacion = nm[1];
    }
  }

  // CUIT(s) y asignación a emisor / receptor por contexto.
  // En facturas argentinas el receptor suele estar etiquetado como "SR/ES:",
  // "Cliente:", "Destinatario:" o "Apellido y Nombre / Razón Social:".
  const cuitMatches = [...T.matchAll(/\b(\d{2}-?\d{8}-?\d)\b/g)];
  let receptorCuit = null, receptorName = null, emisorCuit = null, emisorName = null;

  // Receptor: bloque SR/ES (típico de software de turismo) — todo el CUIT que aparezca
  // dentro de los siguientes ~600 chars del marcador es del receptor.
  const srEsMatch = T.match(/sr\/?es\.?\s*:\s*([^\n\r]{2,120})/i);
  if (srEsMatch) {
    receptorName = srEsMatch[1]
      .split(/\s{2,}|pasajero|\^?file|cantidad|pax|c\.costo|cod\.ag/i)[0]
      .trim();
    const startIdx = srEsMatch.index + srEsMatch[0].length;
    const tail = T.slice(startIdx, startIdx + 600);
    const cuitInTail = tail.match(/\b(\d{2}-?\d{8}-?\d)\b/);
    if (cuitInTail) receptorCuit = cuitInTail[1].replace(/-/g, '');
  }
  if (!receptorName) {
    // En facturas AFIP estándar el nombre del receptor está varias líneas después
    // del label (porque pdf-parse linealiza columnas). Buscamos la primera línea no-label
    // dentro de los 600 chars que siguen.
    const apIdx = T.search(/apellido\s+y\s+nombre\s*\/?\s*raz[oó]n\s+social\s*:/i);
    if (apIdx >= 0) {
      const tail = T.slice(apIdx, apIdx + 600);
      const lines = tail.split(/\r?\n/);
      for (const ln of lines.slice(1)) {  // saltamos la línea del propio label
        const cleaned = ln.trim();
        if (!cleaned) continue;
        // Saltamos labels (contienen ':'), fechas, números, símbolos $€
        if (/[:$€]/.test(cleaned)) continue;
        if (/^\d/.test(cleaned)) continue;
        if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(cleaned)) continue;
        if (cleaned.length < 3) continue;
        receptorName = cleaned;
        break;
      }
    }
    if (!receptorName) {
      const altRec = T.match(/(?:cliente|destinatario)\s*:[ \t]*([^\n\r]{3,120})/i);
      if (altRec) receptorName = altRec[1].trim();
    }
  }

  // Emisor: el primer CUIT que NO sea el del receptor.
  // Importante: en facturas AFIP estándar el mismo CUIT suele aparecer varias veces.
  const cuitsUnique = [];
  for (const cm of cuitMatches) {
    const cu = cm[1].replace(/-/g, '');
    if (!cuitsUnique.includes(cu)) cuitsUnique.push(cu);
  }
  for (const cu of cuitsUnique) {
    if (receptorCuit && cu === receptorCuit) continue;
    emisorCuit = cu;
    break;
  }
  // Fallback: si no encontramos un CUIT distinto al receptor pero TAMPOCO se identificó
  // receptor por contexto, asumimos que el único CUIT es el emisor.
  if (!emisorCuit && !receptorCuit && cuitsUnique.length >= 1) emisorCuit = cuitsUnique[0];
  // Si no detectamos receptor por contexto y hay un segundo CUIT distinto, lo asumimos.
  if (!receptorCuit && cuitsUnique.length >= 2) {
    receptorCuit = cuitsUnique.find(c => c !== emisorCuit) || null;
  }

  // Razón social emisor: línea "Razón Social:" sin "/" (para no agarrar "Apellido / Razón Social").
  const emisorRsMatch = T.match(/(?:^|\n)\s*raz[oó]n\s+social\s*:\s*([^\n\r/]{3,120})/i);
  if (emisorRsMatch) emisorName = emisorRsMatch[1].trim();

  if (emisorCuit)   { r.tipoDocEmisor = 'CUIT';   r.nroDocEmisor   = emisorCuit; }
  if (emisorName)     r.denominacionEmisor   = emisorName;
  if (receptorCuit) { r.tipoDocReceptor = 'CUIT'; r.nroDocReceptor = receptorCuit; }
  if (receptorName)   r.denominacionReceptor = receptorName;

  // Moneda. En sistemas de turismo argentino la abreviatura "PES" identifica al
  // peso aún cuando también aparezca USD para mostrar la equivalencia.
  if (/\bPES\b/.test(T)) r.moneda = 'ARS';
  else if (/\b(?:d[oó]lar(?:es)?|usd|u\$s|u\$d)\b/i.test(T)) r.moneda = 'USD';
  else if (/\beuros?\b|\beur\b/i.test(T))                     r.moneda = 'EUR';
  else if (/\bpesos?\b|\bars\b|\$/i.test(T))                  r.moneda = 'ARS';

  // Tipo de cambio
  m = T.match(/(?:tipo\s+de\s+cambio|cotizaci[oó]n)\s*:?\s*([\d.,]+)/i);
  if (m) r.tipoCambio = parseEsNumber(m[1]);

  // Helpers para regex de importes.
  const numAt = (rx) => {
    const mm = T.match(rx);
    return mm ? parseEsNumber(mm[1]) : null;
  };
  const N = '([\\d\\.\\,]+)';

  // ─── DETALLE COMPUTO DE IVA ──────────────────────────────────────────
  // Patrón frecuente en software de gestión: "10.50% sobre 775780.38 = 81456.94".
  // Tasa con coma o punto decimal. Iteramos todos los matches.
  const computoIvaRe = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*sobre\s+([\d.,]+)\s*=\s*([\d.,]+)/gi;
  let cmIva;
  while ((cmIva = computoIvaRe.exec(T)) !== null) {
    const tasa = parseFloat(String(cmIva[1]).replace(',', '.'));
    const neto = parseEsNumber(cmIva[2]);
    const iva  = parseEsNumber(cmIva[3]);
    if      (Math.abs(tasa - 21)   < 0.05) { r.netoGravIva21  = neto; r.iva21  = iva; }
    else if (Math.abs(tasa - 10.5) < 0.05) { r.netoGravIva105 = neto; r.iva105 = iva; }
    else if (Math.abs(tasa - 27)   < 0.05) { r.netoGravIva27  = neto; r.iva27  = iva; }
    else if (Math.abs(tasa - 5)    < 0.05) { r.netoGravIva5   = neto; r.iva5   = iva; }
    else if (Math.abs(tasa - 2.5)  < 0.05) { r.netoGravIva25  = neto; r.iva25  = iva; }
    else if (Math.abs(tasa - 0)    < 0.05) { r.netoGravIva0   = neto; }
  }

  // ─── Fallback regex para IVA discriminado (etiqueta + valor en línea) ─
  if (r.netoGravIva21  == null) r.netoGravIva21  = numAt(new RegExp(`(?:importe\\s+)?neto\\s+gravado(?:\\s+iva)?\\s*21\\s*%[\\s:]*\\$?\\s*${N}`, 'i'));
  if (r.netoGravIva105 == null) r.netoGravIva105 = numAt(new RegExp(`(?:importe\\s+)?neto\\s+gravado(?:\\s+iva)?\\s*10[\\.,]5\\s*%[\\s:]*\\$?\\s*${N}`, 'i'));
  if (r.netoGravIva27  == null) r.netoGravIva27  = numAt(new RegExp(`(?:importe\\s+)?neto\\s+gravado(?:\\s+iva)?\\s*27\\s*%[\\s:]*\\$?\\s*${N}`, 'i'));
  if (r.netoGravIva5   == null) r.netoGravIva5   = numAt(new RegExp(`(?:importe\\s+)?neto\\s+gravado(?:\\s+iva)?\\s*5\\s*%[\\s:]*\\$?\\s*${N}`, 'i'));
  if (r.netoGravIva25  == null) r.netoGravIva25  = numAt(new RegExp(`(?:importe\\s+)?neto\\s+gravado(?:\\s+iva)?\\s*2[\\.,]5\\s*%[\\s:]*\\$?\\s*${N}`, 'i'));
  if (r.netoGravIva0   == null) r.netoGravIva0   = numAt(new RegExp(`(?:importe\\s+)?neto\\s+gravado(?:\\s+iva)?\\s*0\\s*%[\\s:]*\\$?\\s*${N}`, 'i'));

  const ivaPure = (pct) => {
    const pctRegex = pct === '105' ? '10[\\.,]5' : (pct === '25' ? '2[\\.,]5' : pct);
    return new RegExp(`(?:^|[\\n\\r;])\\s*(?:importe\\s+)?iva\\s*${pctRegex}\\s*%[\\s:]*\\$?\\s*${N}`, 'im');
  };
  if (r.iva21  == null) r.iva21  = numAt(ivaPure('21'));
  if (r.iva105 == null) r.iva105 = numAt(ivaPure('105'));
  if (r.iva27  == null) r.iva27  = numAt(ivaPure('27'));
  if (r.iva5   == null) r.iva5   = numAt(ivaPure('5'));
  if (r.iva25  == null) r.iva25  = numAt(ivaPure('25'));

  // ─── Otros Tributos / DNT / Percepciones ─────────────────────────────
  // Software de turismo: "Concepto facturado por cta y orden de terceros - DNT - imp. adicionales: PES NNNN"
  let mOt = T.match(/concepto\s+facturado\s+por\s+(?:cta|cuenta)\s+y[\s\S]{0,300}?PES\s+([\d.,]+)/i);
  if (mOt) r.otrosTributos = parseEsNumber(mOt[1]);
  if (r.otrosTributos == null) {
    mOt = T.match(/\b(?:dnt|imp\.?\s*adicionales|percep(?:ciones?)?(?:\s+iibb)?|impuestos?\s+nacionales?)\b[\s\S]{0,80}?PES\s+([\d.,]+)/i);
    if (mOt) r.otrosTributos = parseEsNumber(mOt[1]);
  }
  if (r.otrosTributos == null) {
    r.otrosTributos = numAt(new RegExp(`(?:importe\\s+)?otros\\s+tributos?[\\s:]*\\$?\\s*${N}`, 'i'));
  }

  // ─── Neto No Gravado / Op. Exentas ───────────────────────────────────
  if (r.netoNoGravado == null) {
    r.netoNoGravado = numAt(new RegExp(`(?:importe\\s+)?(?:neto\\s+)?no\\s+gravado[\\s:]*\\$?\\s*${N}`, 'i'));
  }
  if (r.opExentas == null) {
    r.opExentas = numAt(new RegExp(`(?:importe\\s+)?(?:op(?:eraciones)?\\s+)?exentas?[\\s:]*\\$?\\s*${N}`, 'i'));
  }

  // ─── Total IVA y Neto Gravado Total ──────────────────────────────────
  if (r.totalIva == null) {
    r.totalIva = numAt(new RegExp(`(?:importe\\s+)?total\\s+iva[\\s:]*\\$?\\s*${N}`, 'i'));
  }
  if (r.netoGravadoTotal == null) {
    r.netoGravadoTotal = numAt(new RegExp(
      `(?:importe\\s+)?neto\\s+gravado(?:\\s+total)?(?!\\s*iva)\\s*[:\\s]\\s*\\$?\\s*${N}`, 'i'
    ));
  }
  if (r.totalIva == null) {
    const sumIva = ['iva21', 'iva105', 'iva27', 'iva5', 'iva25']
      .map(k => r[k]).filter(v => typeof v === 'number');
    if (sumIva.length) r.totalIva = sumIva.reduce((a, b) => a + b, 0);
  }
  if (r.netoGravadoTotal == null) {
    const sumNeto = ['netoGravIva21', 'netoGravIva105', 'netoGravIva27', 'netoGravIva5', 'netoGravIva25', 'netoGravIva0']
      .map(k => r[k]).filter(v => typeof v === 'number');
    if (sumNeto.length) r.netoGravadoTotal = sumNeto.reduce((a, b) => a + b, 0);
  }

  // ─── Importe Total ───────────────────────────────────────────────────
  // Importante: NO permitimos que el regex cruce \n (los layouts AFIP separan
  // labels y valores en líneas distintas, y agarrar el primer número que aparezca
  // a continuación nos lleva a otro campo).
  let mTot = T.match(/\bimporte\s+total[ \t:]*\$?[ \t]*([\d.,]+)/i);
  if (!mTot) mTot = T.match(/(?:^|\n)[ \t]*total[ \t:]*\$?[ \t]*([\d.,]+)/i);
  if (mTot) {
    const v = parseEsNumber(mTot[1]);
    if (v != null && v > 0) r.impTotal = v;  // no aceptamos 0 como total válido
  }

  // Si no, buscamos un PES suelto cerca de "Son: PES …" (la frase escrita confirma el total).
  if (r.impTotal == null) {
    const sonIdx = T.search(/son\s*:?\s*PES/i);
    if (sonIdx >= 0) {
      const after = T.slice(sonIdx, sonIdx + 1500);
      const num = after.match(/(?:^|\n)\s*PES\s+([\d.,]+)\s*(?:\n|$)/);
      if (num) r.impTotal = parseEsNumber(num[1]);
    }
  }

  // ─── Layout AFIP estándar: labels y valores en columnas separadas ────
  // pdf-parse linealiza el PDF y a veces los valores aparecen ANTES de los labels.
  // Buscamos el bloque "Subtotal: $\nImporte Otros Tributos: $\nImporte Total: $"
  // y los 3 valores numéricos contiguos (antes o después del bloque).
  const labelBlock = T.match(/(subtotal\s*:\s*\$[\s\S]{0,40}importe\s+otros?\s+tributos?\s*:\s*\$[\s\S]{0,40}importe\s+total\s*:\s*\$)/i);
  if (labelBlock) {
    const idx = labelBlock.index;
    // Buscamos los 3 valores numéricos más cercanos antes del bloque (típico AFIP).
    const before = T.slice(Math.max(0, idx - 400), idx);
    const numsBefore = [...before.matchAll(/([\d.,]+)/g)]
      .map(x => parseEsNumber(x[1]))
      .filter(v => v != null && v >= 0)
      .slice(-3);
    // Y también buscamos después por si vinieran ahí.
    const after = T.slice(idx + labelBlock[0].length, idx + labelBlock[0].length + 400);
    const numsAfter = [...after.matchAll(/([\d.,]+)/g)]
      .map(x => parseEsNumber(x[1]))
      .filter(v => v != null && v >= 0)
      .slice(0, 3);

    // Heurística: en el layout AFIP los valores que pdf-parse devuelve están
    // en orden visual de la columna derecha pero NO necesariamente en el orden
    // de los labels. Validamos por suma: Total = Subtotal + Otros Tributos.
    // - El mayor de los 3 es siempre el Total.
    // - Si los otros dos suman al Total: el menor es Otros, el restante Subtotal.
    // - Si dos son iguales (caso Otros=0), los iguales son Subtotal/Total y el otro es Otros.
    const apply = (vals) => {
      if (vals.length < 3) return false;
      const sorted = [...vals].sort((a, b) => a - b);
      const [v1, v2, v3] = sorted;  // v1 ≤ v2 ≤ v3
      if (Math.abs((v1 + v2) - v3) < 1) {
        if (r.impTotal == null)        r.impTotal = v3;
        if (r.otrosTributos == null)   r.otrosTributos = v1;  // el más chico es Otros
        return true;
      }
      return false;
    };
    if (!apply(numsBefore)) apply(numsAfter);

    // Fallback final: si no validó suma, tomamos el mayor de los 3 como Total.
    if (r.impTotal == null) {
      const vals = numsBefore.length >= 3 ? numsBefore : numsAfter;
      if (vals.length >= 1) {
        const max = Math.max(...vals);
        if (max > 0) r.impTotal = max;
      }
    }
  }

  // ─── IVA Contenido (Ley 27.743 — Régimen de Transparencia Fiscal) ────
  // En facturas B/C el IVA no se discrimina, pero AFIP exige mostrarlo como
  // "IVA Contenido". Lo usamos como Total IVA y derivamos Neto Gravado Total.
  const ivaContenidoMatch = T.match(/iva\s+contenido\s*:?\s*\$?\s*([\d.,]+)/i);
  if (ivaContenidoMatch) {
    const ivaCont = parseEsNumber(ivaContenidoMatch[1]);
    if (ivaCont != null) {
      if (r.totalIva == null || r.totalIva === 0) r.totalIva = ivaCont;
      if (r.iva21 == null && r.impTotal != null) {
        // Heurística: si el IVA Contenido / Imp.Total ≈ 21/121 = 0.1736,
        // asumimos todo a 21% y derivamos el neto.
        const ratio = ivaCont / r.impTotal;
        if (Math.abs(ratio - 21/121) < 0.005) {
          r.iva21 = ivaCont;
          r.netoGravIva21 = r.impTotal - ivaCont;
          if (r.netoGravadoTotal == null) r.netoGravadoTotal = r.impTotal - ivaCont;
        } else if (Math.abs(ratio - 10.5/110.5) < 0.005) {
          r.iva105 = ivaCont;
          r.netoGravIva105 = r.impTotal - ivaCont;
          if (r.netoGravadoTotal == null) r.netoGravadoTotal = r.impTotal - ivaCont;
        }
      }
    }
  }

  // ─── Pie de columnas (formato típico del software de turismo) ────────
  // Ej: "PES 1526542.44 ^PES 0.00 ^PES 1284919.73 ^PES 188376.20 ^PES …"
  const pieRe = /PES\s+([\d.,]+)(?:\s*\^?\s*PES\s+([\d.,]+))(?:\s*\^?\s*PES\s+([\d.,]+))?(?:\s*\^?\s*PES\s+([\d.,]+))?(?:\s*\^?\s*PES\s+([\d.,]+))?/i;
  const pieMatch = T.match(pieRe);
  if (pieMatch) {
    const vals = pieMatch.slice(1).filter(Boolean).map(parseEsNumber).filter(v => v != null);
    if (vals.length >= 3) {
      const close = (a, b) => a != null && b != null && Math.abs(a - b) < 1;
      const usedIdx = new Set();
      vals.forEach((v, i) => {
        if (close(v, r.netoGravadoTotal))     usedIdx.add(i);
        else if (close(v, r.totalIva))        usedIdx.add(i);
        else if (close(v, r.impTotal))        usedIdx.add(i);
        else if (close(v, r.otrosTributos))   usedIdx.add(i);
      });
      // Imp. Total: si un valor del pie es la suma de los demás, ese es el total.
      if (r.impTotal == null) {
        for (let i = 0; i < vals.length; i++) {
          const other = vals.filter((_, j) => j !== i).reduce((a, b) => a + b, 0);
          if (close(vals[i], other) && vals[i] > 0) { r.impTotal = vals[i]; usedIdx.add(i); break; }
        }
      }
      const zeros = vals.map((v, i) => ({ v, i })).filter(x => x.v === 0 && !usedIdx.has(x.i));
      if (r.opExentas == null && zeros.length) { r.opExentas = 0; usedIdx.add(zeros[0].i); }
      const remaining = vals.map((v, i) => ({ v, i })).filter(x => x.v > 0 && !usedIdx.has(x.i));
      if (r.netoNoGravado == null && remaining.length === 1) {
        r.netoNoGravado = remaining[0].v;
      }
    }
  }

  return r;
}

// ─────────────────────── Procesamiento de archivos ────────────────────

/** Decodifica payload base64 de un dataURL o base64 puro a Buffer. */
function inputToBuffer(dataOrUrl) {
  if (!dataOrUrl) return null;
  if (Buffer.isBuffer(dataOrUrl)) return dataOrUrl;
  let s = String(dataOrUrl);
  if (s.startsWith('data:')) s = s.split(',')[1] || '';
  return Buffer.from(s, 'base64');
}

/** Busca URL del QR AFIP dentro de un string (links del PDF, QR ya decodificado, etc.).
 *  Tolera saltos de línea y espacios sueltos dentro del payload base64. */
function findAfipQrUrl(str) {
  if (!str) return null;
  const s = String(str);
  // 1. URL en una línea
  const m = s.match(/https?:\/\/[^\s'"<>]*afip\.gob\.ar\/fe\/qr\/[^\s'"<>]*/i);
  if (m) return m[0];
  // 2. URL partida por saltos: extraer manualmente desde "afip.gob.ar/fe/qr/?p="
  const idx = s.toLowerCase().indexOf('afip.gob.ar/fe/qr/?p=');
  if (idx === -1) return null;
  // Tomamos los siguientes ~600 chars y limpiamos whitespace; el payload base64 es URL-safe
  const tail = s.slice(idx + 'afip.gob.ar/fe/qr/?p='.length, idx + 800);
  const cleaned = tail.replace(/\s+/g, '');
  // Cortamos al primer carácter no admitido por base64-url
  const m2 = cleaned.match(/^[A-Za-z0-9+/=_-]+/);
  if (!m2 || m2[0].length < 20) return null;
  return 'https://www.afip.gob.ar/fe/qr/?p=' + m2[0];
}

/** Extrae texto de un PDF y, si encuentra, la URL del QR AFIP. */
async function processPdf(buffer) {
  const out = { rawText: '', qrUrl: null, qrPayload: null };
  try {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const data = await parser.getText();
    out.rawText = data.text || '';
    // pdf-parse v2 también devuelve hyperlinks de las anotaciones del PDF.
    try {
      const links = await parser.getHyperlinks();
      if (Array.isArray(links)) {
        for (const l of links) {
          const url = (l && (l.url || l.href || l)) || '';
          const m = findAfipQrUrl(String(url));
          if (m) { out.qrUrl = m; break; }
        }
      }
    } catch (_) { /* hyperlinks no obligatorio */ }
    if (!out.qrUrl) out.qrUrl = findAfipQrUrl(out.rawText);
    if (out.qrUrl) out.qrPayload = decodeAfipQrUrl(out.qrUrl);
    try { await parser.destroy?.(); } catch (_) {}
  } catch (err) {
    log.warn({}, 'pdf_parse_error', { error: err.message });
  }
  return out;
}

/** Lee QR de una imagen con jsqr (sobre raw RGBA). */
async function scanQrFromImage(buffer) {
  try {
    const jsQR = require('jsqr');
    // Bajamos resolución agresiva para acelerar; jsqr es lento en imágenes grandes.
    const img = await sharp(buffer).rotate().resize({ width: 1600, withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { data, info } = img;
    const code = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height);
    return code ? code.data : null;
  } catch (err) {
    log.warn(null, 'qr_scan_error', { error: err.message });
    return null;
  }
}

/** OCR fallback con tesseract.js (lazy load). */
async function ocrImage(buffer) {
  try {
    const { createWorker } = require('tesseract.js');
    const worker = await createWorker('spa');
    const { data } = await worker.recognize(buffer);
    await worker.terminate();
    return data.text || '';
  } catch (err) {
    log.warn(null, 'ocr_error', { error: err.message });
    return '';
  }
}

/** Une dos records: el primero (más confiable, p.ej. QR) gana cuando hay valor. */
function merge(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b)) {
    if (out[k] == null && b[k] != null) out[k] = b[k];
  }
  return out;
}

// ───────────────────────── Endpoint ────────────────────────────────────

router.post('/extract', async (req, res) => {
  const startTime = Date.now();
  try {
    const { fileName, fileData, mimeType } = req.body || {};
    if (!fileData) return res.status(400).json({ error: 'fileData (base64) es requerido' });

    const buf = inputToBuffer(fileData);
    if (!buf) return res.status(400).json({ error: 'No se pudo decodificar el archivo' });

    const ext = (fileName || '').toLowerCase().split('.').pop();
    const mt = (mimeType || '').toLowerCase();
    const isPdf = mt === 'application/pdf' || ext === 'pdf';

    let qrPayload = null;
    let rawText = '';
    let sources = [];

    if (isPdf) {
      const pdf = await processPdf(buf);
      rawText = pdf.rawText;
      qrPayload = pdf.qrPayload;
      sources.push('pdf-text');
      if (qrPayload) sources.push('qr');
    } else {
      // Imagen
      const qrData = await scanQrFromImage(buf);
      if (qrData) {
        const url = findAfipQrUrl(qrData) || qrData;
        qrPayload = decodeAfipQrUrl(url);
        if (qrPayload) sources.push('qr');
      }
      // Si no hay QR o no es de AFIP, OCR
      if (!qrPayload) {
        rawText = await ocrImage(buf);
        if (rawText) sources.push('ocr');
      }
    }

    // Combinamos QR (alta confianza) con regex sobre texto (completa lo que falta).
    const qrFields = fromAfipQr(qrPayload);
    const textFields = extractFromText(rawText);
    let fields = merge(qrFields, textFields);

    // Aseguramos todas las keys del schema (null donde no hay dato).
    fields = { ...emptyRecord(), ...fields };

    // Confianza heurística
    let confidence = 'low';
    const filledCount = Object.values(fields).filter(v => v != null && v !== '').length;
    if (qrPayload && filledCount >= 8) confidence = 'high';
    else if (filledCount >= 12)         confidence = 'high';
    else if (filledCount >= 6)          confidence = 'medium';

    const response = {
      ok: true,
      fileName: fileName || null,
      mimeType: mt || null,
      sources,
      confidence,
      schema: FIELD_SCHEMA,
      fields,
      qrPayload: qrPayload || null,
      rawTextSnippet: (rawText || '').slice(0, 4000),
      ms: Date.now() - startTime,
    };

    log.info(req, 'admin_ia_extract', {
      file: fileName, sources, confidence, filled: filledCount, ms: response.ms,
    });

    res.json(response);
  } catch (err) {
    log.error(req, 'admin_ia_error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

// Permite que el frontend obtenga el schema sin hacer una extracción
router.get('/schema', (_req, res) => {
  res.json({ schema: FIELD_SCHEMA });
});

module.exports = router;
