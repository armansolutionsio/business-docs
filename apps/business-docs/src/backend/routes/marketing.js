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
