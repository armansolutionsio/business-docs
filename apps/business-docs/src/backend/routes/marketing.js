// Arman Marketing: estado de Meta (pagina, Instagram, cuenta publicitaria, campanas) y fal.ai.
// Version 1: solo lectura. No genera imagenes, no crea campanas y no gasta plata.
// Galeria: GET /media (lista) y GET /media/file/:name (archivo, con el mismo JWT).
// Cache de 5 minutos; ?refresh=1 fuerza una lectura nueva.

const express = require('express');
const { requireVertical } = require('../utils/auth');
const metaAds = require('../utils/metaAds');
const falAi = require('../utils/falAi');
const marketingMedia = require('../utils/marketingMedia');

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

router.get('/media/file/:name', (req, res) => {
  const full = marketingMedia.resolveFile(req.params.name);
  if (!full) return res.status(404).json({ error: 'Archivo no encontrado' });
  res.sendFile(full);
});

module.exports = router;
