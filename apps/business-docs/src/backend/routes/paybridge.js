// PayBridge — links de cobro multi-moneda con fee.
// Schema: paybridge.

const express = require('express');
const crypto = require('crypto');
const XLSX = require('xlsx');
const path = require('path');
const { tenantMiddleware } = require('../utils/tenant');
const { buildCrmRouter } = require('./crmCommon');
const { renderStatement } = require('../services/pdfRenderer');

const router = express.Router();
router.use(tenantMiddleware('paybridge'));

// CRM generico (notas, tareas, oportunidades, timeline) sobre el schema paybridge
router.use('/crm', buildCrmRouter());

const num = (v, d = 0) => (v === '' || v == null ? d : Number(v));
const slug = () => crypto.randomBytes(6).toString('base64url');

// Combining diacritical marks (U+0300..U+036F).
const DIACRITICS = /[̀-ͯ]/g;

// Normaliza "Juan.Perez" / "juan perez" / "Juán Pérez" → "juan.perez"
function normalizeProductKey(s) {
  if (!s) return '';
  return String(s)
    .normalize('NFD').replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');
}

// "juan.perez" → { nombre: "Juan", apellido: "Perez" }
function splitProductName(key) {
  if (!key) return { nombre: '', apellido: '' };
  const parts = String(key).split('.').filter(Boolean);
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
  if (!parts.length) return { nombre: '', apellido: '' };
  if (parts.length === 1) return { nombre: cap(parts[0]), apellido: '' };
  return { nombre: cap(parts[0]), apellido: parts.slice(1).map(cap).join(' ') };
}

// Busca una columna por hints (case-insensitive, sin acentos, ignora prefijos automatic_/...).
function findColMatcher(keys) {
  const norm = keys.map(k => ({ orig: k, n: k.toLowerCase().normalize('NFD').replace(DIACRITICS, '') }));
  return (hints) => {
    for (const h of hints) {
      const exact = norm.find(k => k.n === h);
      if (exact) return exact.orig;
    }
    for (const h of hints) {
      const partial = norm.find(k => k.n.includes(h));
      if (partial) return partial.orig;
    }
    return null;
  };
}

function parseStripeDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  if (!s) return null;
  // Stripe exporta "2025-12-01 14:30" o ISO. Excel a veces lo da como número serial.
  if (/^\d+(\.\d+)?$/.test(s)) {
    // Excel serial date (días desde 1899-12-30).
    const ms = (Number(s) - 25569) * 86400 * 1000;
    return new Date(ms).toISOString();
  }
  const d = new Date(s.replace(' ', 'T'));
  return isNaN(d) ? null : d.toISOString();
}

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

const CONTACT_FIELDS = [
  'nombre','razon_social','cuit','email','telefono','pais','condicion_iva','estado','rol','apellido',
  'dolarapp_alias','dolarapp_email','dolarapp_estado','dolarapp_onboarding_at','dolarapp_notas',
  'dolarapp_cvu','dolarapp_cbu','dolarapp_numero_cuenta','dolarapp_titular',
];

