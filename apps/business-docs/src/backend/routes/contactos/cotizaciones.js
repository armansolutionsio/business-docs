const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../../utils/db');
const { logAudit } = require('../../utils/auditLog');

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM cotizaciones WHERE contacto_id = $1 ORDER BY created_at DESC', [req.params.contactoId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET next number for this contact
router.get('/next-number', async (req, res, next) => {
  try {
    const cid = req.params.contactoId;
    const countRes = await db.query('SELECT COUNT(*) FROM cotizaciones WHERE contacto_id = $1', [cid]);
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const numero = `COT-${String(cid).padStart(4, '0')}-${String(seq).padStart(2, '0')}`;
    res.json({ numero, seq });
  } catch (err) { next(err); }
});

// POST — save cotizacion (without PDF)
router.post('/', async (req, res, next) => {
  try {
    const cid = req.params.contactoId;
    const { items, moneda, validez_dias, notas, created_by } = req.body;

    // Compute totals
    const itemsArr = Array.isArray(items) ? items : [];
    const subtotal = itemsArr.reduce((s, i) => s + (parseFloat(i.quantity || 1) * parseFloat(i.price || 0)), 0);
    const total = subtotal; // simplified, no tax for travel agencies

    // Generate correlative number
    const countRes = await db.query('SELECT COUNT(*) FROM cotizaciones WHERE contacto_id = $1', [cid]);
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const numero = `COT-${String(cid).padStart(4, '0')}-${String(seq).padStart(2, '0')}`;

    const cot = await db.query(
      `INSERT INTO cotizaciones (contacto_id, numero, fecha, validez_dias, moneda, subtotal, impuestos, total, estado, notas, created_by)
       VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, 0, $6, 'enviada', $7, $8) RETURNING *`,
      [cid, numero, validez_dias || 15, moneda || 'ARS', subtotal, total, notas || null, created_by || 'cotizador']
    );

    // Save items
    for (const item of itemsArr) {
      const qty = parseFloat(item.quantity || 1);
      const price = parseFloat(item.price || 0);
      await db.query(
        `INSERT INTO cotizacion_items (cotizacion_id, descripcion, cantidad, precio_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [cot.rows[0].id, item.description || '', qty, price, qty * price]
      );
    }

    // Only advance from 'nuevo' to 'contactado' — don't override more advanced estados
    await db.query(
      `UPDATE contactos SET estado = CASE WHEN estado = 'nuevo' THEN 'contactado' ELSE estado END,
       fecha_ultima_interaccion = NOW(), updated_at = NOW() WHERE id = $1`, [cid]
    );
    await logAudit({ tabla: 'cotizaciones', registro_id: cot.rows[0].id, accion: 'INSERT', usuario: created_by });

    res.status(201).json(cot.rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
