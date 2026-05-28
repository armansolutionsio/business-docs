'use strict';

/**
 * voucherExtractor — Extrae informacion estructurada de vouchers de viaje
 * (PDFs o imagenes de hoteles, vuelos, traslados, seguros) y la mapea a los
 * campos del formulario Voucher de Arman Travel.
 *
 * Pipeline:
 *  1. Extrae texto: pdf-parse para PDFs, tesseract.js (OCR) para imagenes.
 *  2. Auto-detecta tipo por keywords (hotel / flight / transfer / insurance).
 *  3. Aplica regex tipo-especificos para obtener campos.
 *  4. Devuelve un payload { type, data: { hotels|flights|transfers|insurances|passengers } }
 *     que el frontend mergea directo en appState.voucher.
 */

const sharp = require('sharp');
const { ocrBuffer } = require('./ocrWorker');

// ─────────────────────── Utilidades ────────────────────────────────────

function toBuf(input) {
  if (!input) return null;
  if (Buffer.isBuffer(input)) return input;
  let s = String(input);
  if (s.startsWith('data:')) s = s.split(',')[1] || '';
  return Buffer.from(s, 'base64');
}

function toIsoDate(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return '';
  let [, d, mo, y] = m;
  if (y.length === 2) y = (parseInt(y, 10) < 50 ? '20' : '19') + y;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function clean(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function titleCase(s) {
  if (!s) return s;
  return s.toLowerCase().replace(/\b([a-záéíóúñ])/g, (_, c) => c.toUpperCase());
}

function normalizeName(s) {
  if (!s) return s;
  return titleCase(s.replace(/^\s*(MS|MR|MRS|SR|SRA|SRTA|DR|DRA)\.?\s+/i, '').trim());
}

// ─────────────────────── Extraccion de texto ───────────────────────────

async function extractText(buf, mimeType, fileName) {
  const mt = (mimeType || '').toLowerCase();
  const ext = (fileName || '').toLowerCase().split('.').pop();
  const isPdf = mt === 'application/pdf' || ext === 'pdf';

  if (isPdf) {
    try {
      const { PDFParse } = require('pdf-parse');
      const parser = new PDFParse({ data: buf });
      const data = await parser.getText();
      try { await parser.destroy?.(); } catch (_) {}
      const text = (data && data.text) || '';
      if (text.trim().length > 30) return { text, source: 'pdf-text' };
    } catch (e) {
      // Fallback a rasterizar + OCR mas abajo
    }
    // PDF sin texto extraible: rasterizar y OCR
    try {
      const { rasterizePdf } = require('./pdfRasterize');
      const pages = await rasterizePdf(buf, { scale: 2, maxPages: 3 });
      let acc = '';
      for (const p of pages) {
        const t = await ocrBuffer(p.buffer);
        if (t) acc += t + '\n';
      }
      return { text: acc, source: 'pdf-ocr' };
    } catch (e) {
      return { text: '', source: 'pdf-failed' };
    }
  }

  // Imagen: OCR directo (con sharp para auto-rotate)
  try {
    const norm = await sharp(buf).rotate().toBuffer();
    const text = await ocrBuffer(norm);
    return { text: text || '', source: 'ocr' };
  } catch (e) {
    const text = await ocrBuffer(buf);
    return { text: text || '', source: 'ocr' };
  }
}

// ─────────────────────── Auto-deteccion de tipo ────────────────────────

const TYPE_KEYWORDS = {
  insurance: [
    /\bseguro\s+(?:de\s+)?viaje\b/i, /\bp[oó]liza\b/i, /\bassist\s*card\b/i,
    /\buniversal\s+assistance\b/i, /\bcoris\b/i, /\bcobertura\s+m[eé]dica\b/i,
    /\bassistance\s+(?:plan|number|policy)\b/i, /\binsurance\b/i,
    /\bn[°º]\s*p[oó]liza\b/i, /\bplan\s+(?:de\s+)?asistencia\b/i,
  ],
  flight: [
    /\bjet\s*smart\b/i, /\baerol[ií]neas\s+argentinas\b/i, /\blatam\b/i,
    /\bvuelo\b/i, /\bflight\b/i, /\bairline\b/i, /\bairlines?\b/i,
    /\bboarding\s+pass\b/i, /\baeropuerto\b/i, /\baeroparque\b/i,
    /\bhora\s+de\s+(?:salida|llegada)\b/i, /\bpnr\b/i,
    /\bconfirmaci[oó]n\s+reserva\b/i, /\bticket\s+number\b/i,
    /\bn[°º]?\s*ticket\b/i,
  ],
  hotel: [
    /\bvoucher\s+hotel\b/i, /\bhotel\b/i, /\bcheck[\s\-]?in\b/i,
    /\bcheck[\s\-]?out\b/i, /\bestad[ií]a\b/i, /\bentrada\s*:.*salida\s*:/i,
    /\bhabitaci[oó]n(?:es)?\b/i, /\bbed\s+and\s+breakfast\b/i,
    /\ball\s+inclusive\b/i, /\bnoches\b/i, /\balojamiento\b/i,
  ],
  transfer: [
    /\btransfer\s+voucher\b/i, /\btransfer\s+in\b/i, /\btransfer\s+out\b/i,
    /\btraslado\b/i, /\bpickup\b/i, /\bdropoff\b/i, /\bida\s*\n+\d/i,
    /\bvuelta\s*\n+\d/i, /\bsh?uttle\b/i,
  ],
};

function detectType(text) {
  if (!text) return 'unknown';
  const scores = { hotel: 0, flight: 0, transfer: 0, insurance: 0 };
  for (const [type, patterns] of Object.entries(TYPE_KEYWORDS)) {
    for (const rx of patterns) {
      const m = text.match(rx);
      if (m) scores[type] += 1;
    }
  }
  let best = 'unknown', bestScore = 0;
  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) { bestScore = score; best = type; }
  }
  return bestScore >= 1 ? best : 'unknown';
}