router.post('/contactos', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.nombre) return res.status(400).json({ error: 'nombre requerido' });
    const cols = ['nombre'];
    const vals = [b.nombre];
    for (const k of CONTACT_FIELDS) {
      if (k === 'nombre') continue;
      if (b[k] !== undefined) { cols.push(k); vals.push(b[k]); }
    }
    cols.push('pais', 'estado', 'rol', 'dolarapp_estado', 'metadata');
    vals.push(b.pais || 'Argentina', b.estado || 'activo', b.rol || 'cliente',
              b.dolarapp_estado || 'sin_onboardear', JSON.stringify(b.metadata || {}));
    // Sacar duplicados manteniendo el primer valor (los del body tienen precedencia)
    const seen = new Set();
    const finalCols = [], finalVals = [];
    cols.forEach((c, i) => { if (!seen.has(c)) { seen.add(c); finalCols.push(c); finalVals.push(vals[i]); } });
    const ph = finalVals.map((_, i) => `$${i + 1}`);
    const metaIdx = finalCols.indexOf('metadata');
    if (metaIdx >= 0) ph[metaIdx] = ph[metaIdx] + '::jsonb';
    const sql = `INSERT INTO contactos (${finalCols.join(', ')}) VALUES (${ph.join(', ')}) RETURNING *`;
    const { rows } = await req.tdb.query(sql, finalVals);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.get('/contactos/:id', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(`SELECT * FROM contactos WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.patch('/contactos/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const sets = [], params = [];
    for (const k of CONTACT_FIELDS) {
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
    const estado = b.estado === 'inactivo' ? 'inactivo' : 'activo';
    const source = b.url || b.external_id ? 'stripe_manual' : 'manual';

    // Si vino external_id de Stripe, hacer dedupe primero.
    if (b.external_id) {
      const dup = await req.tdb.query(
        `SELECT id FROM payment_links WHERE external_id = $1 LIMIT 1`, [b.external_id]);
      if (dup.rows.length) {
        return res.status(409).json({ error: 'Ya existe un link con ese ID de Stripe',
                                       existing_id: dup.rows[0].id });
      }
    }

    const { rows } = await req.tdb.query(
      `INSERT INTO payment_links
         (contacto_id, slug, external_id, url, descripcion, monto, moneda,
          fee_rule_id, fee_calculado, monto_neto, estado, expira_at, multi_uso,
          source, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
       RETURNING *`,
      [b.contacto_id || null, slug(), b.external_id || null, b.url || null,
       b.descripcion, monto, b.moneda, rule ? rule.id : null,
       fee, neto, estado, b.expira_at || null, !!b.multi_uso,
       source, JSON.stringify(b.metadata || {})]
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
    for (const k of ['descripcion','estado','expira_at','multi_uso',
                     'url','external_id','contacto_id','monto','moneda']) {
      if (b[k] !== undefined) { fields.push(`${k} = $${i++}`); params.push(b[k]); }
    }
    if (!fields.length) return res.status(400).json({ error: 'Sin cambios' });
    fields.push(`updated_at = NOW()`); params.push(req.params.id);
    const { rows } = await req.tdb.query(
      `UPDATE payment_links SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, params);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// DELETE link
router.delete('/links/:id', async (req, res, next) => {
  try {
    const r = await req.tdb.query(`DELETE FROM payment_links WHERE id = $1`, [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
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
// Acepta ?from=&to= (ISO). Si no, default últimos 30 días.
router.get('/dashboard', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const params = [];
    // dateWhere() devuelve la cláusula con el alias de tabla que pasemos (necesario en JOINs
    // donde tanto transactions como contactos tienen created_at).
    const dateWhere = (alias = '') => {
      const a = alias ? alias + '.' : '';
      if (!from && !to) return ` AND COALESCE(${a}completado_at, ${a}created_at) > NOW() - INTERVAL '30 days'`;
      let s = '';
      let i = 0;
      if (from) { i++; s += ` AND COALESCE(${a}completado_at, ${a}created_at) >= $${i}`; }
      if (to)   { i++; s += ` AND COALESCE(${a}completado_at, ${a}created_at) <= $${i}`; }
      return s;
    };
    if (from) params.push(from);
    if (to)   params.push(to);

    // KPIs globales que NO dependen del rango (links activos, total clientes)
    const meta = await req.tdb.query(`
      SELECT
        (SELECT COUNT(*)::int FROM payment_links WHERE estado = 'activo') AS links_activos,
        (SELECT COUNT(*)::int FROM contactos) AS contactos_total
    `);

    // KPIs del período
    const totalesRes = await req.tdb.query(
      `SELECT COUNT(*)::int AS tx_count,
              COUNT(DISTINCT contacto_id)::int AS clientes_activos,
              COUNT(DISTINCT moneda)::int AS monedas_count
         FROM transactions WHERE estado = 'completado' ${dateWhere()}`,
      params
    );

    const porMoneda = await req.tdb.query(
      `SELECT moneda, COUNT(*)::int AS cantidad,
              COALESCE(SUM(monto_bruto),0) AS bruto,
              COALESCE(SUM(fee),0) AS fee,
              COALESCE(SUM(monto_neto),0) AS neto,
              COALESCE(AVG(monto_bruto),0) AS promedio
         FROM transactions WHERE estado = 'completado' ${dateWhere()}
         GROUP BY moneda ORDER BY bruto DESC`,
      params
    );

    const porMes = await req.tdb.query(
      `SELECT TO_CHAR(date_trunc('month', COALESCE(completado_at, created_at)), 'YYYY-MM') AS mes,
              moneda,
              COUNT(*)::int AS cantidad,
              COALESCE(SUM(monto_bruto),0) AS bruto,
              COALESCE(SUM(fee),0) AS fee,
              COALESCE(SUM(monto_neto),0) AS neto
         FROM transactions WHERE estado = 'completado' ${dateWhere()}
         GROUP BY mes, moneda ORDER BY mes ASC`,
      params
    );

    const topClientes = await req.tdb.query(
      `SELECT c.id, c.nombre, c.email,
              t.moneda,
              COUNT(*)::int AS cantidad,
              COALESCE(SUM(t.monto_bruto),0) AS bruto
         FROM transactions t
         JOIN contactos c ON c.id = t.contacto_id
        WHERE t.estado = 'completado' ${dateWhere('t')}
        GROUP BY c.id, c.nombre, c.email, t.moneda
        ORDER BY bruto DESC LIMIT 10`,
      params
    );

    const topPaises = await req.tdb.query(
      `SELECT COALESCE(card_address_country, country, 'Desconocido') AS pais,
              COUNT(*)::int AS cantidad,
              COALESCE(SUM(monto_bruto),0) AS bruto,
              moneda
         FROM transactions WHERE estado = 'completado' ${dateWhere()}
         GROUP BY pais, moneda ORDER BY cantidad DESC LIMIT 10`,
      params
    );

    res.json({
      ...meta.rows[0],
      totales: totalesRes.rows[0],
      por_moneda: porMoneda.rows,
      por_mes: porMes.rows,
      top_clientes: topClientes.rows,
      top_paises: topPaises.rows,
    });
  } catch (e) { next(e); }
});

// ── Import Stripe CSV/XLSX ─────────────────────────────────────────────
// POST /api/paybridge/stripe-import
// Body: { fileName, fileData (base64) }
// Matchea por product_names (formato "nombre.apellido"), upsert contactos,
// y crea transactions con external_ref único (dedupe entre re-imports).
router.post('/stripe-import', async (req, res, next) => {
  try {
    const { fileName, fileData } = req.body || {};
    if (!fileData) return res.status(400).json({ error: 'fileData (base64) requerido' });

    const buf = Buffer.from(fileData, 'base64');
    const ext = path.extname(fileName || '').toLowerCase();
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });

    if (!rows.length) return res.status(400).json({ error: 'Archivo vacío o sin datos' });

    const keys = Object.keys(rows[0]);
    const find = findColMatcher(keys);
    const col = {
      created:     find(['created_utc','created (utc)','created']),
      available:   find(['available_on_utc','available_on (utc)','available_on']),
      currency:    find(['currency','moneda']),
      gross:       find(['gross','monto_bruto']),
      fee:         find(['fee','comision','fees']),
      net:         find(['net','monto_neto']),
      country:     find(['country','pais']),
      productIds:  find(['product_ids','product id','product_id']),
      productNames: find(['product_names','product name','product_name','customer_email']),
      exchangeRate: find(['exchange_rate','tipo_cambio']),
      cardLine1:   find(['card_address_line1','card address line1','address_line1']),
      cardPostal:  find(['card_address_postal_code','card postal code','postal_code']),
      cardCountry: find(['card_address_country','card country']),
      cardBrand:   find(['card_brand']),
      cardFunding: find(['card_funding']),
      cardCountryReal: find(['card_country']),
      stmtDesc:    find(['statement_descriptor','statement descriptor']),
      chargeId:    find(['charge_id','charge id','id']),
      paymentIntentId: find(['payment_intent_id','payment intent id','paymentintentid']),
      customerEmail: find(['customer_email','customer email','payer_email','email']),
      customerName: find(['customer_name','customer name','payer_name']),
      description: find(['description','descripcion']),
    };

    const usuario = req.user?.email || 'import';
    const stats = {
      file: fileName || null,
      rows_total: rows.length,
      rows_imported: 0,
      rows_duplicated: 0,
      rows_skipped: 0,
      contactos_creados: 0,
      contactos_actualizados: 0,
      por_cliente: {},
      sin_product_name: 0,
    };
    let periodFrom = null, periodTo = null;

    await req.tdb.tx(async (cli) => {
      for (const row of rows) {
        try {
          const rawProductName = col.productNames ? String(row[col.productNames] || '').trim() : '';
          const rawProductId = col.productIds ? String(row[col.productIds] || '').trim() : '';

          // Llave de matcheo: nombre.apellido normalizado.
          // Fallback: si no hay product_names, usamos el id del link Stripe (product_ids)
          // como "cliente provisorio" con product_key = "plink:<id>". Quien lo edite
          // después puede consolidarlo manualmente al cliente real.
          let pkey = normalizeProductKey(rawProductName);
          let displayNombre, displayApellido;
          let origen = 'stripe_import';
          if (pkey) {
            const split = splitProductName(pkey);
            displayNombre = split.nombre || rawProductName;
            displayApellido = split.apellido || null;
          } else if (rawProductId) {
            pkey = `plink:${rawProductId.toLowerCase()}`;
            displayNombre = `Link ${rawProductId}`;
            displayApellido = null;
            origen = 'stripe_import_link';
            stats.sin_product_name++;
          } else {
            // Sin product_names y sin product_ids → nada con qué identificar al cliente.
            stats.sin_product_name++;
            stats.rows_skipped++;
            continue;
          }

          // Upsert contacto por product_key
          let contactoId;
          const found = await cli.query(
            `SELECT id, nombre FROM contactos WHERE product_key = $1 LIMIT 1`, [pkey]
          );
          if (found.rows.length) {
            contactoId = found.rows[0].id;
            if (col.customerEmail && row[col.customerEmail]) {
              await cli.query(
                `UPDATE contactos SET email = COALESCE(NULLIF(email, ''), $1), updated_at = NOW()
                  WHERE id = $2`,
                [String(row[col.customerEmail]).trim(), contactoId]
              );
            }
            stats.contactos_actualizados++;
          } else {
            const ins = await cli.query(
              `INSERT INTO contactos (nombre, apellido, email, pais, estado, rol, origen, product_key, metadata)
               VALUES ($1,$2,$3,$4,'activo','cliente',$5,$6,$7::jsonb) RETURNING id`,
              [
                displayNombre, displayApellido,
                col.customerEmail ? (String(row[col.customerEmail] || '').trim() || null) : null,
                col.country ? (String(row[col.country] || '').trim() || null) : null,
                origen,
                pkey,
                JSON.stringify(origen === 'stripe_import_link' ? { stripe_link_id: rawProductId } : {}),
              ]
            );
            contactoId = ins.rows[0].id;
            stats.contactos_creados++;
          }

          // Dedupe por charge_id (external_ref) Y payment_intent_id.
          // Stripe garantiza unicidad en ambos; si alguno ya existe → fila duplicada.
          const extRef = col.chargeId ? String(row[col.chargeId] || '').trim() : '';
          const piId = col.paymentIntentId ? String(row[col.paymentIntentId] || '').trim() : '';
          if (extRef || piId) {
            const dupParams = [];
            const dupConds = [];
            if (extRef) { dupParams.push(extRef); dupConds.push(`external_ref = $${dupParams.length}`); }
            if (piId)   { dupParams.push(piId);   dupConds.push(`payment_intent_id = $${dupParams.length}`); }
            const dup = await cli.query(
              `SELECT id, contacto_id FROM transactions WHERE ${dupConds.join(' OR ')} LIMIT 1`,
              dupParams
            );
            if (dup.rows.length) {
              // Si la tx existente no tiene external_ref/payment_intent y la nueva sí, los rellenamos.
              const sets = [`contacto_id = COALESCE(contacto_id, $1)`];
              const upParams = [contactoId];
              if (extRef) { upParams.push(extRef); sets.push(`external_ref = COALESCE(external_ref, $${upParams.length})`); }
              if (piId)   { upParams.push(piId);   sets.push(`payment_intent_id = COALESCE(payment_intent_id, $${upParams.length})`); }
              upParams.push(dup.rows[0].id);
              await cli.query(
                `UPDATE transactions SET ${sets.join(', ')} WHERE id = $${upParams.length}`,
                upParams
              );
              stats.rows_duplicated++;
              continue;
            }
          }

          const createdAt = col.created ? parseStripeDate(row[col.created]) : null;
          const availableAt = col.available ? parseStripeDate(row[col.available]) : null;
          if (createdAt) {
            if (!periodFrom || createdAt < periodFrom) periodFrom = createdAt;
            if (!periodTo || createdAt > periodTo) periodTo = createdAt;
          }

          await cli.query(
            `INSERT INTO transactions
               (contacto_id, external_ref, payment_intent_id, monto_bruto, fee, monto_neto, moneda, estado,
                payer_email, payer_nombre, raw_payload, completado_at, source,
                available_on_at, country, product_id_ext, product_names, exchange_rate,
                card_address_line1, card_address_postal_code, card_address_country,
                card_brand, card_funding, card_country, statement_descriptor, raw_row)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'completado',$8,$9,$10::jsonb,$11,'stripe_import',
                     $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb)`,
            [
              contactoId, extRef || null, piId || null,
              num(col.gross ? row[col.gross] : 0, 0),
              num(col.fee ? row[col.fee] : 0, 0),
              num(col.net ? row[col.net] : 0, 0),
              (col.currency ? String(row[col.currency] || 'USD') : 'USD').toUpperCase(),
              col.customerEmail ? String(row[col.customerEmail] || '') || null : null,
              col.customerName ? String(row[col.customerName] || '') || null : null,
              JSON.stringify({}),
              createdAt,
              availableAt,
              col.country ? String(row[col.country] || '') || null : null,
              col.productIds ? String(row[col.productIds] || '') || null : null,
              rawProductName,
              col.exchangeRate ? num(row[col.exchangeRate], null) : null,
              col.cardLine1 ? String(row[col.cardLine1] || '') || null : null,
              col.cardPostal ? String(row[col.cardPostal] || '') || null : null,
              col.cardCountry ? String(row[col.cardCountry] || '') || null : null,
              col.cardBrand ? String(row[col.cardBrand] || '') || null : null,
              col.cardFunding ? String(row[col.cardFunding] || '') || null : null,
              col.cardCountryReal ? String(row[col.cardCountryReal] || '') || null : null,
              col.stmtDesc ? String(row[col.stmtDesc] || '') || null : null,
              JSON.stringify(row),
            ]
          );
          stats.rows_imported++;
          stats.por_cliente[pkey] = (stats.por_cliente[pkey] || 0) + 1;
        } catch (rowErr) {
          stats.rows_skipped++;
          stats.errors = stats.errors || [];
          if (stats.errors.length < 10) stats.errors.push(rowErr.message);
        }
      }

      await cli.query(
        `INSERT INTO stripe_imports
           (file_name, rows_total, rows_imported, rows_duplicated, rows_skipped,
            contactos_creados, period_from, period_to, summary, usuario)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
        [stats.file, stats.rows_total, stats.rows_imported, stats.rows_duplicated,
         stats.rows_skipped, stats.contactos_creados, periodFrom, periodTo,
         JSON.stringify(stats), usuario]
      );
    });

    res.json({ ok: true, stats, period_from: periodFrom, period_to: periodTo });
  } catch (e) { next(e); }
});

// ── Import Stripe Payment Links CSV/XLSX ───────────────────────────────
// POST /api/paybridge/stripe-links-import
// Body: { fileName, fileData (base64) }
// Upsert por external_id (id de Stripe). Si la fila trae product_names lo
// usamos para asignar contacto (mismo formato que las transactions). Si solo
// tiene el id del link, queda sin contacto y se asigna a mano después.
router.post('/stripe-links-import', async (req, res, next) => {
  try {
    const { fileName, fileData } = req.body || {};
    if (!fileData) return res.status(400).json({ error: 'fileData (base64) requerido' });

    const buf = Buffer.from(fileData, 'base64');
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    if (!rows.length) return res.status(400).json({ error: 'Archivo vacío o sin datos' });

    const keys = Object.keys(rows[0]);
    const find = findColMatcher(keys);
    // Columnas reales del CSV de Stripe Payment Links: id, Created (UTC), Active, Currency, Url, Name
    const col = {
      id:          find(['id','link_id','payment_link_id']),
      url:         find(['url','link','payment_link_url']),
      active:      find(['active','activo','is_active','status','estado']),
      currency:    find(['currency','moneda']),
      // No viene amount en el export estándar de payment_links — queda 0 hasta que lo edites.
      amount:      find(['amount','total_amount','monto','price','unit_amount']),
      // "Name" del CSV es la descripción del link (lo que el cliente ve al pagar).
      description: find(['name','nombre','description','descripcion']),
      created:     find(['created (utc)','created','created_at','fecha_creacion']),
      productNames: find(['product_names','customer_name','customer_email']),
      productIds:  find(['product_ids','product_id']),
      customerEmail: find(['customer_email','email']),
    };

    if (!col.id) return res.status(400).json({ error: 'No se encontró columna id de link en el archivo' });

    const usuario = req.user?.email || 'import';
    const stats = {
      file: fileName || null,
      rows_total: rows.length,
      rows_imported: 0,
      rows_duplicated: 0,
      rows_skipped: 0,
      contactos_creados: 0,
      sin_id: 0,
      duplicates: [],  // lista detallada de links que ya existían
    };

    await req.tdb.tx(async (cli) => {
      for (const row of rows) {
        try {
          const externalId = col.id ? String(row[col.id] || '').trim() : '';
          if (!externalId) { stats.sin_id++; stats.rows_skipped++; continue; }

          const rawActive = col.active ? String(row[col.active] || '').toLowerCase().trim() : 'true';
          const activo = ['true','1','yes','si','sí','activo','active'].includes(rawActive);
          const estado = activo ? 'activo' : 'inactivo';

          let monto = num(col.amount ? row[col.amount] : 0, 0);
          if (monto > 9999 && Number.isInteger(monto)) monto = monto / 100;

          const moneda = (col.currency ? String(row[col.currency] || 'USD') : 'USD').toUpperCase();
          const url = col.url ? String(row[col.url] || '').trim() || null : null;
          const descripcion = col.description ? String(row[col.description] || '').trim() || null : null;

          // Dedupe por id de Stripe. Si ya existe → NO se importa ni se actualiza;
          // se registra en la lista de duplicados que se devuelve al frontend.
          const existing = await cli.query(
            `SELECT id, descripcion, monto, moneda, estado FROM payment_links WHERE external_id = $1 LIMIT 1`,
            [externalId]
          );
          if (existing.rows.length) {
            stats.rows_duplicated++;
            stats.duplicates.push({
              external_id: externalId,
              name: descripcion,
              url,
              existing_id: existing.rows[0].id,
              existing_descripcion: existing.rows[0].descripcion,
              existing_monto: existing.rows[0].monto,
              existing_moneda: existing.rows[0].moneda,
              existing_estado: existing.rows[0].estado,
            });
            continue;
          }

          // Resolver/crear cliente por product_names si existe
          let contactoId = null;
          const rawProductName = col.productNames ? String(row[col.productNames] || '').trim() : '';
          const rawProductId = col.productIds ? String(row[col.productIds] || '').trim() : '';
          let pkey = normalizeProductKey(rawProductName);
          let displayNombre, displayApellido, origen = 'stripe_import_link';
          if (pkey) {
            const split = splitProductName(pkey);
            displayNombre = split.nombre || rawProductName;
            displayApellido = split.apellido || null;
          } else if (rawProductId) {
            pkey = `plink:${rawProductId.toLowerCase()}`;
            displayNombre = `Link ${rawProductId}`;
          }
          if (pkey) {
            const found = await cli.query(`SELECT id FROM contactos WHERE product_key = $1 LIMIT 1`, [pkey]);
            if (found.rows.length) {
              contactoId = found.rows[0].id;
            } else {
              const ins = await cli.query(
                `INSERT INTO contactos (nombre, apellido, email, estado, rol, origen, product_key, metadata)
                 VALUES ($1,$2,$3,'activo','cliente',$4,$5,'{}'::jsonb) RETURNING id`,
                [
                  displayNombre || rawProductName || `Link ${externalId}`,
                  displayApellido,
                  col.customerEmail ? (String(row[col.customerEmail] || '').trim() || null) : null,
                  origen, pkey,
                ]
              );
              contactoId = ins.rows[0].id;
              stats.contactos_creados++;
            }
          }

          const slugVal = externalId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || slug();
          await cli.query(
            `INSERT INTO payment_links
               (contacto_id, slug, external_id, url, descripcion, monto, moneda, estado, multi_uso,
                source, metadata, raw_row)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE,'stripe_import','{}'::jsonb,$9::jsonb)`,
            [contactoId, slugVal, externalId, url, descripcion, monto, moneda, estado,
             JSON.stringify(row)]
          );
          stats.rows_imported++;
        } catch (rowErr) {
          stats.rows_skipped++;
          stats.errors = stats.errors || [];
          if (stats.errors.length < 10) stats.errors.push(rowErr.message);
        }
      }

      await cli.query(
        `INSERT INTO stripe_links_imports
           (file_name, rows_total, rows_imported, rows_updated, rows_skipped,
            contactos_creados, summary, usuario)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
        [stats.file, stats.rows_total, stats.rows_imported, stats.rows_duplicated,
         stats.rows_skipped, stats.contactos_creados, JSON.stringify(stats), usuario]
      );
    });

    res.json({ ok: true, stats });
  } catch (e) { next(e); }
});

router.get('/stripe-links-imports', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(
      `SELECT id, file_name, rows_total, rows_imported, rows_updated, rows_skipped,
              contactos_creados, usuario, created_at
         FROM stripe_links_imports ORDER BY created_at DESC LIMIT 50`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/stripe-imports', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(
      `SELECT id, file_name, rows_total, rows_imported, rows_duplicated, rows_skipped,
              contactos_creados, period_from, period_to, usuario, created_at
         FROM stripe_imports ORDER BY created_at DESC LIMIT 50`);
    res.json(rows);
  } catch (e) { next(e); }
});

