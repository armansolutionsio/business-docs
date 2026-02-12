const express = require('express');
const router = express.Router();
const {
  generatePDF,
  generateWord,
  generateInvoice,
  generateReceipt,
  generateQuote,
  generateBudget,
  generateProposal,
  generateDeliveryNote
} = require('../utils/documentGenerator');

// Generar PDF
router.post('/generate-pdf', async (req, res) => {
  try {
    const { documentType, data } = req.body;
    const buffer = await generatePDF(documentType, data);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${documentType}_${Date.now()}.pdf`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generar Word
router.post('/generate-word', async (req, res) => {
  try {
    const { documentType, data } = req.body;
    const buffer = await generateWord(documentType, data);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename=${documentType}_${Date.now()}.docx`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