// ─────────────────────── Extractores comunes ───────────────────────────

function extractReservationCode(text) {
  // "RESERVA: PH_3196H-1" / "Confirmacion Reserva I52BNV" / "PNR: ABCDEF" / "Codigo: #203880"
  // Reglas: requerimos ':' o que el match parezca un codigo (mayusculas+digitos, no palabras como "confirmada").
  const looksLikeCode = (s) => /[0-9_\-#]/.test(s) || /^[A-Z0-9]{4,}$/.test(s);
  const patterns = [
    /reserva\s*:\s*([A-Z0-9][A-Z0-9_\-/#]{3,20})/i,                        // requiere ':'
    /confirmaci[oó]n\s+reserva\s+([A-Z0-9]{4,12})\b/i,
    /\bpnr\s*:?\s*([A-Z0-9]{5,8})\b/i,
    /c[oó]digo\s+tripplanner\s*:?\s*#?(\d{4,10})/i,
    /\blocaliz?ador\s*:?\s*([A-Z0-9]{5,10})\b/i,
    /n[°º]\s*p[oó]liza\s*:?\s*([A-Z0-9\-]{4,20})/i,
    /policy\s+(?:n[°ºo]?|number)\s*:?\s*([A-Z0-9\-]{4,20})/i,
  ];
  for (const rx of patterns) {
    const m = text.match(rx);
    if (m && m[1]) {
      const code = m[1].trim();
      // Descartamos palabras espurias (confirmada, confirmado, pendiente, cancelada, etc.)
      if (/^(confirmad[oa]|pendiente|cancelad[oa]|pagad[oa]|vigente)$/i.test(code)) continue;
      if (!looksLikeCode(code)) continue;
      return code;
    }
  }
  return '';
}

function extractDateRange(text) {
  // "Entrada: 18/10/2026 - Salida: 25/10/2026"
  let m = text.match(/entrada\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-–a]\s*salida\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (m) return { from: toIsoDate(m[1]), to: toIsoDate(m[2]) };
  m = text.match(/check[\s\-]?in\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4}).{1,40}?check[\s\-]?out\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/is);
  if (m) return { from: toIsoDate(m[1]), to: toIsoDate(m[2]) };
  m = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:al|a|hasta|-|–|to)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (m) return { from: toIsoDate(m[1]), to: toIsoDate(m[2]) };
  return { from: '', to: '' };
}

