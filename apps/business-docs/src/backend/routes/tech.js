// Arman Tech — CRM para consultora de software.
// Schema: tech. Comparte modelo de docs (cotizaciones/facturas/recibos)
// con extras propios: proyectos, hitos, time_entries, retainers.

const express = require('express');
const { tenantMiddleware } = require('../utils/tenant');
const arca = require('../services/arcaClient');
const pdf = require('../services/pdfRenderer');
const { buildCrmRouter } = require('./crmCommon');
const { validateBody } = require('../utils/validate');

const router = express.Router();
router.use(tenantMiddleware('tech'));

// CRM generico (notas, tareas, oportunidades, timeline) sobre el schema tech
router.use('/crm', buildCrmRouter());

// ── PDF render (cotizacion / factura / recibo) ─────────────────────
async function fetchDocWithItems(req, table, itemsTable, fkCol) {
  const head = (await req.tdb.query(
    `SELECT d.*, c.nombre AS cliente_nombre, c.razon_social AS cliente_rs, c.cuit AS cliente_cuit,
            c.email AS cliente_email, c.condicion_iva AS cliente_iva, c.direccion AS cliente_direccion
       FROM ${table} d LEFT JOIN contactos c ON c.id = d.contacto_id WHERE d.id = $1`,
    [req.params.id]
  )).rows[0];
  if (!head) return null;
  let items = [];
  if (itemsTable) {
    items = (await req.tdb.query(
      `SELECT * FROM ${itemsTable} WHERE ${fkCol} = $1 ORDER BY id`,
      [req.params.id]
    )).rows;
  }
  return { ...head, items, cliente: {
    nombre: head.cliente_nombre, razon_social: head.cliente_rs, cuit: head.cliente_cuit,
    email: head.cliente_email, condicion_iva: head.cliente_iva, direccion: head.cliente_direccion,
  }};
}

