// PayBridge — links de cobro multi-moneda con fee.
// Schema: paybridge.

const express = require('express');
const crypto = require('crypto');
const { tenantMiddleware } = require('../utils/tenant');
const { buildCrmRouter } = require('./crmCommon');

const router = express.Router();
router.use(tenantMiddleware('paybridge'));

// CRM generico (notas, tareas, oportunidades, timeline) sobre el schema paybridge
router.use('/crm', buildCrmRouter());

const num = (v, d = 0) => (v === '' || v == null ? d : Number(v));
const slug = () => crypto.randomBytes(6).toString('base64url');

function calcFee(monto, rule) {
  if (!rule) return { fee: 0, neto: monto };
  let fee = (monto * Number(rule.fee_pct || 0)) / 100 + Number(rule.fee_fijo || 0);
  if (rule.minimo && fee < Number(rule.minimo)) fee = Number(rule.minimo);
  if (rule.maximo && fee > Number(rule.maximo)) fee = Number(rule.maximo);
  return { fee: Math.round(fee * 100) / 100, neto: Math.round((monto - fee) * 100) / 100 };
}

// ── Monedas ────────────────────────────────────────────────────────────
router.get('/monedas', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(`SELECT * FROM monedas WHERE activa ORDER BY es_cripto, code`);
    res.json(rows);
  } catch (e) { next(e); }
});