// Palabras que aparecen pegadas a un nombre y no son parte del nombre.
const NON_NAME_TOKENS = new Set([
  'TELEFONO','TELÉFONO','EMAIL','CONDI','CONDIÇOES','CONDIÇÕES','VOUCHER','HOTEL',
  'NOMBRE','APELLIDO','TITULAR','ACOMPANANTE','ACOMPAÑANTE','PASAJERO','PASAJEROS',
  'RESERVA','BIRTH','FECHA','DOC','DOCUMENTO','EIRELI','SRL','SA','LTDA','LTD',
  'CHD','ADULTO','ADULTOS','MENOR','INCLUIDO',
  'OPERADOR','PROVEEDOR','TOWER','TRAVEL','TURISMO','VIP','PREMIUM','DETALLE',
  'CIUDAD','VUELO','FLIGHT','TRANSFER','VUELTA','IDA','REGRESO','REGIMEN','DROPOFF',
  'PICKUP','SALIDA','LLEGADA','HORA',
]);

function cleanNameTokens(raw) {
  if (!raw) return '';
  const tokens = clean(raw).split(/\s+/);
  const filtered = [];
  for (const t of tokens) {
    const up = t.toUpperCase().replace(/[.,;:]/g, '');
    if (NON_NAME_TOKENS.has(up)) break; // basura → cortar
    // Token tiene que ser alfa (admite acentos). Si no lo es, lo salteamos.
    if (!/^[A-ZÁÉÍÓÚÑa-záéíóúñ.'\-]{2,}$/.test(t)) continue;
    filtered.push(t);
    if (filtered.length >= 5) break; // nombres muy largos: cortar
  }
  return filtered.join(' ').trim();
}

function extractPassengers(text) {
  const passengers = [];
  const seen = new Set();
  const push = (name) => {
    const cleaned = cleanNameTokens(name);
    const n = normalizeName(cleaned);
    if (!n) return;
    if (n.length < 4 || n.split(/\s+/).length < 2) return;
    // Filtros adicionales: no aceptar si todo es palabra-comun
    const upperWords = n.toUpperCase().split(/\s+/);
    if (upperWords.every(w => NON_NAME_TOKENS.has(w))) return;
    const k = n.toLowerCase().replace(/\s+/g, ' ');
    // Deduplicar tambien si el nombre actual es un reordenamiento del previo
    const sortedKey = k.split(' ').sort().join(' ');
    for (const s of seen) {
      if (s === k) return;
      if (s.split(' ').sort().join(' ') === sortedKey) return;
    }
    seen.add(k);
    passengers.push({ name: n, document: '', birthDate: '' });
  };

  // 1. TITULAR / ACOMPAÑANTE con Nombre + Apellido (mas confiable)
  for (const m of text.matchAll(/(?:titular|acompa[ñn]ante|passenger)\s*(?:\d*)?\s*[:\-]?\s*nombre\s*:?\s*([A-ZÁÉÍÓÚÑa-záéíóúñ.\s]{2,40})\s+apellido\s*:?\s*([A-ZÁÉÍÓÚÑa-záéíóúñ.\s]{2,40?})/gi)) {
    push(`${m[1]} ${m[2]}`);
  }
  // 2. "Nombre: X Apellido: Y" (mismo bloque)
  for (const m of text.matchAll(/nombre\s*:?\s*([A-ZÁÉÍÓÚÑa-záéíóúñ.\s]{2,40})\s+apellido\s*:?\s*([A-ZÁÉÍÓÚÑa-záéíóúñ.\s]{2,40})/gi)) {
    push(`${m[1]} ${m[2]}`);
  }
  // 3. Adulto N: NOMBRE — detener en saltos de linea o en otra etiqueta
  for (const m of text.matchAll(/adulto\s*\d*\s*:\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ.\s]{4,60}?)(?=\n+(?:adulto|menor|titular|acompa|nombre|apellido|telefono|voucher|reserva|fecha)|\n\s*\n|$)/gis)) {
    push(m[1]);
  }
  // 4. "Pasajero N: NAME"
  for (const m of text.matchAll(/(?:pasajero|passenger)\s*\d+\s*:\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ.\s]{4,40}?)(?=\n|$)/gi)) {
    push(m[1]);
  }
  // 5. Linea aislada en MAYUSCULAS con tratamiento (MS/MR/SR/SRA) — patron muy especifico
  //    Solo tomamos si la linea anterior contenia "NOMBRE PASAJERO" o "PASAJERO 1"
  const lines = text.split(/\n/);
  for (let i = 0; i < lines.length; i++) {
    const prev = (lines[i - 1] || '').toUpperCase();
    if (!/NOMBRE\s+PASAJERO|PASAJERO\s+\d|PASSENGER\s+NAME/i.test(prev)) continue;
    const cur = lines[i].trim();
    const next = (lines[i + 1] || '').trim();
    // Soporta nombre partido en 2 lineas: "MS VERONICA INES" \n "FERNANDEZ POETA"
    let candidate = cur;
    if (/^[A-ZÁÉÍÓÚÑ\s.]+$/.test(next) && next.length > 2 && next.length < 60 &&
        !NON_NAME_TOKENS.has(next.split(/\s+/)[0].toUpperCase())) {
      candidate = `${cur} ${next}`;
    }
    push(candidate);
  }
  return passengers;
}