// ── Detalle de cliente: stats agregadas, listado de tx, gráficos ───────
async function buildClientStats(tdb, contactoId, from, to) {
  const params = [contactoId];
  let where = `contacto_id = $1 AND estado = 'completado'`;
  if (from) { params.push(from); where += ` AND COALESCE(completado_at, created_at) >= $${params.length}`; }
  if (to)   { params.push(to);   where += ` AND COALESCE(completado_at, created_at) <= $${params.length}`; }

  const totales = await tdb.query(
    `SELECT COUNT(*)::int AS cantidad,
            COUNT(DISTINCT moneda)::int AS monedas_count,
            COUNT(DISTINCT card_address_country)::int AS paises_count,
            COALESCE(SUM(monto_bruto),0) AS bruto_total,
            COALESCE(AVG(monto_bruto),0) AS promedio
       FROM transactions WHERE ${where}`, params
  );
  const porMoneda = await tdb.query(
    `SELECT moneda,
            COUNT(*)::int AS cantidad,
            COALESCE(SUM(monto_bruto),0) AS bruto,
            COALESCE(SUM(fee),0) AS fee,
            COALESCE(SUM(monto_neto),0) AS neto,
            COALESCE(AVG(monto_bruto),0) AS promedio
       FROM transactions WHERE ${where}
       GROUP BY moneda ORDER BY bruto DESC`, params
  );
  const porMes = await tdb.query(
    `SELECT TO_CHAR(date_trunc('month', COALESCE(completado_at, created_at)), 'YYYY-MM') AS mes,
            moneda,
            COUNT(*)::int AS cantidad,
            COALESCE(SUM(monto_bruto),0) AS bruto,
            COALESCE(SUM(fee),0) AS fee,
            COALESCE(SUM(monto_neto),0) AS neto
       FROM transactions WHERE ${where}
       GROUP BY mes, moneda ORDER BY mes ASC`, params
  );
  const porPais = await tdb.query(
    `SELECT COALESCE(card_address_country, country, 'Desconocido') AS pais,
            COUNT(*)::int AS cantidad,
            COALESCE(SUM(monto_bruto),0) AS bruto, moneda
       FROM transactions WHERE ${where}
       GROUP BY pais, moneda ORDER BY cantidad DESC LIMIT 20`, params
  );
  return {
    totales: totales.rows[0],
    por_moneda: porMoneda.rows,
    por_mes: porMes.rows,
    por_pais: porPais.rows,
  };
}

