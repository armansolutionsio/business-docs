// Arman Marketing: estado de Meta (pagina, Instagram, cuenta publicitaria, campanas) y fal.ai.
// No genera imagenes, no crea campanas y no gasta plata.
// Galeria: GET /media (lista), GET /media/file/:name (archivo, con el mismo JWT) y POST /media/upload.
// Instagram: GET /instagram (estado + historial) y POST /instagram/publish (publico, exige confirm:true).
// Cache de 5 minutos; ?refresh=1 fuerza una lectura nueva.

const express = require('express');
const { requireVertical } = require('../utils/auth');
const metaAds = require('../utils/metaAds');
const falAi = require('../utils/falAi');
const marketingMedia = require('../utils/marketingMedia');
const instagram = require('../utils/instagramPublish');
const generate = require('../utils/marketingGenerate');

generate.resume();

const router = express.Router();
router.use(requireVertical('marketing'));

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = null;

router.get('/', async (req, res, next) => {
  try {
    const force = req.query.refresh === '1';
    if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return res.json(cache.data);
    const [meta, fal] = await Promise.all([metaAds.overview(), falAi.overview()]);
    const data = { collectedAt: new Date().toISOString(), meta, fal };
    cache = { at: Date.now(), data };
    res.json(data);
  } catch (err) { next(err); }
});

// Galeria de piezas (sin cache: es una lectura de disco).
router.get('/media', (req, res) => {
  res.json({ items: marketingMedia.list() });
});

// Subir una pieza: el cuerpo es el archivo crudo; los datos van en el header X-Pieza (JSON con encodeURIComponent).
router.post('/media/upload', express.raw({ type: () => true, limit: marketingMedia.MAX_BYTES }), (req, res) => {
  let meta;
  try { meta = JSON.parse(decodeURIComponent(req.get('X-Pieza') || '')); }
  catch { return res.status(400).json({ error: 'Faltan los datos de la pieza' }); }
  try {
    const entry = marketingMedia.add(req.body, { ...meta, by: req.user && req.user.email });
    res.json(entry);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/media/file/:name', (req, res) => {
  const full = marketingMedia.resolveFile(req.params.name);
  if (!full) return res.status(404).json({ error: 'Archivo no encontrado' });
  res.sendFile(full);
});

// Buscador sobre el catalogo completo de fal.ai (solo lectura, con precio en vivo de los resultados).
router.get('/fal/catalog', async (req, res) => {
  try {
    res.json(await falAi.searchCatalog({ q: String(req.query.q || '').slice(0, 80), category: String(req.query.category || '').slice(0, 40) }));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Gastos en IA: cuanto se gasto, en que modelo, que se pidio (prompt) y que salio. Solo lectura.
router.get('/fal/history', async (req, res) => {
  try {
    res.json(await falAi.spendHistory({ force: req.query.refresh === '1', pieces: marketingMedia.list() }));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Generar con IA: opciones, costo estimado, generar (gasta plata: confirm + costo visto) y registro.
router.get('/generate/options', (req, res) => {
  res.json({ groups: generate.publicModels(), cap: generate.MAX_USD(), refs: marketingMedia.list().filter((m) => ['imagen', 'captura', 'referencia'].includes(m.kind)).map((m) => ({ file: m.file, title: m.title, kind: m.kind })) });
});

router.post('/generate/estimate', (req, res) => {
  try { res.json(generate.estimate(req.body && req.body.model, req.body && req.body.options)); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.post('/generate', async (req, res) => {
  try {
    const row = await generate.start({ ...(req.body || {}), user: req.user && req.user.email });
    res.json(row);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/generate/jobs', async (req, res) => {
  try {
    const rows = await generate.listRows(50);
    const needCost = rows.some((r) => r.status === 'listo' && r.cost_usd == null);
    const hist = needCost ? await falAi.spendHistory({ pieces: marketingMedia.list() }).catch(() => null) : null;
    res.json({ items: await generate.withRealCost(rows, hist) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/instagram', (req, res) => {
  res.json({ ...instagram.status(), published: instagram.readLog() });
});

// Publicar es una accion publica e irreversible desde aca: solo con confirm === true.
router.post('/instagram/publish', async (req, res, next) => {
  try {
    const { file, caption, confirm } = req.body || {};
    if (confirm !== true) return res.status(400).json({ error: 'Falta la confirmación explícita para publicar' });
    const entry = await instagram.publish({ file, caption, user: req.user && req.user.email });
    cache = null;
    res.json(entry);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
