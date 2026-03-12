const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const log = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Request ID ────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

// ── Request logger ────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    log.info(req, 'http', {
      status: res.statusCode,
      ms: Date.now() - start,
    });
  });
  next();
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../../public')));

// ── Routes ────────────────────────────────────────────────────────────────────
const documentRoutes = require('./routes/documents');
const clientRoutes   = require('./routes/clients');

app.use('/api/documents', documentRoutes);
app.use('/api/clients', clientRoutes);

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  log.error(req, 'unhandled_error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: err.message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
// Only bind the port if this file is run directly (not required by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    log.info('server_started', { port: PORT, env: process.env.NODE_ENV || 'development' });
  });
}

module.exports = app;