// ─────────────────────── Hotel ─────────────────────────────────────────

function extractHotel(text) {
  const T = clean(text);
  const hotel = {
    name: '', address: '', checkIn: '', checkOut: '', nights: '',
    roomType: '', mealPlan: '', confirmationCode: '', notes: '',
  };

  // Nombre del hotel: tipicamente el bloque mas grande en MAYUSCULAS
  // o lo que sigue a "Hotel:" o aparece junto a "VOUCHER HOTEL"
  let m = text.match(/(?:nombre\s+del\s+hotel|hotel)\s*:\s*([A-ZÁÉÍÓÚÑ0-9][^\n]{4,80})/i);
  if (m) hotel.name = clean(m[1]);
  // Linea en MAYUSCULAS antes/despues de "VOUCHER HOTEL" - solo lineas con 2+ palabras
  if (!hotel.name) {
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    for (const l of lines) {
      // Linea casi toda en mayusculas, con "HOTEL" o "RESORT" o similar
      if (/(HOTEL|RESORT|INN|SUITES|LODGE|HOSTAL|POSADA|VILLA)/.test(l) &&
          /^[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s\-\.&'()]{3,80}$/.test(l) &&
          !/^VOUCHER\s+HOTEL$/i.test(l)) {
        hotel.name = clean(l);
        break;
      }
    }
  }

  // Direccion: "Direccion:" o linea geo (calle, numero)
  m = text.match(/(?:direcci[oó]n|address|location)\s*:\s*([^\n]{6,120})/i);
  if (m) hotel.address = clean(m[1]);
  if (!hotel.address) {
    // Loteamento ..., Av. ..., Calle ...
    m = text.match(/(?:^|\n)\s*((?:Loteamento|Av\.?|Avenida|Calle|Rua|R\.|Street|Rd\.?)[^\n]{4,120})/im);
    if (m) hotel.address = clean(m[1]);
  }

  // Fechas check-in/check-out
  const { from, to } = extractDateRange(text);
  hotel.checkIn = from;
  hotel.checkOut = to;

  // Noches
  m = text.match(/estad[ií]a\s*:?\s*(\d+)\s*noches?/i)
    || text.match(/(\d+)\s*noches?\b/i);
  if (m) hotel.nights = parseInt(m[1], 10);
  // Si no aparece, calcularlo desde fechas
  if (!hotel.nights && hotel.checkIn && hotel.checkOut) {
    const d1 = new Date(hotel.checkIn), d2 = new Date(hotel.checkOut);
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    if (diff > 0 && diff < 365) hotel.nights = diff;
  }

  // Tipo de habitacion: "1 HABITACION" + linea siguiente / "SMART" / "Doble"
  m = text.match(/(?:habitaci[oó]n|room\s+type)\s*:\s*([^\n]{2,60})/i);
  if (m) hotel.roomType = clean(m[1]);
  if (!hotel.roomType) {
    // En el voucher de Kembali: "1 HABITACION 2 PASAJEROS\nSMART\nBED AND BREAKFAST"
    // Tomamos la primera linea no-vacia despues del bloque HABITACION.
    const habitMatch = text.match(/\d+\s*habitaci[oó]n[^\n]*\n+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\- ]{1,30})\s*(?:\n|$)/i);
    if (habitMatch) hotel.roomType = clean(habitMatch[1]);
  }

  // Plan de comida / regimen
  m = text.match(/(bed\s+and\s+breakfast|all\s+inclusive|half\s+board|full\s+board|media\s+pensi[oó]n|pensi[oó]n\s+completa|desayuno|solo\s+alojamiento|room\s+only)/i);
  if (m) hotel.mealPlan = clean(m[1]);

  // Codigo de confirmacion / reserva
  hotel.confirmationCode = extractReservationCode(text);

  return hotel;
}

