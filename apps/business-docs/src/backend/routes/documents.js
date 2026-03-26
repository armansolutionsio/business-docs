'use strict';

const express = require('express');
const router = express.Router();
const DocumentRenderer = require('../utils/documentRenderer');
const log = require('../utils/logger');
const { branding } = require('@arman/sdk');
const db = require('../utils/db');
const { logAudit } = require('../utils/auditLog');

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

/**
 * Find or create contacto from document data, then register the document in our DB.
 */
async function registerInDB({ type, data, totals, req }) {
  const refs = {};

  try {
    // 1. Find or create contacto
    const docNum = (data.clientCUIT || data.clientDNI || data.payerCUIT || '').trim();
    const clientName = data.clientName || data.payerName || null;
    let contactoId = null;

    if (docNum) {
      const existing = await db.query('SELECT id FROM contactos WHERE cuit = $1 OR dni = $1 LIMIT 1', [docNum]);
      if (existing.rows.length) {
        contactoId = existing.rows[0].id;
      } else if (clientName) {
        const ins = await db.query(
          `INSERT INTO contactos (nombre, ${docNum.replace(/\D/g,'').length === 11 ? 'cuit' : 'dni'}, email, telefono, rol_actual, estado, origen)
           VALUES ($1, $2, $3, $4, 'lead', 'nuevo', 'cotizador') RETURNING id`,
          [clientName, docNum, data.clientEmail || data.payerEmail || '', data.clientPhone || data.payerPhone || '']
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
          `INSERT INTO contactos (nombre, email, telefono, rol_actual, estado, origen) VALUES ($1, $2, $3, 'lead', 'nuevo', 'cotizador') RETURNING id`,
          [clientName, data.clientEmail || '', data.clientPhone || '']
        );
        contactoId = ins.rows[0].id;
      }
    }

    refs.contactoId = contactoId;
    if (!contactoId) return refs;

    // Update last interaction
    await db.query('UPDATE contactos SET fecha_ultima_interaccion = NOW(), updated_at = NOW() WHERE id = $1', [contactoId]);

    // 2. Register document
    const items = Array.isArray(data.items) ? data.items : [];
    const moneda = data.currency || 'ARS';
    const createdBy = data._user || 'cotizador';

    if (type === 'quote') {
      // Generate correlative number per contact: COT-{contactoId}-{seq}
      const countRes = await db.query('SELECT COUNT(*) FROM cotizaciones WHERE contacto_id = $1', [contactoId]);
      const seq = parseInt(countRes.rows[0].count, 10) + 1;
      const numero = `COT-${String(contactoId).padStart(4, '0')}-${String(seq).padStart(2, '0')}`;

      const cot = await db.query(
        `INSERT INTO cotizaciones (contacto_id, numero, fecha, validez_dias, moneda, subtotal, impuestos, total, estado, notas, created_by)
         VALUES ($1,$2,CURRENT_DATE,$3,$4,$5,$6,$7,'enviada',$8,$9) RETURNING *`,
        [contactoId, numero, data.validityDays || 15, moneda, totals.subtotal, totals.iva, totals.total, data.notes || null, createdBy]
      );
      refs.cotizacionId = cot.rows[0].id;
      refs.docNumber = numero;

      for (const item of items) {
        await db.query(
          `INSERT INTO cotizacion_items (cotizacion_id, descripcion, cantidad, precio_unitario, subtotal)
           VALUES ($1, $2, $3, $4, $5)`,
          [refs.cotizacionId, item.description || '', item.quantity || 1, item.price || 0,
           (parseFloat(item.quantity || 1) * parseFloat(item.price || 0))]
        );
      }

      // Update contacto estado if still nuevo
      await db.query(`UPDATE contactos SET estado = 'cotizado', updated_at = NOW() WHERE id = $1 AND estado IN ('nuevo','contactado','en_seguimiento')`, [contactoId]);
      await logAudit({ tabla: 'cotizaciones', registro_id: refs.cotizacionId, accion: 'INSERT', usuario: createdBy });

    } else if (type === 'invoice') {
      const countRes = await db.query('SELECT COUNT(*) FROM facturas');
      const num = parseInt(countRes.rows[0].count, 10) + 1;
      const numero = `FAC-${String(num).padStart(4, '0')}`;

      const fac = await db.query(
        `INSERT INTO facturas (contacto_id, numero, tipo, fecha, moneda, subtotal, iva, total, estado, created_by)
         VALUES ($1,$2,$3,CURRENT_DATE,$4,$5,$6,$7,'emitida',$8) RETURNING *`,
        [contactoId, numero, data.invoiceLetter || 'B', moneda, totals.subtotal, totals.iva, totals.total, createdBy]
      );
      refs.facturaId = fac.rows[0].id;
      refs.docNumber = numero;

      for (const item of items) {
        await db.query(
          `INSERT INTO factura_items (factura_id, descripcion, cantidad, precio_unitario, subtotal)
           VALUES ($1, $2, $3, $4, $5)`,
          [refs.facturaId, item.description || '', item.quantity || 1, item.price || 0,
           (parseFloat(item.quantity || 1) * parseFloat(item.price || 0))]
        );
      }

      await db.query(`UPDATE contactos SET rol_actual = 'cliente', estado = 'ganado', updated_at = NOW() WHERE id = $1 AND rol_actual IN ('lead','contacto')`, [contactoId]);
      await logAudit({ tabla: 'facturas', registro_id: refs.facturaId, accion: 'INSERT', usuario: createdBy });

    } else if (type === 'receipt') {
      const countRes = await db.query('SELECT COUNT(*) FROM recibos');
      const num = parseInt(countRes.rows[0].count, 10) + 1;
      const numero = `REC-${String(num).padStart(4, '0')}`;

      const rec = await db.query(
        `INSERT INTO recibos (contacto_id, numero, fecha, monto, medio_pago, notas, created_by)
         VALUES ($1,$2,CURRENT_DATE,$3,$4,$5,$6) RETURNING *`,
        [contactoId, numero, totals.total, data.paymentMethod || null, data.concept || null, createdBy]
      );
      refs.reciboId = rec.rows[0].id;
      refs.docNumber = numero;

      // Register payment
      await db.query(
        `INSERT INTO pagos (contacto_id, monto, fecha, medio, referencia, created_by)
         VALUES ($1,$2,CURRENT_DATE,$3,$4,$5)`,
        [contactoId, totals.total, data.paymentMethod || null, numero, createdBy]
      );

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
    const totals = computeTotals(data);

    const clientName = data.clientName || data.payerName || 'Sin nombre';
    const docNumber = data.invoiceNumber || data.receiptNumber || data.quoteNumber || 'Sin número';

    log.info(req, 'pdf_start', {
      doc_type: type, client: clientName, doc_number: docNumber,
      landscape: !!landscape,
    });

    // Register in our DB (non-fatal)
    const dbRefs = await registerInDB({ type, data, totals, req });

    const enrichedData = {
      ...data,
      subtotal: totals.subtotal,
      discount: totals.discount,
      taxableBase: totals.taxableBase,
      iva: totals.iva,
      ivaRate: totals.ivaRate,
      otherTaxes: totals.otherTaxes,
      total: totals.total,
    };

    // Override doc number with our DB number
    if (dbRefs.docNumber) {
      if (type === 'quote') enrichedData.quoteNumber = dbRefs.docNumber;
      else if (type === 'invoice') enrichedData.invoiceNumber = dbRefs.docNumber;
      else if (type === 'receipt') enrichedData.receiptNumber = dbRefs.docNumber;
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
