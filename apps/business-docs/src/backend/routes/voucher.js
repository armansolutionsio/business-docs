'use strict';

const express = require('express');
const router = express.Router();
const log = require('../utils/logger');
const { parseVoucher } = require('../utils/voucherExtractor');

/**
 * POST /api/voucher/parse
 *
 * Body: { fileName, fileData (base64 o dataURL), mimeType, hintType? }
 * hintType: 'hotel'|'flight'|'transfer'|'insurance'|'auto' (default: auto)
 *
 * Devuelve un payload con la informacion estructurada lista para mergear
 * en el formulario Voucher del frontend.
 */
router.post('/parse', async (req, res) => {
  const t0 = Date.now();
  try {
    const { fileName, fileData, mimeType, hintType } = req.body || {};
    if (!fileData) return res.status(400).json({ error: 'fileData (base64) es requerido' });

    const result = await parseVoucher(fileData, {
      mimeType: mimeType || '',
      fileName: fileName || '',
      hintType: hintType || 'auto',
    });

    const counts = {};
    for (const k of ['hotels', 'flights', 'transfers', 'otherServices', 'passengers']) {
      if (Array.isArray(result.data && result.data[k])) counts[k] = result.data[k].length;
    }

    log.info(req, 'voucher_parse', {
      file: fileName, type: result.type, source: result.source,
      counts, ms: Date.now() - t0,
    });

    res.json(result);
  } catch (err) {
    log.error(req, 'voucher_parse_error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
