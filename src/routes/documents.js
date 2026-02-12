const express = require('express');
const router = express.Router();
const DocumentRenderer = require('../utils/documentRenderer');

/**
 * Generate PDF document
 * Body: { type, data, assets?, landscape? }
 */
router.post('/generate-pdf', async (req, res) => {
  try {
    const { type, data, assets, landscape } = req.body;

    if (!type || !data) {
      return res.status(400).json({ error: 'Missing required fields: type, data' });
    }

    const buffer = await DocumentRenderer.render({
      type,
      format: 'pdf',
      data,
      assets,
      landscape: landscape || false,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${type}_${Date.now()}.pdf`);
    res.send(buffer);
  } catch (error) {
    console.error('PDF generation error:', error);
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
