'use strict';

/**
 * Renderiza documentos ya guardados en la BD (cotizaciones, recibos) a PDF,
 * reconstruyendo el data object esperado por DocumentRenderer a partir del
 * cliente_snapshot, items y detalle_categorias persistidos.
 */

const db = require('./db');
const DocumentRenderer = require('./documentRenderer');
const { branding } = require('@arman/sdk');

function injectBranding(data) {
  return {
    companyName: data.companyName || branding.company.name,
    companyCUIT: data.companyCUIT || branding.company.cuit,
    companyAddress: data.companyAddress || branding.company.address,
    companyEmail: data.companyEmail || branding.company.email,
    companyPhone: data.companyPhone || branding.company.phone,
    companyIVACondition: data.companyIVACondition || branding.company.ivaCondition,
    brandPrimary: branding.colors.primary,
    brandPrimaryDark: branding.colors.primaryDark,
    ...data,
  };
}

function currencySymbol(code) {
  const map = { USD: 'USD', ARS: '$', EUR: 'EUR', BRL: 'R$' };
  return map[code] || code || 'ARS';
}

async function loadContactoForDoc(contactoId) {
  if (!contactoId) return {};
  const { rows } = await db.query('SELECT * FROM contactos WHERE id = $1', [contactoId]);
  return rows[0] || {};
}

function pickClientFields(snapshot, contacto) {
  const s = snapshot || {};
  const c = contacto || {};
  return {
    clientName: s.nombre || c.razon_social || c.nombre || '',
    clientCUIT: s.cuit || c.cuit || c.dni || '',
    clientEmail: s.email || c.email || '',
    clientPhone: s.telefono || c.telefono || '',
    clientDomicilio: s.domicilio || c.domicilio || '',
    clientLocalidad: s.localidad || c.localidad || '',
    clientProvincia: s.provincia || c.provincia || '',
    clientCodigoPostal: s.codigo_postal || c.codigo_postal || '',
  };
}

async function renderStoredQuote(cotizacionId) {
  const { rows } = await db.query('SELECT * FROM cotizaciones WHERE id = $1', [cotizacionId]);
  if (!rows.length) throw new Error('Cotizacion no encontrada');
  const cot = rows[0];

  const { rows: items } = await db.query(
    `SELECT descripcion, cantidad, precio_unitario, subtotal
     FROM cotizacion_items WHERE cotizacion_id = $1 ORDER BY id`, [cotizacionId]
  );

  const contacto = await loadContactoForDoc(cot.contacto_id);
  const clientFields = pickClientFields(cot.cliente_snapshot, contacto);

  const data = injectBranding({
    ...clientFields,
    quoteNumber: cot.numero,
    quoteDate: cot.fecha,
    validityDays: cot.validez_dias || 15,
    currency: cot.moneda || 'ARS',
    currencySymbol: currencySymbol(cot.moneda),
    items: items.map(it => ({
      description: it.descripcion,
      quantity: parseFloat(it.cantidad || 1),
      price: parseFloat(it.precio_unitario || 0),
    })),
    subtotal: parseFloat(cot.subtotal || 0),
    iva: parseFloat(cot.impuestos || 0),
    total: parseFloat(cot.total || 0),
    ivaRate: 0,
    discount: 0,
    taxableBase: parseFloat(cot.subtotal || 0),
    otherTaxes: 0,
    notes: cot.notas || '',
    categoryDetails: cot.detalle_categorias || null,
  });

  // Si es quote-tech (kind=tech) usamos template específico
  const isTech = data.categoryDetails && data.categoryDetails.kind === 'tech';
  const type = isTech ? 'quote-tech' : 'quote';

  const pdf = await DocumentRenderer.render({ type, format: 'pdf', data, assets: {} });
  return { buffer: pdf, filename: `cotizacion_${cot.numero || cot.id}.pdf`, numero: cot.numero };
}

async function renderStoredReceipt(reciboId) {
  const { rows } = await db.query('SELECT * FROM recibos WHERE id = $1', [reciboId]);
  if (!rows.length) throw new Error('Recibo no encontrado');
  const rec = rows[0];

  const contacto = await loadContactoForDoc(rec.contacto_id);
  const clientFields = pickClientFields(rec.cliente_snapshot, contacto);

  const data = injectBranding({
    ...clientFields,
    payerName: clientFields.clientName,
    payerCUIT: clientFields.clientCUIT,
    payerEmail: clientFields.clientEmail,
    payerPhone: clientFields.clientPhone,
    payerAddress: clientFields.clientDomicilio,
    receiptNumber: rec.numero,
    receiptDate: rec.fecha,
    amount: parseFloat(rec.monto || 0),
    total: parseFloat(rec.monto || 0),
    subtotal: parseFloat(rec.monto || 0),
    iva: 0, ivaRate: 0, discount: 0,
    taxableBase: parseFloat(rec.monto || 0),
    otherTaxes: 0,
    currency: rec.moneda || 'ARS',
    currencySymbol: currencySymbol(rec.moneda),
    paymentMethod: rec.medio_pago || '',
    concept: rec.concepto || rec.notas || '',
    items: [{
      description: rec.concepto || rec.notas || 'Pago recibido',
      quantity: 1,
      price: parseFloat(rec.monto || 0),
    }],
  });

  const pdf = await DocumentRenderer.render({ type: 'receipt', format: 'pdf', data, assets: {} });
  return { buffer: pdf, filename: `recibo_${rec.numero || rec.id}.pdf`, numero: rec.numero };
}

/**
 * Lista documentos adjuntables (cotizaciones + recibos) para un contacto.
 * Excluye los borrados/anulados.
 */
async function listAttachableDocs(contactoId) {
  const { rows: cotizaciones } = await db.query(
    `SELECT id, numero, fecha, total, moneda, estado, created_at
     FROM cotizaciones
     WHERE contacto_id = $1 AND (estado IS NULL OR estado NOT IN ('borrado','anulada'))
     ORDER BY created_at DESC LIMIT 50`, [contactoId]
  );
  const { rows: recibos } = await db.query(
    `SELECT id, numero, fecha, monto AS total, moneda, estado, medio_pago, concepto, created_at
     FROM recibos
     WHERE contacto_id = $1 AND (estado IS NULL OR estado NOT IN ('borrado','anulado'))
     ORDER BY created_at DESC LIMIT 50`, [contactoId]
  );
  return {
    cotizaciones: cotizaciones.map(r => ({ ...r, tipo: 'cotizacion' })),
    recibos: recibos.map(r => ({ ...r, tipo: 'recibo' })),
  };
}

module.exports = { renderStoredQuote, renderStoredReceipt, listAttachableDocs };
