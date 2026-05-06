// ARCA / AFIP mock client.
// Simula wsfev1 (Factura Electrónica) con credenciales ficticias.
// Cuando llegue el momento de producción, reemplazar este módulo por
// uno que firme un TRA con WSAA y consuma WSFEv1 real, manteniendo la
// misma firma de funciones.

const crypto = require('crypto');

const CONFIG = {
  cuit:        process.env.ARCA_CUIT        || '20999999991',
  certPath:    process.env.ARCA_CERT_PATH   || '/mock/cert.pem',
  keyPath:     process.env.ARCA_KEY_PATH    || '/mock/key.pem',
  ambiente:    process.env.ARCA_AMBIENTE    || 'homologacion', // homologacion | produccion
  endpoint:    process.env.ARCA_ENDPOINT    || 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  puntoVenta:  parseInt(process.env.ARCA_PUNTO_VENTA || '1', 10),
  mock:        (process.env.ARCA_MOCK || 'true') === 'true',
};

const TIPO_COMPROBANTE = {
  A: 1, B: 6, C: 11, M: 51, // facturas
  NC_A: 3, NC_B: 8, NC_C: 13,
  ND_A: 2, ND_B: 7, ND_C: 12,
};

function genCAE() {
  // CAE real = 14 dígitos numéricos
  return crypto.randomBytes(7).toString('hex').replace(/[a-f]/g, (c) => String((c.charCodeAt(0) - 87) % 10)).slice(0, 14).padEnd(14, '0');
}

function genVencimientoCAE() {
  const d = new Date();
  d.setDate(d.getDate() + 10);
  return d.toISOString().slice(0, 10);
}

async function lastAuthorizedNumber(tipo, puntoVenta) {
  // En real: FECompUltimoAutorizado. Mock: random base.
  return Math.floor(1000 + Math.random() * 9000);
}

/**
 * Solicita CAE para un comprobante. Mockeado: devuelve CAE válido sintético.
 * @param {object} payload - { tipo, puntoVenta, concepto, cuitReceptor, total, neto, iva, fecha }
 */
async function solicitarCAE(payload) {
  if (!CONFIG.mock) {
    throw new Error('ARCA real no implementado: setear ARCA_MOCK=true o conectar WSFEv1');
  }
  const tipoCod = TIPO_COMPROBANTE[payload.tipo] || TIPO_COMPROBANTE.B;
  const puntoVenta = payload.puntoVenta || CONFIG.puntoVenta;
  const ultimo = await lastAuthorizedNumber(tipoCod, puntoVenta);
  const numero = ultimo + 1;

  // Simulamos latencia mínima
  await new Promise((r) => setTimeout(r, 80));

  const cae = genCAE();
  const cae_vto = genVencimientoCAE();
  const numero_completo = `${String(puntoVenta).padStart(5, '0')}-${String(numero).padStart(8, '0')}`;

  return {
    ok: true,
    mock: true,
    ambiente: CONFIG.ambiente,
    cuit_emisor: CONFIG.cuit,
    tipo: payload.tipo,
    tipo_cod: tipoCod,
    punto_venta: puntoVenta,
    numero,
    numero_completo,
    cae,
    cae_vencimiento: cae_vto,
    fecha_proceso: new Date().toISOString(),
    qr_payload: buildQRPayload({
      cuit: CONFIG.cuit, ptoVta: puntoVenta, tipoCmp: tipoCod, nroCmp: numero,
      importe: payload.total, fecha: payload.fecha, cae,
      tipoDocRec: payload.tipoDocReceptor || 80,
      nroDocRec: payload.cuitReceptor || 0,
      moneda: payload.moneda || 'PES',
      ctz: payload.cotizacion || 1,
    }),
    raw: { observaciones: [], eventos: [{ Code: 0, Msg: 'mock-ok' }] },
  };
}

function buildQRPayload(d) {
  // Formato JSON ARCA codificado en base64url para QR
  const obj = {
    ver: 1,
    fecha: d.fecha,
    cuit: Number(d.cuit),
    ptoVta: d.ptoVta,
    tipoCmp: d.tipoCmp,
    nroCmp: d.nroCmp,
    importe: Number(d.importe),
    moneda: d.moneda,
    ctz: Number(d.ctz),
    tipoDocRec: d.tipoDocRec,
    nroDocRec: Number(d.nroDocRec),
    tipoCodAut: 'E',
    codAut: Number(d.cae),
  };
  const b64 = Buffer.from(JSON.stringify(obj)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `https://www.afip.gob.ar/fe/qr/?p=${b64}`;
}

async function consultarComprobante({ tipo, puntoVenta, numero }) {
  if (!CONFIG.mock) throw new Error('ARCA real no implementado');
  return {
    ok: true,
    mock: true,
    tipo, puntoVenta, numero,
    estado: 'A', // Aprobado
    cae: genCAE(),
    cae_vencimiento: genVencimientoCAE(),
  };
}

async function ping() {
  return { ok: true, mock: CONFIG.mock, ambiente: CONFIG.ambiente, cuit: CONFIG.cuit };
}

module.exports = { solicitarCAE, consultarComprobante, ping, CONFIG, TIPO_COMPROBANTE };