// ─────────────────────── Vuelo / Aereo ─────────────────────────────────

function extractFlights(text) {
  const flights = [];

  // Codigo de reserva del header
  const pnr = extractReservationCode(text);

  // Aerolinea detectable
  let airline = '';
  const airlineMap = [
    [/jet\s*smart\s+airlines/i, 'JetSMART'],
    [/jet\s*smart/i, 'JetSMART'],
    [/aerol[ií]neas\s+argentinas/i, 'Aerolineas Argentinas'],
    [/latam/i, 'LATAM'],
    [/copa\s+airlines/i, 'Copa Airlines'],
    [/american\s+airlines/i, 'American Airlines'],
    [/iberia/i, 'Iberia'],
    [/avianca/i, 'Avianca'],
    [/gol/i, 'GOL'],
    [/azul/i, 'Azul'],
    [/sky\s+airline/i, 'Sky Airline'],
    [/flybondi/i, 'Flybondi'],
  ];
  for (const [rx, name] of airlineMap) {
    if (rx.test(text)) { airline = name; break; }
  }

  // Vuelo: detectamos patrones "*Vuelo XXNNNN" / "Vuelo: XX1234"
  // En el JetSMART example aparece como "*Vuelo JA3826 (WJ) - Operado por JetSMART Airlines"
  // En cada bloque buscamos "Fecha: DD/MM/YYYY ... AEP ... REC ... Hora de salida:HH:MM ... Hora de llegada:HH:MM ... Vuelo XXNN"

  // Estrategia: dividir texto en "bloques" por "Fecha:" o "*Vuelo" y procesar cada uno
  // Buscar todas las ocurrencias de "Fecha: DD/MM/YYYY" como puntos de anclaje
  const dateAnchors = [...text.matchAll(/fecha\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/gi)];

  if (dateAnchors.length === 0) {
    // Patron alternativo: buscar "Vuelo XX1234" directamente
    const flightCodes = [...text.matchAll(/\*?\s*vuelo\s+([A-Z]{1,3}\d{2,4}[A-Z]?)\b/gi)];
    if (flightCodes.length === 0) return flights;
  }

  for (let i = 0; i < dateAnchors.length; i++) {
    const start = dateAnchors[i].index;
    const end = i + 1 < dateAnchors.length ? dateAnchors[i + 1].index : text.length;
    const block = text.slice(start, end);

    const f = {
      airline,
      flightNumber: '',
      origin: '',
      destination: '',
      departureDate: toIsoDate(dateAnchors[i][1]),
      departureTime: '',
      arrivalDate: '',
      arrivalTime: '',
      class: '',
      reservationCode: pnr,
      baggage: '',
      notes: '',
    };

    let bm = block.match(/\*?\s*vuelo\s+([A-Z]{1,3}\d{2,4}[A-Z]?)/i);
    if (bm) f.flightNumber = bm[1].toUpperCase();

    // Codigos IATA (3 letras) y nombres de ciudad
    // Buscar dos codigos IATA en el bloque (origen, destino)
    const iataMatches = [...block.matchAll(/\b([A-Z]{3})\b(?!\s+[A-Z]{3})/g)]
      .map(m => m[1]).filter(c => !['VUELO', 'JET', 'AAR', 'PNR'].includes(c));
    // Filtrar IATA "reales": usualmente codigos de aeropuerto comunes
    // Mejor: buscar el patron del JetSMART "Buenos Aires, Aeroparque\nAEP" + "Recife\nREC"
    const cityIataPairs = [...block.matchAll(/([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ ,]{2,40})\s*\n+\s*([A-Z]{3})\b/g)];
    if (cityIataPairs.length >= 2) {
      f.origin = `${clean(cityIataPairs[0][2])} - ${clean(cityIataPairs[0][1])}`;
      f.destination = `${clean(cityIataPairs[1][2])} - ${clean(cityIataPairs[1][1])}`;
    } else if (iataMatches.length >= 2) {
      f.origin = iataMatches[0];
      f.destination = iataMatches[1];
    }

    bm = block.match(/hora\s+de\s+salida\s*:?\s*(\d{1,2}:\d{2})/i);
    if (bm) f.departureTime = bm[1];
    bm = block.match(/hora\s+de\s+llegada\s*:?\s*(\d{1,2}:\d{2})/i);
    if (bm) f.arrivalTime = bm[1];
    // Asumimos llegada el mismo dia salvo que el contexto sugiera otra cosa
    if (f.departureTime && f.arrivalTime) {
      f.arrivalDate = f.departureDate;
      // Si la hora de llegada es menor a la de salida, asumimos al dia siguiente
      const [dh, dm] = f.departureTime.split(':').map(Number);
      const [ah, am] = f.arrivalTime.split(':').map(Number);
      if (ah * 60 + am < dh * 60 + dm) {
        const d = new Date(f.departureDate);
        d.setDate(d.getDate() + 1);
        f.arrivalDate = d.toISOString().split('T')[0];
      }
    }

    bm = block.match(/clase\s*:?\s*([A-Za-z][A-Za-z\s]{2,20})/i);
    if (bm) f.class = clean(bm[1]);

    // Solo agregar si tenemos al menos numero de vuelo o ruta
    if (f.flightNumber || f.origin || f.destination) flights.push(f);
  }

  return flights;
}

