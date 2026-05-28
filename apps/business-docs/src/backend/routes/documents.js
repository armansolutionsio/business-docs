'use strict';

const express = require('express');
const router = express.Router();
const DocumentRenderer = require('../utils/documentRenderer');
const log = require('../utils/logger');
const { branding } = require('@arman/sdk');
const db = require('../utils/db');
const { logAudit } = require('../utils/auditLog');
const { allocateNextNumber } = require('../utils/docNumbering');

function computeTotals(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  const subtotal = items.reduce((sum, item) => {
    return sum + (parseFloat(item.quantity || 1) * parseFloat(item.price || 0));
  }, 0);
  const discount = parseFloat(data.discount || 0);
  const taxableBase = subtotal - discount;
  const ivaRate = parseFloat(data.ivaRate !== undefined ? data.ivaRate : 0);
  const iva = Math.round(taxableBase * ivaRate * 100) / 100;
  const otherTaxes = parseFloat(data.otherTaxes || 0);
  const total = taxableBase + iva + otherTaxes;
  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    discount: parseFloat(discount.toFixed(2)),
    taxableBase: parseFloat(taxableBase.toFixed(2)),
    iva: parseFloat(iva.toFixed(2)),
    ivaRate: parseFloat((ivaRate * 100).toFixed(2)),
    otherTaxes: parseFloat(otherTaxes.toFixed(2)),
    total: parseFloat(total.toFixed(2)),
  };
}

// Totales para Cotizador (tech): respeta los importes ya pre-calculados desde el frontend
// (subtotal por rubro, contingencia, margen, descuento, IVA, otros) y los expone con la
// misma forma que computeTotals, sumando los detalles para el template.
function computeTechTotals(data) {
  const t = (data.techDetails && data.techDetails.totals) || {};
  const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
  return {
    subtotal: round2(t.subtotal),
    sumHours: round2(t.sumHours),
    sumInfra: round2(t.sumInfra),
    sumLicenses: round2(t.sumLicenses),
    sumCredentials: round2(t.sumCredentials),
    sumOthers: round2(t.sumOthers),
    contingencyAmt: round2(t.contingencyAmt),
    contingencyPct: round2(t.contingencyPct),
    marginAmt: round2(t.marginAmt),
    marginPct: round2(t.marginPct),
    discount: round2(t.discountAmt),
    discountPct: round2(t.discountPct),
    taxableBase: round2(t.taxableBase),
    iva: round2(t.ivaAmt),
    ivaRate: round2(t.ivaPct),
    otherTaxes: round2(t.otherTaxesAmt),
    otherTaxesPct: round2(t.otherTaxesPct),
    total: round2(t.grand),
  };
}

function injectBranding(data) {
  const normalized = { ...data };
  // Normalizar "A confirmar" (el usuario puede escribirlo en minúscula)
  const dt = (normalized.deliveryTerm || '').trim();
  if (!dt || /^a\s*confirmar$/i.test(dt)) {
    normalized.deliveryTerm = 'A confirmar';
  }
  return {
    companyName: data.companyName || branding.company.name,
    companyCUIT: data.companyCUIT || branding.company.cuit,
    companyAddress: data.companyAddress || branding.company.address,
    companyEmail: data.companyEmail || branding.company.email,
    companyPhone: data.companyPhone || branding.company.phone,
    companyIVACondition: data.companyIVACondition || branding.company.ivaCondition,
    brandPrimary: branding.colors.primary,
    brandPrimaryDark: branding.colors.primaryDark,
    ...normalized,
  };
}

/**
 * Find or create contacto from document data, then register the document in our DB.
 */
