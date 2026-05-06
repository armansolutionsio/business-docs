// /api/arca/* — endpoints transversales del facturador electrónico (mock).
// Disponibles para Travel y Tech (cualquier vertical que emita facturas A/B/C).

const express = require('express');
const router = express.Router();
const arca = require('../services/arcaClient');
const db = require('../utils/db');

// Health del servicio ARCA
router.get('/ping', async (req, res, next) => {
  try { res.json(await arca.ping()); } catch (e) { next(e); }
});

// Solicitar CAE manual (debug / reintento)
router.post('/solicitar-cae', async (req, res, next) => {
  try {
    const r = await arca.solicitarCAE(req.body);
    res.json(r);
  } catch (e) { next(e); }
});

// Consultar comprobante existente
router.get('/comprobante', async (req, res, next) => {
  try {
    const { tipo, puntoVenta, numero } = req.query;
    res.json(await arca.consultarComprobante({ tipo, puntoVenta: Number(puntoVenta), numero: Number(numero) }));
  } catch (e) { next(e); }
});

// Activador: aplica CAE a una factura existente del schema indicado.
// POST /api/arca/facturas/:vertical/:id/cae
// vertical ∈ {travel, tech}
router.post('/facturas/:vertical/:id/cae', async (req, res, next) => {
  const map = { travel: 'public', tech: 'tech' };
  const schema = map[req.params.vertical];
  if (!schema) return res.status(400).json({ error: 'Vertical no soportada para facturación' });
  const id = Number(req.params.id);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL search_path TO ${schema}, public`);
    const { rows } = await client.query(`SELECT * FROM facturas WHERE id = $1`, [id]);
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Factura no encontrada' }); }
    const f = rows[0];
    if (f.cae) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Factura ya tiene CAE', cae: f.cae }); }

    const cae = await arca.solicitarCAE({
      tipo: f.tipo || 'B',
      puntoVenta: f.punto_venta || 1,
      total: Number(f.total || 0),
      neto: Number(f.subtotal || 0),
      iva: Number(f.iva || 0),
      fecha: new Date().toISOString().slice(0, 10),
      moneda: f.moneda === 'ARS' ? 'PES' : 'DOL',
      cuitReceptor: (f.cliente_snapshot && f.cliente_snapshot.cuit) || null,
    });

    const numeroCompleto = cae.numero_completo;
    const upd = await client.query(
      `UPDATE facturas SET cae = $1, cae_vencimiento = $2, cae_solicitado_at = NOW(),
              arca_response = $3::jsonb, numero = COALESCE(numero, $4), estado = 'autorizada', updated_at = NOW()
         WHERE id = $5 RETURNING *`,
      [cae.cae, cae.cae_vencimiento, JSON.stringify(cae), numeroCompleto, id]
    );
    await client.query('COMMIT');
    res.json({ ok: true, factura: upd.rows[0], cae });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

module.exports = router;