// ─────────────────────── Traslado ──────────────────────────────────────

function extractTransfers(text) {
  const transfers = [];

  // Codigo
  const code = extractReservationCode(text);

  // Detalle del servicio
  let type = '', service = '', provider = '', ciudad = '';
  let m = text.match(/transfer\s+(in\s*\+\s*out|in|out)/i);
  if (m) type = `Transfer ${m[1].toUpperCase().replace(/\s+/g, ' ')}`;
  // 'Regimen: Regular Ciudad: Porto de Galinhas' — el regex viejo se llevaba "Regular Ciudad".
  m = text.match(/regimen\s*:?\s*([A-Za-z][A-Za-z\s\-]{2,30}?)(?=\s+ciudad|\n|$)/i);
  if (m) service = clean(m[1]);
  m = text.match(/proveedor\s*:?\s*([^\n]{2,80})/i);
  if (m) provider = clean(m[1]);
  m = text.match(/ciudad\s*:?\s*([^\n]{2,60})/i);
  if (m) ciudad = clean(m[1]);

  // Buscamos bloques "Ida" / "Vuelta" con fechas
  // Patron: "Ida\n18/10/2026 Pickup: X Dropoff: Y"
  // O: "Vuelta\n25/10/2026 Pickup: X Dropoff: Y"
  const blockPatterns = [
    { rx: /\bida\b/i, label: 'Ida' },
    { rx: /\bvuelta\b/i, label: 'Vuelta' },
    { rx: /\bregreso\b/i, label: 'Regreso' },
  ];

  for (const bp of blockPatterns) {
    const idx = text.search(bp.rx);
    if (idx === -1) continue;
    const tail = text.slice(idx, idx + 400);
    const dm = tail.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
    // 'from' = entre "Pickup:" y "Dropoff:" o salto de linea
    const pickupM = tail.match(/pickup\s*:?\s*([^\n]+?)(?=\s+dropoff\s*:|\n|$)/i);
    const dropoffM = tail.match(/dropoff\s*:?\s*([^\n]+?)(?=\s+pickup\s*:|\n|$)/i);
    if (!dm && !pickupM && !dropoffM) continue;
    transfers.push({
      type: `${type} (${bp.label})`.trim(),
      service,
      provider,
      from: pickupM ? clean(pickupM[1]) : '',
      to: dropoffM ? clean(dropoffM[1]) : '',
      date: dm ? toIsoDate(dm[1]) : '',
      time: '',
      notes: code ? `Codigo: ${code}${ciudad ? ' / ' + ciudad : ''}` : ciudad,
    });
  }

  // Si no detectamos Ida/Vuelta pero hay un transfer, generar uno generico
  if (!transfers.length && (type || service || provider)) {
    const fechas = [...text.matchAll(/(\d{1,2}\/\d{1,2}\/\d{2,4})/g)].map(x => x[1]);
    transfers.push({
      type, service, provider,
      from: '', to: '',
      date: fechas.length ? toIsoDate(fechas[0]) : '',
      time: '',
      notes: code ? `Codigo: ${code}` : '',
    });
  }

  return transfers;
}