async function registerInDB({ type, data, totals, req }) {
  const refs = {};

  try {
    // 1. Find or create contacto — use _contactoId if frontend already resolved it
    const docNum = (data.clientCUIT || data.clientDNI || data.payerCUIT || '').trim();
    const clientName = data.clientName || data.payerName || null;
    let contactoId = data._contactoId ? parseInt(data._contactoId) : null;

    // Structured address fields from cotizador
    const addr = {
      domicilio: data.clientDomicilio || data.payerAddress || '',
      localidad: data.clientLocalidad || '',
      provincia: data.clientProvincia || '',
      codigo_postal: data.clientCodigoPostal || '',
    };

    // Verify the provided contactoId exists
    if (contactoId) {
      const check = await db.query('SELECT id FROM contactos WHERE id = $1', [contactoId]);
      if (!check.rows.length) contactoId = null;
    }

    if (!contactoId && docNum) {
      const existing = await db.query('SELECT id FROM contactos WHERE cuit = $1 OR dni = $1 LIMIT 1', [docNum]);
      if (existing.rows.length) {
        contactoId = existing.rows[0].id;
      } else if (clientName) {
        const docField = docNum.replace(/\D/g,'').length === 11 ? 'cuit' : 'dni';
        const ins = await db.query(
          `INSERT INTO contactos (nombre, ${docField}, email, telefono, domicilio, localidad, provincia, codigo_postal, rol_actual, estado, origen)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'lead', 'cotizado', 'cotizador') RETURNING id`,
          [clientName, docNum, data.clientEmail || data.payerEmail || '', data.clientPhone || data.payerPhone || '',
           addr.domicilio, addr.localidad, addr.provincia, addr.codigo_postal]
        );
        contactoId = ins.rows[0].id;
      }
    } else if (clientName) {
      // Try match by name + phone
      const phoneMatch = data.clientPhone || data.payerPhone;
      if (phoneMatch) {
        const existing = await db.query('SELECT id FROM contactos WHERE telefono = $1 LIMIT 1', [phoneMatch]);
        if (existing.rows.length) contactoId = existing.rows[0].id;
      }
      if (!contactoId) {
        const ins = await db.query(
          `INSERT INTO contactos (nombre, email, telefono, domicilio, localidad, provincia, codigo_postal, rol_actual, estado, origen)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'lead', 'cotizado', 'cotizador') RETURNING id`,
          [clientName, data.clientEmail || '', data.clientPhone || '',
           addr.domicilio, addr.localidad, addr.provincia, addr.codigo_postal]
        );
        contactoId = ins.rows[0].id;
      }
    }

    refs.contactoId = contactoId;
    if (!contactoId) return refs;

    // Update contact with latest data (address fields, interaction timestamp)
    const updateParts = ['fecha_ultima_interaccion = NOW()', 'updated_at = NOW()'];
    const updateParams = [contactoId];
    let paramIdx = 2;
    if (addr.domicilio)      { updateParts.push(`domicilio = COALESCE(NULLIF($${paramIdx}, ''), domicilio)`);      updateParams.push(addr.domicilio);      paramIdx++; }
    if (addr.localidad)      { updateParts.push(`localidad = COALESCE(NULLIF($${paramIdx}, ''), localidad)`);      updateParams.push(addr.localidad);      paramIdx++; }
    if (addr.provincia)      { updateParts.push(`provincia = COALESCE(NULLIF($${paramIdx}, ''), provincia)`);      updateParams.push(addr.provincia);      paramIdx++; }
    if (addr.codigo_postal)  { updateParts.push(`codigo_postal = COALESCE(NULLIF($${paramIdx}, ''), codigo_postal)`); updateParams.push(addr.codigo_postal); paramIdx++; }
    await db.query(`UPDATE contactos SET ${updateParts.join(', ')} WHERE id = $1`, updateParams);

    // 2. Register document
    const items = Array.isArray(data.items) ? data.items : [];
    const moneda = data.currency || 'ARS';
    const createdBy = data._user || 'cotizador';

    const clienteSnapshot = {
      nombre: data.clientName || data.payerName || '',
      cuit: data.clientCUIT || data.payerCUIT || '',
      email: data.clientEmail || data.payerEmail || '',
      telefono: data.clientPhone || data.payerPhone || '',
      domicilio: addr.domicilio,
      localidad: addr.localidad,
      provincia: addr.provincia,
      codigo_postal: addr.codigo_postal,
    };

    if (type === 'quote' || type === 'quote-tech') {
      const detalleExtra = type === 'quote-tech'
        ? { kind: 'tech', tech: data.techDetails || null }
        : (data.categoryDetails || null);

      const inserted = await allocateNextNumber('cotizaciones', async (client, numero) => {
        const cot = await client.query(
          `INSERT INTO cotizaciones (contacto_id, numero, fecha, validez_dias, moneda, subtotal, impuestos, total, estado, notas, detalle_categorias, cliente_snapshot, created_by)
           VALUES ($1,$2,CURRENT_DATE,$3,$4,$5,$6,$7,'enviada',$8,$9,$10,$11) RETURNING *`,
          [contactoId, numero, data.validityDays || data.validity || 15, moneda, totals.subtotal, totals.iva, totals.total,
           data.notes || null,
           detalleExtra ? JSON.stringify(detalleExtra) : null,
           JSON.stringify(clienteSnapshot),
           createdBy]
        );
        for (const item of items) {
          await client.query(
            `INSERT INTO cotizacion_items (cotizacion_id, descripcion, cantidad, precio_unitario, subtotal)
             VALUES ($1, $2, $3, $4, $5)`,
            [cot.rows[0].id, item.description || '', item.quantity || 1, item.price || 0,
             (parseFloat(item.quantity || 1) * parseFloat(item.price || 0))]
          );
        }
        return { id: cot.rows[0].id, numero };
      });
      refs.cotizacionId = inserted.id;
      refs.docNumber = inserted.numero;

      // Advance estado to 'cotizado' if still in early funnel stages
      await db.query(`UPDATE contactos SET estado = CASE WHEN estado IN ('nuevo', 'contactado', 'calificado') THEN 'cotizado' ELSE estado END, fecha_ultima_interaccion = NOW(), updated_at = NOW() WHERE id = $1`, [contactoId]);
      await logAudit({ tabla: 'cotizaciones', registro_id: refs.cotizacionId, accion: 'INSERT', usuario: createdBy });

    } else if (type === 'invoice') {
      const inserted = await allocateNextNumber('facturas', async (client, numero) => {
        const fac = await client.query(
          `INSERT INTO facturas (contacto_id, numero, tipo, fecha, moneda, subtotal, iva, total, estado, created_by)
           VALUES ($1,$2,$3,CURRENT_DATE,$4,$5,$6,$7,'emitida',$8) RETURNING *`,
          [contactoId, numero, data.invoiceLetter || 'B', moneda, totals.subtotal, totals.iva, totals.total, createdBy]
        );
        for (const item of items) {
          await client.query(
            `INSERT INTO factura_items (factura_id, descripcion, cantidad, precio_unitario, subtotal)
             VALUES ($1, $2, $3, $4, $5)`,
            [fac.rows[0].id, item.description || '', item.quantity || 1, item.price || 0,
             (parseFloat(item.quantity || 1) * parseFloat(item.price || 0))]
          );
        }
        return { id: fac.rows[0].id, numero };
      });
      refs.facturaId = inserted.id;
      refs.docNumber = inserted.numero;

      await db.query(`UPDATE contactos SET rol_actual = 'cliente', estado = 'ganado', updated_at = NOW() WHERE id = $1 AND rol_actual IN ('lead','contacto')`, [contactoId]);
      await logAudit({ tabla: 'facturas', registro_id: refs.facturaId, accion: 'INSERT', usuario: createdBy });

    } else if (type === 'receipt') {
      const montoRecibo = parseFloat(data.amount || totals.total || 0);
      const inserted = await allocateNextNumber('recibos', async (client, numero) => {
        const rec = await client.query(
          `INSERT INTO recibos (contacto_id, numero, fecha, monto, medio_pago, notas, moneda, concepto, cliente_snapshot, created_by)
           VALUES ($1,$2,CURRENT_DATE,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [contactoId, numero, montoRecibo, data.paymentMethod || null, data.concept || null,
           moneda, data.concept || null, JSON.stringify(clienteSnapshot), createdBy]
        );
        await client.query(
          `INSERT INTO pagos (contacto_id, monto, fecha, medio, referencia, created_by)
           VALUES ($1,$2,CURRENT_DATE,$3,$4,$5)`,
          [contactoId, montoRecibo, data.paymentMethod || null, numero, createdBy]
        );
        return { id: rec.rows[0].id, numero };
      });
      refs.reciboId = inserted.id;
      refs.docNumber = inserted.numero;

      await logAudit({ tabla: 'recibos', registro_id: refs.reciboId, accion: 'INSERT', usuario: createdBy });
    }

    log.info(req, 'db_registered', { contacto_id: contactoId, type, doc_number: refs.docNumber });
  } catch (err) {
    log.warn(req, 'db_registration_error', { error: err.message });
  }

  return refs;
}

function formatDocNumber(type, num) {
  const prefixes = { quote: 'COT', invoice: 'FAC', receipt: 'REC' };
  const prefix = prefixes[type] || type.toUpperCase().slice(0, 3);
  return `${prefix}-${String(num).padStart(4, '0')}`;
}

router.post('/generate-pdf', async (req, res) => {
  const startTime = Date.now();
  try {
    const { type, data: rawData, assets, landscape } = req.body;

    if (!type || !rawData) {
      return res.status(400).json({ error: 'Missing required fields: type, data' });
    }

    const data = injectBranding(rawData);
    // Voucher: pasa directo al renderer, sin totales ni registro en DB
    if (type === 'voucher') {
      const currencyMap = { USD: 'USD', ARS: '$', EUR: 'EUR', BRL: 'R$' };
      const currencyCode = data.currency || 'USD';
      data.currencySymbol = currencyMap[currencyCode] || currencyCode;
      // Calcular saldo si no vino explicito
      const t = parseFloat(data.total) || 0;
      const d = parseFloat(data.deposit) || 0;
      if (t > 0 && (data.balance === undefined || data.balance === '' || data.balance === null)) {
        data.balance = Math.max(0, t - d);
      }
      // Flags para mostrar secciones cuando hay datos
      data.hasTripInfo = !!(data.destination || data.tripStart || data.tripEnd || data.duration || data.tripDescription);
      data.hasPaymentInfo = !!(t || d || data.balance || data.paymentDueDate || data.paymentMethod || data.paymentNotes);
      // passengerCount: si no vino, usar length
      if (!data.passengerCount && Array.isArray(data.passengers)) {
        data.passengerCount = data.passengers.length;
      }
      const buffer = await DocumentRenderer.render({
        type, format: 'pdf', data, assets: assets || {}, landscape: landscape || false,
      });
      log.info(req, 'pdf_ok', {
        doc_type: type,
        client: data.holderName || 'Sin titular',
        doc_number: data.voucherNumber,
        size_kb: parseFloat((buffer.length / 1024).toFixed(2)),
        ms: Date.now() - startTime,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=voucher_${Date.now()}.pdf`);
      return res.send(buffer);
    }
    const totals = type === 'quote-tech' ? computeTechTotals(data) : computeTotals(data);

    // DEBUG: log pack data to find rendering issue
    if (data.categoryDetails && data.categoryDetails.packs) {
      console.log('[PDF Debug] Packs received:', JSON.stringify(data.categoryDetails.packs.map(p => ({
        name: p.packName,
        subItemCount: (p.subItems || []).length,
        subItemTypes: (p.subItems || []).map(s => s._serviceType || 'NO_TYPE'),
      })), null, 2));
    }

    const clientName = data.clientName || data.payerName || 'Sin nombre';
    const docNumber = data.invoiceNumber || data.receiptNumber || data.quoteNumber || 'Sin número';

    log.info(req, 'pdf_start', {
      doc_type: type, client: clientName, doc_number: docNumber,
      landscape: !!landscape,
    });

    // Register in our DB (non-fatal) — skip if already confirmed from frontend
    const dbRefs = data._skipDbRegistration ? {} : await registerInDB({ type, data, totals, req });

    // Currency symbol for template
    const currencyMap = { USD: 'USD', ARS: '$', EUR: 'EUR' };
    const currencyCode = data.currency || 'USD';
    const currencySymbol = currencyMap[currencyCode] || currencyCode;

    const enrichedData = {
      ...data,
      subtotal: totals.subtotal,
      discount: totals.discount,
      taxableBase: totals.taxableBase,
      iva: totals.iva,
      ivaRate: totals.ivaRate,
      otherTaxes: totals.otherTaxes,
      total: totals.total,
      currencySymbol,
      // Campos extra para quote-tech (no rompen otros tipos)
      sumHours: totals.sumHours || 0,
      sumInfra: totals.sumInfra || 0,
      sumLicenses: totals.sumLicenses || 0,
      sumCredentials: totals.sumCredentials || 0,
      sumOthers: totals.sumOthers || 0,
      contingencyAmt: totals.contingencyAmt || 0,
      contingencyPct: totals.contingencyPct || 0,
      marginAmt: totals.marginAmt || 0,
      marginPct: totals.marginPct || 0,
      discountPct: totals.discountPct || 0,
      otherTaxesPct: totals.otherTaxesPct || 0,
    };

    // Override doc number with our DB number (excepto quote-tech, que usa numeración local)
    if (dbRefs.docNumber) {
      if (type === 'quote') enrichedData.quoteNumber = dbRefs.docNumber;
      else if (type === 'invoice') enrichedData.invoiceNumber = dbRefs.docNumber;
      else if (type === 'receipt') enrichedData.receiptNumber = dbRefs.docNumber;
    }
    // Para cotizador tech preservamos el número del frontend y guardamos el DB-alloc en metadata
    if (type === 'quote-tech') {
      enrichedData._dbDocNumber = dbRefs.docNumber || null;
    }

    let processAssets = { ...assets };
    if (enrichedData.images && typeof enrichedData.images === 'object') {
      processAssets.images = enrichedData.images;
    }
    if (enrichedData.categoryImages && typeof enrichedData.categoryImages === 'object') {
      processAssets.categoryImages = enrichedData.categoryImages;
    }

    const buffer = await DocumentRenderer.render({
      type, format: 'pdf', data: enrichedData,
      assets: processAssets, landscape: landscape || false,
    });

    log.info(req, 'pdf_ok', {
      doc_type: type, client: clientName,
      doc_number: enrichedData.quoteNumber || enrichedData.invoiceNumber || enrichedData.receiptNumber,
      size_kb: parseFloat((buffer.length / 1024).toFixed(2)), ms: Date.now() - startTime,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${type}_${Date.now()}.pdf`);
    if (dbRefs.contactoId) res.setHeader('X-Contacto-Id', dbRefs.contactoId);
    if (dbRefs.cotizacionId) res.setHeader('X-Cotizacion-Id', dbRefs.cotizacionId);
    if (dbRefs.facturaId) res.setHeader('X-Factura-Id', dbRefs.facturaId);
    if (dbRefs.reciboId) res.setHeader('X-Recibo-Id', dbRefs.reciboId);
    res.send(buffer);
  } catch (error) {
    log.error(req, 'pdf_error', { error: error.message, ms: Date.now() - startTime });
    res.status(500).json({ error: error.message });
  }
});

router.post('/generate-word', async (req, res) => {
  try {
    const { type, data: rawData, assets } = req.body;
    if (!type || !rawData) {
      return res.status(400).json({ error: 'Missing required fields: type, data' });
    }
    const data = injectBranding(rawData);
    const totals = computeTotals(data);
    const enrichedData = { ...data, ...totals };
    const buffer = await DocumentRenderer.render({ type, format: 'word', data: enrichedData, assets });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename=${type}_${Date.now()}.docx`);
    res.send(buffer);
  } catch (error) {
    log.error(req, 'word_error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router._computeTotals = computeTotals;
router._injectBranding = injectBranding;
router._formatDocNumber = formatDocNumber;

module.exports = router;