router.get('/cotizaciones/:id/pdf', async (req, res, next) => {
  try {
    const doc = await fetchDocWithItems(req, 'cotizaciones', 'cotizacion_items', 'cotizacion_id');
    if (!doc) return res.status(404).json({ error: 'Cotizacion no encontrada' });
    const buf = await pdf.renderCotizacion({
      ...doc,
      fecha: new Date(doc.created_at).toLocaleDateString('es-AR'),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="cotizacion-${doc.numero || doc.id}.pdf"`);
    res.send(buf);
  } catch (e) { next(e); }
});

router.get('/facturas/:id/pdf', async (req, res, next) => {
  try {
    const doc = await fetchDocWithItems(req, 'facturas', 'factura_items', 'factura_id');
    if (!doc) return res.status(404).json({ error: 'Factura no encontrada' });
    const buf = await pdf.renderFactura({
      ...doc,
      fecha: new Date(doc.created_at).toLocaleDateString('es-AR'),
      cae_vencimiento: doc.cae_vencimiento ? new Date(doc.cae_vencimiento).toLocaleDateString('es-AR') : null,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="factura-${doc.numero || doc.id}.pdf"`);
    res.send(buf);
  } catch (e) { next(e); }
});

router.get('/recibos/:id/pdf', async (req, res, next) => {
  try {
    const doc = await fetchDocWithItems(req, 'recibos', null, null);
    if (!doc) return res.status(404).json({ error: 'Recibo no encontrado' });
    const buf = await pdf.renderRecibo({
      ...doc,
      fecha: new Date(doc.created_at).toLocaleDateString('es-AR'),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="recibo-${doc.numero || doc.id}.pdf"`);
    res.send(buf);
  } catch (e) { next(e); }
});

// ── Helpers ────────────────────────────────────────────────────────────
const num = (v, d = 0) => (v === '' || v == null ? d : Number(v));

// ── Contactos (clientes tech) ──────────────────────────────────────────
router.get('/contactos', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(
      `SELECT * FROM contactos ORDER BY created_at DESC LIMIT 500`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/contactos', validateBody({
  nombre: { type: 'string', required: true, max: 200 },
  email:  { type: 'string', max: 200, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ },
  cuit:   { type: 'string', max: 20 },
  telefono: { type: 'string', max: 50 },
  estado: { type: 'string', in: ['nuevo','contactado','calificado','cotizado','negociacion','ganado','perdido'] },
}), async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await req.tdb.query(
      `INSERT INTO contactos (nombre, razon_social, cuit, email, telefono, direccion,
        ciudad, pais, condicion_iva, estado, rol, etiquetas, notas, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14::jsonb)
       RETURNING *`,
      [b.nombre, b.razon_social, b.cuit, b.email, b.telefono, b.direccion,
       b.ciudad, b.pais || 'Argentina', b.condicion_iva, b.estado || 'nuevo',
       b.rol || 'lead', JSON.stringify(b.etiquetas || []), b.notas,
       JSON.stringify(b.metadata || {})]
    );
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
    const b = req.body;
    const fields = []; const params = []; let i = 1;
    for (const k of ['nombre','razon_social','cuit','email','telefono','direccion','ciudad','pais','condicion_iva','estado','rol','notas']) {
      if (b[k] !== undefined) { fields.push(`${k} = $${i++}`); params.push(b[k]); }
    }
    if (b.etiquetas !== undefined) { fields.push(`etiquetas = $${i++}::jsonb`); params.push(JSON.stringify(b.etiquetas)); }
    if (b.metadata !== undefined)  { fields.push(`metadata = $${i++}::jsonb`);  params.push(JSON.stringify(b.metadata)); }
    if (!fields.length) return res.status(400).json({ error: 'Sin cambios' });
    fields.push(`updated_at = NOW()`); params.push(req.params.id);
    const { rows } = await req.tdb.query(
      `UPDATE contactos SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, params);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// ── Proyectos ──────────────────────────────────────────────────────────
router.get('/proyectos', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(
      `SELECT p.*, c.nombre AS cliente_nombre
         FROM proyectos p LEFT JOIN contactos c ON c.id = p.contacto_id
        ORDER BY p.created_at DESC`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/proyectos', async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await req.tdb.query(
      `INSERT INTO proyectos (contacto_id, nombre, tipo, estado, modalidad, hourly_rate,
        moneda, presupuesto, fecha_inicio, fecha_fin_estim, repo_url, stack, descripcion, nda_firmado, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15::jsonb)
       RETURNING *`,
      [b.contacto_id, b.nombre, b.tipo || 'desarrollo', b.estado || 'descubrimiento',
       b.modalidad || 'fixed_price', num(b.hourly_rate, null), b.moneda || 'USD',
       num(b.presupuesto, null), b.fecha_inicio || null, b.fecha_fin_estim || null,
       b.repo_url, JSON.stringify(b.stack || []), b.descripcion,
       !!b.nda_firmado, JSON.stringify(b.metadata || {})]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.get('/proyectos/:id', async (req, res, next) => {
  try {
    const p = await req.tdb.query(`SELECT * FROM proyectos WHERE id = $1`, [req.params.id]);
    if (!p.rows.length) return res.status(404).json({ error: 'No encontrado' });
    const hitos = await req.tdb.query(`SELECT * FROM hitos WHERE proyecto_id = $1 ORDER BY orden, id`, [req.params.id]);
    const horas = await req.tdb.query(
      `SELECT COALESCE(SUM(horas),0) AS total, COALESCE(SUM(horas) FILTER (WHERE facturable),0) AS facturables,
              COALESCE(SUM(horas) FILTER (WHERE facturado),0) AS facturadas
         FROM time_entries WHERE proyecto_id = $1`, [req.params.id]);
    res.json({ ...p.rows[0], hitos: hitos.rows, horas: horas.rows[0] });
  } catch (e) { next(e); }
});

router.patch('/proyectos/:id', async (req, res, next) => {
  try {
    const b = req.body;
    const fields = []; const params = []; let i = 1;
    for (const k of ['nombre','tipo','estado','modalidad','hourly_rate','moneda','presupuesto',
                     'fecha_inicio','fecha_fin_estim','repo_url','descripcion','nda_firmado']) {
      if (b[k] !== undefined) { fields.push(`${k} = $${i++}`); params.push(b[k]); }
    }
    if (b.stack !== undefined)    { fields.push(`stack = $${i++}::jsonb`); params.push(JSON.stringify(b.stack)); }
    if (b.metadata !== undefined) { fields.push(`metadata = $${i++}::jsonb`); params.push(JSON.stringify(b.metadata)); }
    if (!fields.length) return res.status(400).json({ error: 'Sin cambios' });
    fields.push(`updated_at = NOW()`); params.push(req.params.id);
    const { rows } = await req.tdb.query(
      `UPDATE proyectos SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, params);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// ── Hitos ──────────────────────────────────────────────────────────────
router.post('/proyectos/:id/hitos', async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await req.tdb.query(
      `INSERT INTO hitos (proyecto_id, titulo, descripcion, monto, moneda, fecha_objetivo, estado, orden)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, b.titulo, b.descripcion, num(b.monto, null), b.moneda || 'USD',
       b.fecha_objetivo || null, b.estado || 'pendiente', num(b.orden, 0)]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.patch('/hitos/:id', async (req, res, next) => {
  try {
    const b = req.body;
    const fields = []; const params = []; let i = 1;
    for (const k of ['titulo','descripcion','monto','moneda','fecha_objetivo','fecha_entrega','estado','orden']) {
      if (b[k] !== undefined) { fields.push(`${k} = $${i++}`); params.push(b[k]); }
    }
    if (!fields.length) return res.status(400).json({ error: 'Sin cambios' });
    params.push(req.params.id);
    const { rows } = await req.tdb.query(
      `UPDATE hitos SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, params);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// ── Time entries ───────────────────────────────────────────────────────
router.get('/proyectos/:id/time', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(
      `SELECT * FROM time_entries WHERE proyecto_id = $1 ORDER BY fecha DESC, id DESC`, [req.params.id]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/proyectos/:id/time', async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await req.tdb.query(
      `INSERT INTO time_entries (proyecto_id, fecha, horas, descripcion, facturable, usuario)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, b.fecha || new Date().toISOString().slice(0, 10), num(b.horas, 0),
       b.descripcion, b.facturable !== false, b.usuario || 'admin']
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// ── Retainers ──────────────────────────────────────────────────────────
router.get('/retainers', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(
      `SELECT r.*, c.nombre AS cliente_nombre
         FROM retainers r LEFT JOIN contactos c ON c.id = r.contacto_id
        ORDER BY r.id DESC`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/retainers', async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await req.tdb.query(
      `INSERT INTO retainers (contacto_id, nombre, horas_mes, monto_mes, moneda, inicio, fin, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.contacto_id, b.nombre, num(b.horas_mes, 0), num(b.monto_mes, 0),
       b.moneda || 'USD', b.inicio || null, b.fin || null, b.estado || 'activo']
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// ── Cotizaciones ───────────────────────────────────────────────────────
router.get('/cotizaciones', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(
      `SELECT c.*, ct.nombre AS cliente_nombre FROM cotizaciones c
         LEFT JOIN contactos ct ON ct.id = c.contacto_id
        ORDER BY c.created_at DESC LIMIT 500`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/cotizaciones', async (req, res, next) => {
  try {
    const b = req.body;
    const result = await req.tdb.tx(async (cli) => {
      const seqRow = await cli.query(`SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM cotizaciones`);
      const seq = seqRow.rows[0].seq;
      const numero = `COT-TECH-${String(seq).padStart(6, '0')}`;
      const subtotal = (b.items || []).reduce((s, it) => s + num(it.cantidad, 1) * num(it.precio_unitario, 0), 0);
      const iva = (b.items || []).reduce((s, it) => s + num(it.cantidad, 1) * num(it.precio_unitario, 0) * num(it.iva_pct, 0) / 100, 0);
      const total = subtotal + iva;
      const cot = await cli.query(
        `INSERT INTO cotizaciones (contacto_id, numero, seq, estado, moneda, subtotal, iva, total,
            validez_dias, detalle_categorias, cliente_snapshot, metadata)
         VALUES ($1,$2,$3,'borrador',$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb)
         RETURNING *`,
        [b.contacto_id, numero, seq, b.moneda || 'USD', subtotal, iva, total,
         num(b.validez_dias, 15), JSON.stringify(b.detalle_categorias || null),
         JSON.stringify(b.cliente_snapshot || {}), JSON.stringify(b.metadata || {})]);
      for (const it of (b.items || [])) {
        const it_total = num(it.cantidad, 1) * num(it.precio_unitario, 0) * (1 + num(it.iva_pct, 0) / 100);
        await cli.query(
          `INSERT INTO cotizacion_items (cotizacion_id, descripcion, categoria, cantidad, unidad, precio_unitario, iva_pct, total, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
          [cot.rows[0].id, it.descripcion, it.categoria, num(it.cantidad, 1), it.unidad,
           num(it.precio_unitario, 0), num(it.iva_pct, 0), it_total, JSON.stringify(it.metadata || {})]);
      }
      return cot.rows[0];
    });
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.get('/cotizaciones/:id', async (req, res, next) => {
  try {
    const c = await req.tdb.query(`SELECT * FROM cotizaciones WHERE id = $1`, [req.params.id]);
    if (!c.rows.length) return res.status(404).json({ error: 'No encontrada' });
    const items = await req.tdb.query(`SELECT * FROM cotizacion_items WHERE cotizacion_id = $1`, [req.params.id]);
    res.json({ ...c.rows[0], items: items.rows });
  } catch (e) { next(e); }
});

// ── Facturas (con activador ARCA) ──────────────────────────────────────
router.get('/facturas', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(
      `SELECT f.*, c.nombre AS cliente_nombre FROM facturas f
         LEFT JOIN contactos c ON c.id = f.contacto_id
        ORDER BY f.created_at DESC LIMIT 500`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/facturas', async (req, res, next) => {
  try {
    const b = req.body;
    const result = await req.tdb.tx(async (cli) => {
      const seqRow = await cli.query(`SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM facturas`);
      const seq = seqRow.rows[0].seq;
      const subtotal = (b.items || []).reduce((s, it) => s + num(it.cantidad, 1) * num(it.precio_unitario, 0), 0);
      const iva = (b.items || []).reduce((s, it) => s + num(it.cantidad, 1) * num(it.precio_unitario, 0) * num(it.iva_pct, 21) / 100, 0);
      const total = subtotal + iva;
      const f = await cli.query(
        `INSERT INTO facturas (contacto_id, seq, tipo, punto_venta, estado, moneda, subtotal, iva, total, cliente_snapshot, metadata)
         VALUES ($1,$2,$3,$4,'borrador',$5,$6,$7,$8,$9::jsonb,$10::jsonb)
         RETURNING *`,
        [b.contacto_id, seq, b.tipo || 'B', num(b.punto_venta, 1), b.moneda || 'ARS',
         subtotal, iva, total, JSON.stringify(b.cliente_snapshot || {}), JSON.stringify(b.metadata || {})]);
      for (const it of (b.items || [])) {
        await cli.query(
          `INSERT INTO factura_items (factura_id, descripcion, cantidad, precio_unitario, iva_pct, total)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [f.rows[0].id, it.descripcion, num(it.cantidad, 1), num(it.precio_unitario, 0),
           num(it.iva_pct, 21), num(it.cantidad, 1) * num(it.precio_unitario, 0) * (1 + num(it.iva_pct, 21) / 100)]);
      }
      return f.rows[0];
    });

    // Si viene autorizar=true, solicita CAE inmediatamente
    if (req.body.autorizar) {
      try {
        const cae = await arca.solicitarCAE({
          tipo: result.tipo, puntoVenta: result.punto_venta, total: result.total,
          neto: result.subtotal, iva: result.iva, fecha: new Date().toISOString().slice(0, 10),
          moneda: result.moneda === 'ARS' ? 'PES' : 'DOL',
        });
        const upd = await req.tdb.query(
          `UPDATE facturas SET cae=$1, cae_vencimiento=$2, cae_solicitado_at=NOW(),
                  arca_response=$3::jsonb, numero=$4, estado='autorizada', updated_at=NOW()
             WHERE id=$5 RETURNING *`,
          [cae.cae, cae.cae_vencimiento, JSON.stringify(cae), cae.numero_completo, result.id]);
        return res.status(201).json({ factura: upd.rows[0], cae });
      } catch (caeErr) {
        return res.status(201).json({ factura: result, cae_error: caeErr.message });
      }
    }
    res.status(201).json({ factura: result });
  } catch (e) { next(e); }
});

// ── Recibos ────────────────────────────────────────────────────────────
router.get('/recibos', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(
      `SELECT r.*, c.nombre AS cliente_nombre FROM recibos r
         LEFT JOIN contactos c ON c.id = r.contacto_id
        WHERE r.estado != 'borrado' OR r.estado IS NULL
        ORDER BY r.created_at DESC LIMIT 500`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/recibos', async (req, res, next) => {
  try {
    const b = req.body;
    const result = await req.tdb.tx(async (cli) => {
      const seqRow = await cli.query(`SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM recibos`);
      const seq = seqRow.rows[0].seq;
      const numero = `REC-TECH-${String(seq).padStart(6, '0')}`;
      const r = await cli.query(
        `INSERT INTO recibos (contacto_id, numero, seq, monto, moneda, metodo, concepto, estado, cliente_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'activo',$8::jsonb) RETURNING *`,
        [b.contacto_id, numero, seq, num(b.monto, 0), b.moneda || 'USD',
         b.metodo, b.concepto, JSON.stringify(b.cliente_snapshot || {})]);
      return r.rows[0];
    });
    res.status(201).json(result);
  } catch (e) { next(e); }
});

// ── Dashboard tech ─────────────────────────────────────────────────────
router.get('/dashboard', async (req, res, next) => {
  try {
    const m = await req.tdb.query(`
      SELECT
        (SELECT COUNT(*) FROM contactos)         AS contactos,
        (SELECT COUNT(*) FROM proyectos WHERE estado NOT IN ('cerrado','cancelado')) AS proyectos_activos,
        (SELECT COUNT(*) FROM cotizaciones WHERE estado = 'enviada') AS cotizaciones_pendientes,
        (SELECT COUNT(*) FROM facturas WHERE cae IS NULL AND estado != 'anulada') AS facturas_sin_cae,
        (SELECT COALESCE(SUM(total),0) FROM facturas WHERE estado = 'autorizada' AND created_at > NOW() - INTERVAL '30 days') AS facturado_30d,
        (SELECT COALESCE(SUM(horas),0) FROM time_entries WHERE fecha > CURRENT_DATE - 30) AS horas_30d
    `);
    res.json(m.rows[0]);
  } catch (e) { next(e); }
});

module.exports = router;
