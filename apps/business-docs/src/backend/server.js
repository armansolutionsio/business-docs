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

// CRM SPA — serve pre-built dist under /crm
const crmDistPath = path.join(__dirname, '../../../crm-ui/dist');
app.use('/crm', express.static(crmDistPath));
app.get('/crm/{*splat}', (req, res) => {
  res.sendFile(path.join(crmDistPath, 'index.html'));
});

// ── Routes ────────────────────────────────────────────────────────────────────
const documentRoutes       = require('./routes/documents');
const clientRoutes         = require('./routes/clients');
const contactosRoutes      = require('./routes/contactos');
const notasRoutes          = require('./routes/contactos/notas');
const tareasRoutes         = require('./routes/contactos/tareas');
const conversacionesRoutes = require('./routes/contactos/conversaciones');
const oportunidadesRoutes  = require('./routes/contactos/oportunidades');
const timelineRoutes       = require('./routes/contactos/timeline');
const cotizacionesRoutes   = require('./routes/contactos/cotizaciones');
const ventasRoutes         = require('./routes/contactos/ventas');
const facturasRoutes       = require('./routes/contactos/facturas');
const pagosRoutes          = require('./routes/contactos/pagos');
const proveedoresRoutes    = require('./routes/proveedores');

// Quick cotizacion estado update (used by cotizador frontend)
const dbPool = require('./utils/db');
app.patch('/api/cotizaciones/:id/estado', async (req, res, next) => {
  try {
    const { estado } = req.body;
    const valid = ['borrador','enviada','aceptada','rechazada','vencida'];
    if (!valid.includes(estado)) return res.status(400).json({ error: 'Estado invalido' });
    const { rows } = await dbPool.query(
      'UPDATE cotizaciones SET estado = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [estado, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Cotizacion no encontrada' });
    // If aceptada, update contacto estado
    if (estado === 'aceptada' && rows[0].contacto_id) {
      await dbPool.query(`UPDATE contactos SET estado = 'negociacion', updated_at = NOW() WHERE id = $1 AND estado IN ('nuevo','contactado','calificado','cotizado')`, [rows[0].contacto_id]);
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

app.use('/api/documents', documentRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/contactos', contactosRoutes);
app.use('/api/contactos/:contactoId/notas', notasRoutes);
app.use('/api/contactos/:contactoId/tareas', tareasRoutes);
app.use('/api/contactos/:contactoId/conversaciones', conversacionesRoutes);
app.use('/api/contactos/:contactoId/oportunidades', oportunidadesRoutes);
app.use('/api/contactos/:contactoId/timeline', timelineRoutes);
app.use('/api/contactos/:contactoId/cotizaciones', cotizacionesRoutes);
app.use('/api/contactos/:contactoId/ventas', ventasRoutes);
app.use('/api/contactos/:contactoId/facturas', facturasRoutes);
app.use('/api/contactos/:contactoId/pagos', pagosRoutes);
app.use('/api/proveedores', proveedoresRoutes);

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
