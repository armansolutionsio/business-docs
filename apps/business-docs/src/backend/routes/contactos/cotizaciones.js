const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../../utils/db');
const { logAudit } = require('../../utils/auditLog');
const { peekNextNumber, allocateNextNumber } = require('../../utils/docNumbering');

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM cotizaciones WHERE contacto_id = $1 AND (estado IS NULL OR estado != 'borrado')
       ORDER BY created_at DESC`, [req.params.contactoId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET next global number (peek only — does not reserve)
router.get('/next-number', async (req, res, next) => {
  try {
    const { seq, numero } = await peekNextNumber('cotizaciones');
    res.json({ numero, seq });
  } catch (err) { next(err); }
});

// POST — save cotizacion (without PDF)
router.post('/', async (req, res, next) => {
  try {
    const cid = req.params.contactoId;
    const { items, moneda, validez_dias, notas, created_by, categoryDetails, cliente_snapshot } = req.body;

    const itemsArr = Array.isArray(items) ? items : [];
    const subtotal = itemsArr.reduce((s, i) => s + (parseFloat(i.quantity || 1) * parseFloat(i.price || 0)), 0);
    const total = subtotal;

    const inserted = await allocateNextNumber('cotizaciones', async (client, numero) => {
      const cot = await client.query(
        `INSERT INTO cotizaciones (contacto_id, numero, fecha, validez_dias, moneda, subtotal, impuestos, total, estado, notas, detalle_categorias, cliente_snapshot, created_by)
         VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, 0, $6, 'enviada', $7, $8, $9, $10) RETURNING *`,
        [cid, numero, validez_dias || 15, moneda || 'ARS', subtotal, total,
         notas || null,
         categoryDetails ? JSON.stringify(categoryDetails) : null,
         cliente_snapshot ? JSON.stringify(cliente_snapshot) : null,
         created_by || 'cotizador']
      );
      for (const item of itemsArr) {
        const qty = parseFloat(item.quantity || 1);
        const price = parseFloat(item.price || 0);
        await client.query(
          `INSERT INTO cotizacion_items (cotizacion_id, descripcion, cantidad, precio_unitario, subtotal)
           VALUES ($1, $2, $3, $4, $5)`,
          [cot.rows[0].id, item.description || '', qty, price, qty * price]
        );
      }
      return cot.rows[0];
    });

    await db.query(
      `UPDATE contactos SET estado = CASE WHEN estado = 'nuevo' THEN 'contactado' ELSE estado END,
       fecha_ultima_interaccion = NOW(), updated_at = NOW() WHERE id = $1`, [cid]
    );
    await logAudit({ tabla: 'cotizaciones', registro_id: inserted.id, accion: 'INSERT', usuario: created_by });

    res.status(201).json(inserted);
  } catch (err) { next(err); }
});

module.exports = router;