// ── Fee rules ──────────────────────────────────────────────────────────
router.get('/fee-rules', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(`SELECT * FROM fee_rules WHERE activo ORDER BY moneda, fee_pct`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/fee-rules', async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await req.tdb.query(
      `INSERT INTO fee_rules (nombre, moneda, fee_pct, fee_fijo, minimo, maximo, activo)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,TRUE)) RETURNING *`,
      [b.nombre, b.moneda, num(b.fee_pct, 0), num(b.fee_fijo, 0),
       num(b.minimo, null), num(b.maximo, null), b.activo]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// ── Contactos PayBridge ────────────────────────────────────────────────
router.get('/contactos', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(`SELECT * FROM contactos ORDER BY created_at DESC LIMIT 500`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/contactos', async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await req.tdb.query(
      `INSERT INTO contactos (nombre, razon_social, cuit, email, telefono, pais, condicion_iva, estado, rol,
                              dolarapp_alias, dolarapp_email, dolarapp_estado, dolarapp_onboarding_at, dolarapp_notas, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12,'sin_onboardear'),$13,$14,$15::jsonb) RETURNING *`,
      [b.nombre, b.razon_social, b.cuit, b.email, b.telefono, b.pais || 'Argentina',
       b.condicion_iva, b.estado || 'activo', b.rol || 'cliente',
       b.dolarapp_alias || null, b.dolarapp_email || null, b.dolarapp_estado,
       b.dolarapp_onboarding_at || null, b.dolarapp_notas || null,
       JSON.stringify(b.metadata || {})]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.patch('/contactos/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const sets = [], params = [];
    for (const k of ['nombre','razon_social','cuit','email','telefono','pais','condicion_iva','estado','rol',
                     'dolarapp_alias','dolarapp_email','dolarapp_estado','dolarapp_onboarding_at','dolarapp_notas']) {
      if (b[k] !== undefined) { params.push(b[k]); sets.push(`${k} = $${params.length}`); }
    }
    if (b.metadata !== undefined) {
      params.push(JSON.stringify(b.metadata));
      sets.push(`metadata = $${params.length}::jsonb`);
    }
    sets.push(`updated_at = NOW()`);
    if (sets.length === 1) return res.status(400).json({ error: 'Nada para actualizar' });
    params.push(req.params.id);
    const { rows } = await req.tdb.query(
      `UPDATE contactos SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// ── Payment Links ──────────────────────────────────────────────────────
router.get('/links', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(
      `SELECT pl.*, c.nombre AS cliente_nombre, m.simbolo AS moneda_simbolo
         FROM payment_links pl
         LEFT JOIN contactos c ON c.id = pl.contacto_id
         LEFT JOIN monedas m ON m.code = pl.moneda
        ORDER BY pl.created_at DESC LIMIT 500`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/links', async (req, res, next) => {
  try {
    const b = req.body;
    const monto = num(b.monto, 0);
    if (!monto || !b.moneda) return res.status(400).json({ error: 'monto y moneda son requeridos' });

    let rule = null;
    if (b.fee_rule_id) {
      const r = await req.tdb.query(`SELECT * FROM fee_rules WHERE id = $1`, [b.fee_rule_id]);
      rule = r.rows[0];
    } else {
      const r = await req.tdb.query(`SELECT * FROM fee_rules WHERE activo AND moneda = $1 LIMIT 1`, [b.moneda]);
      rule = r.rows[0];
    }
    const { fee, neto } = calcFee(monto, rule);

    const { rows } = await req.tdb.query(
      `INSERT INTO payment_links
         (contacto_id, slug, descripcion, monto, moneda, fee_rule_id, fee_calculado, monto_neto,
          estado, expira_at, multi_uso, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'activo',$9,$10,$11::jsonb)
       RETURNING *`,
      [b.contacto_id, slug(), b.descripcion, monto, b.moneda, rule ? rule.id : null,
       fee, neto, b.expira_at || null, !!b.multi_uso, JSON.stringify(b.metadata || {})]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.get('/links/:slug', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(
      `SELECT pl.*, m.simbolo AS moneda_simbolo, m.nombre AS moneda_nombre
         FROM payment_links pl LEFT JOIN monedas m ON m.code = pl.moneda
        WHERE pl.slug = $1`, [req.params.slug]);
    if (!rows.length) return res.status(404).json({ error: 'Link no encontrado' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.patch('/links/:id', async (req, res, next) => {
  try {
    const b = req.body;
    const fields = []; const params = []; let i = 1;
    for (const k of ['descripcion','estado','expira_at','multi_uso']) {
      if (b[k] !== undefined) { fields.push(`${k} = $${i++}`); params.push(b[k]); }
    }
    if (!fields.length) return res.status(400).json({ error: 'Sin cambios' });
    fields.push(`updated_at = NOW()`); params.push(req.params.id);
    const { rows } = await req.tdb.query(
      `UPDATE payment_links SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, params);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// Simulación de pago (mock; reemplazar por webhook de PSP real)
router.post('/links/:slug/pagar', async (req, res, next) => {
  try {
    const b = req.body || {};
    const result = await req.tdb.tx(async (cli) => {
      const linkRes = await cli.query(`SELECT * FROM payment_links WHERE slug = $1 FOR UPDATE`, [req.params.slug]);
      if (!linkRes.rows.length) throw new Error('Link no existe');
      const link = linkRes.rows[0];
      if (link.estado !== 'activo') throw new Error('Link no activo');

      const tx = await cli.query(
        `INSERT INTO transactions (payment_link_id, contacto_id, external_ref, monto_bruto, fee, monto_neto,
            moneda, estado, payer_email, payer_nombre, raw_payload, completado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'completado',$8,$9,$10::jsonb, NOW()) RETURNING *`,
        [link.id, link.contacto_id, b.external_ref || `MOCK-${crypto.randomBytes(4).toString('hex')}`,
         link.monto, link.fee_calculado, link.monto_neto, link.moneda,
         b.payer_email, b.payer_nombre, JSON.stringify(b.raw || {})]);

      if (!link.multi_uso) {
        await cli.query(`UPDATE payment_links SET estado = 'pagado', updated_at = NOW() WHERE id = $1`, [link.id]);
      }
      return tx.rows[0];
    });
    res.status(201).json(result);
  } catch (e) { next(e); }
});

// ── Transactions ───────────────────────────────────────────────────────
router.get('/transactions', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(
      `SELECT t.*, pl.slug AS link_slug, pl.descripcion AS link_descripcion
         FROM transactions t LEFT JOIN payment_links pl ON pl.id = t.payment_link_id
        ORDER BY t.created_at DESC LIMIT 500`);
    res.json(rows);
  } catch (e) { next(e); }
});

// ── Dashboard PayBridge ────────────────────────────────────────────────
router.get('/dashboard', async (req, res, next) => {
  try {
    const m = await req.tdb.query(`
      SELECT
        (SELECT COUNT(*) FROM payment_links WHERE estado = 'activo') AS links_activos,
        (SELECT COUNT(*) FROM transactions WHERE estado = 'completado' AND created_at > NOW() - INTERVAL '30 days') AS tx_30d,
        (SELECT COALESCE(SUM(fee),0) FROM transactions WHERE estado = 'completado' AND created_at > NOW() - INTERVAL '30 days') AS fees_30d,
        (SELECT COUNT(*) FROM contactos) AS contactos
    `);
    const porMoneda = await req.tdb.query(`
      SELECT moneda, COUNT(*) AS cantidad, COALESCE(SUM(monto_bruto),0) AS bruto, COALESCE(SUM(fee),0) AS fee
        FROM transactions WHERE estado = 'completado' AND created_at > NOW() - INTERVAL '30 days'
        GROUP BY moneda ORDER BY bruto DESC`);
    res.json({ ...m.rows[0], por_moneda: porMoneda.rows });
  } catch (e) { next(e); }
});

module.exports = router;
