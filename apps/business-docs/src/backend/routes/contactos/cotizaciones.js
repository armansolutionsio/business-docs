const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../../utils/db');

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM cotizaciones WHERE contacto_id = $1 ORDER BY created_at DESC', [req.params.contactoId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
