'use strict';

/**
 * ocrWorker — singleton de tesseract.js con auto-terminate.
 *
 * Diseño RAM-friendly:
 *  - El worker se carga lazy en la primera llamada a `ocrBuffer()` (≈150-250 MB).
 *  - Se reutiliza entre requests, evitando recargar el modelo `spa` (cuesta ≈50 MB de tráfico
 *    + 500 ms de inicialización por cada respawn).
 *  - Tras IDLE_MS sin uso, se termina automáticamente y libera la RAM.
 *  - Una sola pasada de OCR por imagen (PSM 6 = single uniform block) — multi-pass duplica
 *    RAM y tiempo a cambio de mejoras marginales.
 *
 * Uso:
 *   const { ocrBuffer, terminate } = require('./ocrWorker');
 *   const text = await ocrBuffer(pngBuffer);
 *
 * Si necesitás liberar la RAM antes del idle (ej. al apagar el server):
 *   await terminate();
 */

const IDLE_MS = 5 * 60 * 1000;     // 5 minutos
const LANG = 'spa';
const PSM_SINGLE_BLOCK = 6;        // tesseract PSM (Page Segmentation Mode)

let worker = null;
let initPromise = null;
let idleTimer = null;
let inFlight = 0;

async function getWorker() {
  if (worker) return worker;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const { createWorker } = require('tesseract.js');
    const w = await createWorker(LANG);
    // PSM 6: tratamos toda la imagen como un único bloque uniforme.
    // Es el modo que mejor calza para facturas con texto en filas regulares.
    try {
      await w.setParameters({ tessedit_pageseg_mode: String(PSM_SINGLE_BLOCK) });
    } catch (_) { /* ignoramos: la API de tesseract.js varía por versión */ }
    worker = w;
    initPromise = null;
    return w;
  })();
  return initPromise;
}

function scheduleAutoTerminate() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (inFlight === 0) terminate();
  }, IDLE_MS);
}

async function terminate() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  const w = worker;
  worker = null;
  initPromise = null;
  if (w) {
    try { await w.terminate(); } catch (_) {}
  }
}

/**
 * Corre OCR sobre un buffer (PNG / JPEG / WebP / TIFF compatible con leptonica).
 * @param {Buffer} buf
 * @returns {Promise<string>} texto extraído
 */
async function ocrBuffer(buf) {
  if (!buf || !buf.length) return '';
  inFlight++;
  try {
    const w = await getWorker();
    const { data } = await w.recognize(buf);
    return (data && data.text) ? data.text : '';
  } finally {
    inFlight--;
    scheduleAutoTerminate();
  }
}

/** Estado interno (debug / monitoring). */
function status() {
  return {
    workerLoaded: !!worker,
    initInProgress: !!initPromise,
    inFlight,
    idleTerminateMs: IDLE_MS,
  };
}

module.exports = { ocrBuffer, terminate, status };
