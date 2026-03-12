const express = require('express');
const router = express.Router();
const DocumentRenderer = require('../utils/documentRenderer');
const log = require('../utils/logger');

/**
 * Generate PDF document
 * Body: { type, data, assets?, landscape? }
 */
router.post('/generate-pdf', async (req, res) => {
  const startTime = Date.now();
  try {
    const { type, data, assets, landscape } = req.body;

    // Extraer información clave para logging
    const docTypeNames = { invoice: 'Factura', receipt: 'Recibo', quote: 'Cotización' };
    const docTypeName = docTypeNames[type] || type;
    const clientName = data.clientName || data.payerName || 'Sin nombre';
    const docNumber = data.invoiceNumber || data.receiptNumber || data.quoteNumber || 'Sin número';
    const docDate = data.invoiceDate || data.receiptDate || data.quoteDate || new Date().toISOString();

    log.info(req, 'pdf_start', {
      doc_type: type, client: clientName, doc_number: docNumber,
      landscape: !!landscape,
    });

    if (!type || !data) {
      console.error('[PDF] ✗ ERROR: Faltan campos requeridos (type o data)');
      return res.status(400).json({ error: 'Missing required fields: type, data' });
    }

    // Move travel images from data to assets for proper processing
    let processAssets = { ...assets };
    if (data.images && typeof data.images === 'object') {
      processAssets.images = data.images;
    }
    if (data.categoryImages && typeof data.categoryImages === 'object') {
      processAssets.categoryImages = data.categoryImages;
    }
    const buffer = await DocumentRenderer.render({
      type,
      format: 'pdf',
      data,
      assets: processAssets,
      landscape: landscape || false,
    });

    const elapsedTime = Date.now() - startTime;
    const pdfSizeKB = (buffer.length / 1024).toFixed(2);

    log.info(req, 'pdf_ok', {
      doc_type: type, client: clientName, doc_number: docNumber,
      size_kb: parseFloat(pdfSizeKB), ms: elapsedTime,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${type}_${Date.now()}.pdf`);
    res.send(buffer);
  } catch (error) {
    const elapsedTime = Date.now() - startTime;
    log.error(req, 'pdf_error', { error: error.message, ms: elapsedTime });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generate Word document
 * Body: { type, data, assets? }
 */
router.post('/generate-word', async (req, res) => {
  try {
    const { type, data, assets } = req.body;

    if (!type || !data) {
      return res.status(400).json({ error: 'Missing required fields: type, data' });
    }

    const buffer = await DocumentRenderer.render({
      type,
      format: 'word',
      data,
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

module.exports = router;