router.get('/contactos/:id/stats', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const stats = await buildClientStats(req.tdb, req.params.id, from || null, to || null);
    res.json(stats);
  } catch (e) { next(e); }
});

// Lista de payment_links de un cliente con cantidad de cobros completados.
router.get('/contactos/:id/links', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(
      `SELECT pl.id, pl.slug, pl.descripcion, pl.monto, pl.moneda, pl.estado,
              pl.fee_calculado, pl.monto_neto, pl.multi_uso, pl.expira_at,
              pl.created_at, pl.updated_at, m.simbolo AS moneda_simbolo,
              (SELECT COUNT(*)::int FROM transactions t
                 WHERE t.payment_link_id = pl.id AND t.estado = 'completado') AS cobros_completados,
              (SELECT COALESCE(SUM(t.monto_bruto), 0) FROM transactions t
                 WHERE t.payment_link_id = pl.id AND t.estado = 'completado') AS bruto_acumulado
         FROM payment_links pl
         LEFT JOIN monedas m ON m.code = pl.moneda
        WHERE pl.contacto_id = $1
        ORDER BY pl.created_at DESC`, [req.params.id]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/contactos/:id/transactions', async (req, res, next) => {
  try {
    const { from, to, limit } = req.query;
    const params = [req.params.id];
    let where = `t.contacto_id = $1`;
    if (from) { params.push(from); where += ` AND COALESCE(t.completado_at, t.created_at) >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND COALESCE(t.completado_at, t.created_at) <= $${params.length}`; }
    params.push(Math.min(Number(limit) || 500, 5000));
    const { rows } = await req.tdb.query(
      `SELECT t.*, pl.slug AS link_slug, pl.descripcion AS link_descripcion
         FROM transactions t LEFT JOIN payment_links pl ON pl.id = t.payment_link_id
        WHERE ${where}
        ORDER BY COALESCE(t.completado_at, t.created_at) DESC
        LIMIT $${params.length}`, params);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/contactos/:id/statement.pdf', async (req, res, next) => {
  try {
    const { from, to, include, fee_pct, links } = req.query;
    const includeSet = new Set(String(include || '').split(',').map(s => s.trim()).filter(Boolean));
    // El Fee PayBridge SIEMPRE figura en el PDF (aunque sea 0%). Si no se especifica → 0%.
    const feePctPayBridge = Math.max(0, Math.min(100, Number(fee_pct) || 0));
    const linksFilters = String(links || '').split(',').map(s => s.trim()).filter(Boolean);
    // linksFilters puede ser ['activos'], ['inactivos'] o ambos. Si está vacío, no se incluye la sección.

    const c = await req.tdb.query(`SELECT * FROM contactos WHERE id = $1`, [req.params.id]);
    if (!c.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    const cliente = c.rows[0];

    const stats = await buildClientStats(req.tdb, req.params.id, from || null, to || null);

    const params = [req.params.id];
    let where = `contacto_id = $1 AND estado = 'completado'`;
    if (from) { params.push(from); where += ` AND COALESCE(completado_at, created_at) >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND COALESCE(completado_at, created_at) <= $${params.length}`; }
    const txs = await req.tdb.query(
      `SELECT * FROM transactions WHERE ${where}
        ORDER BY COALESCE(completado_at, created_at) ASC`, params);

    const fmtPeriodo = (d) => d ? new Date(d).toLocaleDateString('es-AR') : '—';
    const fmtMoney = (v, c) => {
      try { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: c || 'USD' }).format(Number(v || 0)); }
      catch { return `${c || ''} ${Number(v || 0).toFixed(2)}`; }
    };

    // ── Liquidación final: Bruto → Subtotal (post Stripe) → Neto (post DolarApp + PayBridge)
    //
    // Por cada moneda:
    //   subtotal       = Bruto - Fee Stripe   (lo que liquida Stripe)
    //   fee_paybridge  = subtotal * (feePctPayBridge / 100)
    //   fee_dolarapp   = 3 (solo en USD, una vez por liquidación)
    //   neto_final     = subtotal - fee_paybridge - fee_dolarapp
    //
    // El descuento de DolarApp (USD 3) se aplica una sola vez sobre la fila USD.
    const DOLARAPP_FEE_USD = stats.por_moneda.length ? 3 : 0;
    let usdSeen = false;
    const liquidacionPorMoneda = stats.por_moneda.map(m => {
      const subtotal = Number(m.neto); // el campo `neto` del stats es "neto Stripe" = subtotal en la nueva nomenclatura
      const feePb = +(subtotal * (feePctPayBridge / 100)).toFixed(2);
      let feeDa = 0;
      if (m.moneda === 'USD' && !usdSeen) { feeDa = DOLARAPP_FEE_USD; usdSeen = true; }
      const netoFinal = +(subtotal - feePb - feeDa).toFixed(2);
      return {
        moneda: m.moneda,
        subtotal,
        fee_paybridge: feePb,
        fee_dolarapp: feeDa,
        neto_final: netoFinal,
      };
    });
    const liquidacion = stats.por_moneda.length
      ? {
          por_moneda: liquidacionPorMoneda,
          dolarapp_fee_usd: DOLARAPP_FEE_USD,
          paybridge_fee_pct: feePctPayBridge,
          mostrar_paybridge_fee: true,  // siempre visible, aunque sea 0%
        }
      : null;

    // ── KPIs e insights opcionales según ?include= ──────────────────────
    const kpis = {};
    const insights = {};
    const principal = stats.por_moneda[0] || null;
    const totalBruto = stats.por_moneda.reduce((s, m) => s + Number(m.bruto), 0);

    if (includeSet.has('avg') && principal) {
      kpis.avg = {
        moneda: principal.moneda,
        str: fmtMoney(principal.promedio, principal.moneda),
      };
    }
    if (includeSet.has('topCurrency') && principal && totalBruto > 0) {
      kpis.topCurrency = {
        moneda: principal.moneda,
        cantidad: principal.cantidad,
        pct: Math.round((Number(principal.bruto) / totalBruto) * 100),
      };
    }
    if (includeSet.has('topCountry') && stats.por_pais.length) {
      const top = stats.por_pais[0];
      const totalCobros = stats.por_pais.reduce((s, p) => s + Number(p.cantidad), 0);
      kpis.topCountry = {
        pais: top.pais,
        cantidad: top.cantidad,
        pct: totalCobros ? Math.round((top.cantidad / totalCobros) * 100) : 0,
      };
    }
    if (includeSet.has('peakMonth') && stats.por_mes.length) {
      const peak = [...stats.por_mes].sort((a, b) => Number(b.bruto) - Number(a.bruto))[0];
      kpis.peakMonth = {
        mes: peak.mes,
        bruto_str: fmtMoney(peak.bruto, peak.moneda),
      };
    }
    if (includeSet.has('dailyAvg') && principal && from && to) {
      const days = Math.max(1, Math.ceil((new Date(to) - new Date(from)) / 86400000));
      kpis.dailyAvg = {
        str: fmtMoney(Number(principal.bruto) / days, principal.moneda),
        dias: days,
      };
    }
    if (includeSet.has('trend') && from && to && principal) {
      const ms = new Date(to) - new Date(from);
      const prevTo = new Date(new Date(from).getTime() - 1);
      const prevFrom = new Date(prevTo.getTime() - ms);
      const prev = await buildClientStats(req.tdb, req.params.id, prevFrom.toISOString(), prevTo.toISOString());
      const actualBruto = principal.bruto;
      const prevBruto = (prev.por_moneda.find(m => m.moneda === principal.moneda) || {}).bruto || 0;
      const delta = Number(prevBruto) > 0
        ? ((Number(actualBruto) - Number(prevBruto)) / Number(prevBruto)) * 100
        : (Number(actualBruto) > 0 ? 100 : 0);
      kpis.trend = {
        positive: delta >= 0,
        signo: delta >= 0 ? '+' : '',
        pct: delta.toFixed(1),
        previo_str: fmtMoney(prevBruto, principal.moneda),
        actual_str: fmtMoney(actualBruto, principal.moneda),
      };
    }

    if (includeSet.has('top3') && txs.rows.length) {
      insights.top3 = [...txs.rows]
        .sort((a, b) => Number(b.monto_bruto) - Number(a.monto_bruto))
        .slice(0, 3)
        .map(t => ({
          fecha: t.completado_at || t.created_at,
          moneda: t.moneda,
          bruto: Number(t.monto_bruto),
          pais: t.card_address_country || t.country || '—',
        }));
    }
    if (includeSet.has('cardBrand') && txs.rows.length) {
      const counts = {};
      txs.rows.forEach(t => {
        const b = (t.card_brand || 'desconocida').toLowerCase();
        counts[b] = (counts[b] || 0) + 1;
      });
      const total = txs.rows.length;
      insights.cardBrand = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([brand, n]) => ({ brand, cantidad: n, pct: Math.round((n / total) * 100) }));
    }
    if (includeSet.has('weekday') && txs.rows.length) {
      const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const buckets = dias.map(d => ({ dia: d, cantidad: 0, bruto_usd: 0 }));
      txs.rows.forEach(t => {
        const d = new Date(t.completado_at || t.created_at);
        if (isNaN(d)) return;
        const i = d.getDay();
        buckets[i].cantidad++;
        // Solo sumo USD; los importes en otras monedas quedan fuera para no inventar conversión.
        if ((t.moneda || '').toUpperCase() === 'USD') buckets[i].bruto_usd += Number(t.monto_bruto);
      });
      // Reordeno lunes→domingo
      insights.weekday = [...buckets.slice(1), buckets[0]].filter(b => b.cantidad > 0);
    }
    if (includeSet.has('avgPerCurrency') && stats.por_moneda.length) {
      const txByCur = {};
      txs.rows.forEach(t => {
        const k = t.moneda || 'USD';
        (txByCur[k] = txByCur[k] || []).push(Number(t.monto_bruto));
      });
      insights.avgPerCurrency = stats.por_moneda.map(m => {
        const arr = (txByCur[m.moneda] || []).sort((a, b) => a - b);
        const mediana = arr.length ? arr[Math.floor(arr.length / 2)] : 0;
        return {
          moneda: m.moneda,
          cantidad: m.cantidad,
          promedio: Number(m.promedio),
          mediana,
        };
      });
    }

    // Cuadro DolarApp/ARQ del PDF: lista campos solo si hay datos
    const daKeys = ['titular', 'alias', 'cvu', 'cbu', 'numero_cuenta', 'email'];
    const dolarapp_info = daKeys.reduce((acc, k) => {
      const v = cliente['dolarapp_' + k];
      if (v) acc[k] = v;
      return acc;
    }, {});
    dolarapp_info.has_data = Object.keys(dolarapp_info).length > 0;

    // Sección "Links de pago" opcional. Se incluye si linksFilters tiene al menos un valor.
    let linksData = null;
    if (linksFilters.length) {
      const conds = ['contacto_id = $1'];
      const condParams = [req.params.id];
      const wantActivos = linksFilters.includes('activos');
      const wantInactivos = linksFilters.includes('inactivos');
      if (wantActivos && !wantInactivos) conds.push(`estado = 'activo'`);
      else if (wantInactivos && !wantActivos) conds.push(`estado <> 'activo'`);
      const linksRes = await req.tdb.query(
        `SELECT pl.slug, pl.descripcion, pl.monto, pl.moneda, pl.estado,
                pl.fee_calculado, pl.monto_neto, pl.multi_uso, pl.expira_at,
                pl.created_at,
                (SELECT COUNT(*)::int FROM transactions t
                   WHERE t.payment_link_id = pl.id AND t.estado = 'completado') AS cobros_completados,
                (SELECT COALESCE(SUM(t.monto_bruto), 0) FROM transactions t
                   WHERE t.payment_link_id = pl.id AND t.estado = 'completado') AS bruto_acumulado
           FROM payment_links pl
          WHERE ${conds.join(' AND ')}
          ORDER BY pl.created_at DESC`,
        condParams
      );
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      linksData = {
        rows: linksRes.rows.map((r, i) => ({
          ...r,
          label: `Link ${i + 1}`,
          url: `${baseUrl}/pay/${r.slug}`,
          activo: r.estado === 'activo',
        })),
        muestra_activos: wantActivos,
        muestra_inactivos: wantInactivos,
        titulo: wantActivos && wantInactivos ? 'Links de pago (todos)'
              : wantActivos ? 'Links de pago activos'
              : 'Links de pago inactivos',
      };
    }

    // % Fee efectivo por moneda (fee / bruto * 100)
    const porMonedaConPct = stats.por_moneda.map(m => ({
      ...m,
      fee_pct: Number(m.bruto) > 0 ? (Number(m.fee) / Number(m.bruto) * 100).toFixed(2) : '0.00',
    }));

    // % Fee individual por transacción
    const txsConPct = txs.rows.map(t => ({
      ...t,
      fee_pct: Number(t.monto_bruto) > 0
        ? (Number(t.fee) / Number(t.monto_bruto) * 100).toFixed(2)
        : '0.00',
    }));

    const pdf = await renderStatement({
      cliente,
      dolarapp_info,
      fecha: new Date().toLocaleDateString('es-AR'),
      periodo: { desde: fmtPeriodo(from), hasta: fmtPeriodo(to) },
      totales: {
        cantidad: stats.totales.cantidad,
        monedas: stats.totales.monedas_count,
        paises: stats.totales.paises_count,
      },
      kpis,
      insights,
      por_moneda: porMonedaConPct,
      liquidacion,
      links: linksData,
      transactions: txsConPct,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="estado-cuenta-${(cliente.product_key || cliente.id)}.pdf"`
    );
    res.send(pdf);
  } catch (e) { next(e); }
});

module.exports = router;