// ─────────────────────── Seguro ────────────────────────────────────────

function extractInsurance(text) {
  // No tenemos categoria de seguro en el modelo. Lo mapeamos a "otherServices".
  const ins = {
    name: 'Seguro de Viaje',
    description: '',
  };

  let m = text.match(/(?:plan|cobertura|producto)\s*:\s*([^\n]{2,80})/i);
  if (m) ins.name = `Seguro de Viaje - ${clean(m[1])}`;

  // Compania
  const companyMap = [
    /assist\s*card/i, /universal\s+assistance/i, /coris/i, /iati/i,
    /europ\s+assistance/i, /assist\s+travel/i, /travel\s+ace/i,
  ];
  for (const rx of companyMap) {
    const cm = text.match(rx);
    if (cm) { ins.name = `Seguro - ${clean(cm[0])}`; break; }
  }

  const code = extractReservationCode(text);
  const { from, to } = extractDateRange(text);
  m = text.match(/(?:asegurado|titular|nombre)\s*:?\s*([A-ZÁÉÍÓÚÑ][^\n]{4,60})/i);
  const insured = m ? clean(m[1]) : '';

  const parts = [];
  if (code) parts.push(`Poliza: ${code}`);
  if (insured) parts.push(`Asegurado: ${insured}`);
  if (from || to) parts.push(`Vigencia: ${from || '?'} al ${to || '?'}`);
  m = text.match(/cobertura\s+(?:m[eé]dica|total|m[aá]xima)\s*:?\s*([^\n]{2,60})/i);
  if (m) parts.push(`Cobertura: ${clean(m[1])}`);

  ins.description = parts.join(' / ');
  return [ins];
}

// ─────────────────────── Orquestador ──────────────────────────────────

/**
 * @param {Buffer|string} input        buffer, dataURL o base64
 * @param {Object}        opts
 * @param {string}        opts.mimeType
 * @param {string}        opts.fileName
 * @param {string}        opts.hintType  'hotel'|'flight'|'transfer'|'insurance'|'auto'
 */
async function parseVoucher(input, opts = {}) {
  const buf = toBuf(input);
  if (!buf) throw new Error('No se pudo decodificar el archivo');

  const { text, source } = await extractText(buf, opts.mimeType, opts.fileName);
  if (!text || text.trim().length < 20) {
    return {
      ok: false,
      type: 'unknown',
      source,
      reason: 'No se pudo extraer texto del archivo',
      data: {},
      rawTextSnippet: text.slice(0, 500),
    };
  }

  let type = opts.hintType && opts.hintType !== 'auto' ? opts.hintType : detectType(text);

  // Extraer pasajeros (siempre intentar, util para cualquier tipo)
  const passengers = extractPassengers(text);

  const result = {
    ok: true,
    type,
    autoDetected: !opts.hintType || opts.hintType === 'auto',
    source,
    data: { passengers },
    rawTextSnippet: text.slice(0, 1500),
  };

  if (type === 'hotel') {
    result.data.hotels = [extractHotel(text)];
  } else if (type === 'flight') {
    result.data.flights = extractFlights(text);
  } else if (type === 'transfer') {
    result.data.transfers = extractTransfers(text);
  } else if (type === 'insurance') {
    result.data.otherServices = extractInsurance(text);
  } else {
    // Tipo desconocido: probamos todos y devolvemos lo que encontremos
    result.data.hotels = [extractHotel(text)];
    result.data.flights = extractFlights(text);
    result.data.transfers = extractTransfers(text);
  }

  // Limpiar arrays con items vacios
  for (const k of ['hotels', 'flights', 'transfers', 'otherServices']) {
    if (Array.isArray(result.data[k])) {
      result.data[k] = result.data[k].filter(item => {
        return Object.values(item).some(v => v !== '' && v != null);
      });
      if (result.data[k].length === 0) delete result.data[k];
    }
  }
  if (result.data.passengers && result.data.passengers.length === 0) {
    delete result.data.passengers;
  }

  return result;
}

module.exports = {
  parseVoucher,
  // Exports para test
  _extractText: extractText,
  _detectType: detectType,
  _extractPassengers: extractPassengers,
  _extractHotel: extractHotel,
  _extractFlights: extractFlights,
  _extractTransfers: extractTransfers,
  _extractInsurance: extractInsurance,
};
