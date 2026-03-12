const express = require('express');
const router = express.Router();
const DocumentRenderer = require('../utils/documentRenderer');

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

    console.log('\n┌─────────────────────────────────────────────────────────────');
    console.log('│ [PDF] INICIO DE GENERACIÓN');
    console.log('├─────────────────────────────────────────────────────────────');
    console.log(`│ Tipo:      ${docTypeName} (${type})`);
    console.log(`│ Cliente:   ${clientName}`);
    console.log(`│ Número:    ${docNumber}`);
    console.log(`│ Fecha:     ${docDate}`);
    console.log(`│ Landscape: ${landscape ? 'Sí' : 'No'}`);
    console.log(`│ Hora:      ${new Date().toLocaleString('es-AR')}`);
    console.log('└─────────────────────────────────────────────────────────────\n');

    if (!type || !data) {
      console.error('[PDF] ✗ ERROR: Faltan campos requeridos (type o data)');
      return res.status(400).json({ error: 'Missing required fields: type, data' });
    }

    // Move travel images from data to assets for proper processing
    let processAssets = { ...assets };
    if (data.images && typeof data.images === 'object') {
      const imageKeys = Object.keys(data.images);
      processAssets.images = data.images;
      console.log(`[PDF] 📷 Procesando ${imageKeys.length} imagen(es):`, imageKeys.join(', '));
    }

    // Move category images from data to assets for proper processing
    if (data.categoryImages && typeof data.categoryImages === 'object') {
      processAssets.categoryImages = data.categoryImages;
      const slugs = Object.keys(data.categoryImages);
      console.log(`[PDF] 📷 Procesando ${slugs.length} imagen(es) de categoría:`, slugs.join(', '));
    }

    console.log('[PDF] 🔄 Iniciando renderizado...');
    const buffer = await DocumentRenderer.render({
      type,
      format: 'pdf',
      data,
      assets: processAssets,
      landscape: landscape || false,
    });

    const elapsedTime = Date.now() - startTime;
    const pdfSizeKB = (buffer.length / 1024).toFixed(2);

    console.log('\n┌─────────────────────────────────────────────────────────────');
    console.log('│ [PDF] ✓ GENERACIÓN EXITOSA');
    console.log('├─────────────────────────────────────────────────────────────');
    console.log(`│ Documento:  ${docTypeName} #${docNumber}`);
    console.log(`│ Cliente:    ${clientName}`);
    console.log(`│ Tamaño:     ${pdfSizeKB} KB (${buffer.length} bytes)`);
    console.log(`│ Tiempo:     ${elapsedTime}ms`);
    console.log(`│ Timestamp:  ${new Date().toLocaleString('es-AR')}`);
    console.log('└─────────────────────────────────────────────────────────────\n');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${type}_${Date.now()}.pdf`);
    res.send(buffer);
  } catch (error) {
    const elapsedTime = Date.now() - startTime;
    console.error('\n┌─────────────────────────────────────────────────────────────');
    console.error('│ [PDF] ✗ ERROR EN GENERACIÓN');
    console.error('├─────────────────────────────────────────────────────────────');
    console.error(`│ Error:   ${error.message}`);
    console.error(`│ Stack:   ${error.stack?.split('\n')[1]?.trim() || 'N/A'}`);
    console.error(`│ Tiempo:  ${elapsedTime}ms`);
    console.error('└─────────────────────────────────────────────────────────────\n');
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
    console.error('Word generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
