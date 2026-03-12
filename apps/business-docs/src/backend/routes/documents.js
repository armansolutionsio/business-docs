'use strict';

const express = require('express');
const router = express.Router();
const DocumentRenderer = require('../utils/documentRenderer');
const log = require('../utils/logger');
const { CoreApiClient, branding } = require('@arman/sdk');

const coreClient = new CoreApiClient();

/**
 * Compute fiscal totals from document items.
 * Returns: subtotal, discount, taxable_base, iva, iva_rate, other_taxes, total
 */
function computeTotals(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  const subtotal = items.reduce((sum, item) => {
    return sum + (parseFloat(item.quantity || 1) * parseFloat(item.price || 0));
  }, 0);

  const discount = parseFloat(data.discount || 0);
  const taxableBase = subtotal - discount;                              // base imponible
  const ivaRate = parseFloat(data.ivaRate !== undefined ? data.ivaRate : 0); // 0 = exento (default para agencias de viaje)
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

/**
 * Inject branding defaults for company fields not provided by the caller.
 * This ensures the PDF always carries Arman Travel branding without hardcoding
 * values in templates — overrides come from env vars via @arman/sdk.
 */
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
 * Derive doc_type for Core from document type string.
 */
function toCoreDocType(type) {
  const map = { quote: 'QUOTE', invoice: 'INVOICE', receipt: 'RECEIPT' };
  return map[type] || type.toUpperCase();
}

/**
 * Detect buyer doc fields in data (clientCUIT, clientDNI, payerCUIT, etc.)
 * Returns { docType, docNumber } or null if not found.
 */
function extractBuyerDoc(data) {
  if (data.clientCUIT && data.clientCUIT.trim()) {
    return { docType: data.clientCUIT.length <= 8 ? 'DNI' : 'CUIT', docNumber: data.clientCUIT.trim() };
  }
  if (data.clientDNI && data.clientDNI.trim()) {
    return { docType: 'DNI', docNumber: data.clientDNI.trim() };
  }
  if (data.payerCUIT && data.payerCUIT.trim()) {
    return { docType: data.payerCUIT.length <= 8 ? 'DNI' : 'CUIT', docNumber: data.payerCUIT.trim() };
  }
  return null;
}

/**
 * Call Core API to register party, lead/sale, and document ref.
 * Returns coreRefs = { partyId, leadId, saleId, docRefId, docNumber }
 * Errors are non-fatal: returns {} on failure (PDF generation continues).
 */
async function registerWithCore({ type, data, totals, idempotencyKey, req }) {
  const buyerDoc = extractBuyerDoc(data);
  if (!buyerDoc) {
    log.info(req, 'core_skip', { reason: 'no buyer doc number in request' });
    return {};
  }

  try {
    // 1. Upsert Party
    const buyerName = data.clientName || data.payerName || null;
    const party = await coreClient.upsertParty({
      docType: buyerDoc.docType,
      docNumber: buyerDoc.docNumber,
      fullName: buyerName,
      email: data.clientEmail || data.payerEmail || null,
      phone: data.clientPhone || data.payerPhone || null,
    });
    const partyId = party.id;
    const refs = { partyId };

    // 2. Create Lead (quotes) or Sale (invoices/receipts)
    if (type === 'quote') {
      const leadKey = idempotencyKey ? `lead-${idempotencyKey}` : null;
      const lead = await coreClient.createLead(
        { partyId, source: 'QUOTE', status: 'NEW', notes: data.quoteNumber ? `Cotización ${data.quoteNumber}` : null },
        leadKey,
      );
      refs.leadId = lead.id;
    } else {
      const saleKey = idempotencyKey ? `sale-${idempotencyKey}` : null;
      const sale = await coreClient.createSale(
        {
          partyId,
          status: type === 'invoice' ? 'CONFIRMED' : 'DRAFT',
          currency: data.currency || 'ARS',
          notes: data.invoiceNumber || data.receiptNumber || null,
        },
        saleKey,
      );
      refs.saleId = sale.id;
    }

    // 3. Create DocumentRef (with idempotency to prevent duplicates)
    const externalRef = data.quoteNumber || data.invoiceNumber || data.receiptNumber || null;
    const docRef = await coreClient.createDocumentRef(
      {
        partyId,
        saleId: refs.saleId || null,
        leadId: refs.leadId || null,
        docType: toCoreDocType(type),
        externalRef,
        totals: {
          subtotal: String(totals.subtotal),
          discount: String(totals.discount),
          taxable_base: String(totals.taxableBase),
          iva: String(totals.iva),
          iva_rate: String(totals.ivaRate),
          other_taxes: String(totals.otherTaxes),
          total: String(totals.total),
        },
      },
      idempotencyKey || null,
    );
    refs.docRefId = docRef.id;
    refs.docNumber = docRef.doc_number;

    log.info(req, 'core_registered', {
      party_id: partyId,
      lead_id: refs.leadId,
      sale_id: refs.saleId,
      doc_ref_id: refs.docRefId,
      doc_number: refs.docNumber,
    });

    return refs;
  } catch (err) {
    log.warn(req, 'core_integration_error', { error: err.message });
    return {};
  }
}

/**
 * Format a correlative doc number with prefix and zero-padding.
 * e.g. type=quote, num=3 → "COT-0003"
 */
function formatDocNumber(type, num) {
  const prefixes = { quote: 'COT', invoice: 'FAC', receipt: 'REC' };
  const prefix = prefixes[type] || type.toUpperCase().slice(0, 3);
  return `${prefix}-${String(num).padStart(4, '0')}`;
}

/**
 * POST /api/documents/generate-pdf
 * Body: { type, data, assets?, landscape? }
 * Headers: Idempotency-Key (optional)
 *
 * Flow:
 *  1. Inject branding defaults into data
 *  2. Compute fiscal totals (subtotal, discount, taxable_base, iva, total)
 *  3. Register with Core API: upsert Party → create Lead/Sale → create DocumentRef
 *  4. Override doc number with correlative from Core (if available)
 *  5. Generate PDF and return it with Core ref IDs in response headers
 */
router.post('/generate-pdf', async (req, res) => {
  const startTime = Date.now();
  try {
    const idempotencyKey = req.headers['idempotency-key'] || null;
    const { type, data: rawData, assets, landscape } = req.body;

    if (!type || !rawData) {
      return res.status(400).json({ error: 'Missing required fields: type, data' });
    }

    // Step 1 — inject branding defaults
    const data = injectBranding(rawData);

    // Step 2 — compute fiscal totals
    const totals = computeTotals(data);

    const docTypeNames = { invoice: 'Factura', receipt: 'Recibo', quote: 'Cotización' };
    const clientName = data.clientName || data.payerName || 'Sin nombre';
    const docNumber = data.invoiceNumber || data.receiptNumber || data.quoteNumber || 'Sin número';

    log.info(req, 'pdf_start', {
      doc_type: type, client: clientName, doc_number: docNumber,
      landscape: !!landscape, has_idempotency_key: !!idempotencyKey,
    });

    // Step 3 — register with Core (non-fatal)
    const coreRefs = await registerWithCore({ type, data, totals, idempotencyKey, req });

    // Step 4 — enrich data with Core refs and computed totals
    const enrichedData = {
      ...data,
      // Fiscal totals for template rendering
      subtotal: totals.subtotal,
      discount: totals.discount,
      taxableBase: totals.taxableBase,
      iva: totals.iva,
      ivaRate: totals.ivaRate,
      otherTaxes: totals.otherTaxes,
      total: totals.total,
      // Core identifiers shown in PDF
      coreDocRefId: coreRefs.docRefId || null,
      coreSaleId: coreRefs.saleId || null,
      coreLeadId: coreRefs.leadId || null,
    };

    // Override doc number with Core's correlative if obtained
    if (coreRefs.docNumber) {
      const formatted = formatDocNumber(type, coreRefs.docNumber);
      if (type === 'quote') enrichedData.quoteNumber = formatted;
      else if (type === 'invoice') enrichedData.invoiceNumber = coreRefs.docNumber;
      else if (type === 'receipt') enrichedData.receiptNumber = coreRefs.docNumber;
    }

    // Move travel images from data to assets for proper processing
    let processAssets = { ...assets };
    if (enrichedData.images && typeof enrichedData.images === 'object') {
      processAssets.images = enrichedData.images;
    }
    if (enrichedData.categoryImages && typeof enrichedData.categoryImages === 'object') {
      processAssets.categoryImages = enrichedData.categoryImages;
    }

    // Step 5 — generate PDF
    const buffer = await DocumentRenderer.render({
      type,
      format: 'pdf',
      data: enrichedData,
      assets: processAssets,
      landscape: landscape || false,
    });

    const elapsedTime = Date.now() - startTime;
    const pdfSizeKB = (buffer.length / 1024).toFixed(2);

    log.info(req, 'pdf_ok', {
      doc_type: type, client: clientName,
      doc_number: enrichedData.quoteNumber || enrichedData.invoiceNumber || enrichedData.receiptNumber,
      size_kb: parseFloat(pdfSizeKB), ms: elapsedTime,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${type}_${Date.now()}.pdf`);
    // Expose Core references so callers can link PDF to CRM records
    if (coreRefs.docRefId) res.setHeader('X-Core-Doc-Ref-Id', coreRefs.docRefId);
    if (coreRefs.partyId) res.setHeader('X-Core-Party-Id', coreRefs.partyId);
    if (coreRefs.saleId) res.setHeader('X-Core-Sale-Id', coreRefs.saleId);
    if (coreRefs.leadId) res.setHeader('X-Core-Lead-Id', coreRefs.leadId);
    res.send(buffer);
  } catch (error) {
    const elapsedTime = Date.now() - startTime;
    log.error(req, 'pdf_error', { error: error.message, ms: elapsedTime });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/documents/generate-word
 * Body: { type, data, assets? }
 */
router.post('/generate-word', async (req, res) => {
  try {
    const { type, data: rawData, assets } = req.body;

    if (!type || !rawData) {
      return res.status(400).json({ error: 'Missing required fields: type, data' });
    }

    const data = injectBranding(rawData);
    const totals = computeTotals(data);
    const enrichedData = { ...data, ...totals };

    const buffer = await DocumentRenderer.render({
      type,
      format: 'word',
      data: enrichedData,
      assets,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename=${type}_${Date.now()}.docx`);
    res.send(buffer);
  } catch (error) {
    log.error(req, 'word_error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Export helpers for testing
router._computeTotals = computeTotals;
router._injectBranding = injectBranding;
router._formatDocNumber = formatDocNumber;

module.exports = router;
