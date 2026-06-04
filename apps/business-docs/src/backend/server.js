const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const log = require('./utils/logger');

const app = express();
const PORT = 3000;

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.status(200).send('OK'));



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

// ── CORS (whitelist via env, vacio = abierto solo en dev) ────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const corsOpts = allowedOrigins.length
  ? {
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('Origin no permitido'));
      },
      credentials: true,
    }
  : {};
app.use(cors(corsOpts));
app.use(express.json({ limit: '50mb' }));

// ── Auth gate para /api/* (excepto login) ────────────────────────────────────
const { requireAuth } = require('./utils/auth');
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (req.path === '/api/auth/login') return next();
  if (req.path.startsWith('/api/auth/')) return next(); // /me y /change-password ya tienen requireAuth interno
  return requireAuth(req, res, next);
});

// Hub (landing) en /. El cotizador legacy queda accesible en /travel/.
const PUBLIC_DIR = path.join(__dirname, '../../public');
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'hub.html')));
app.get(['/travel', '/travel/'],       (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get(['/tech', '/tech/'],           (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'tech', 'index.html')));
app.get(['/paybridge', '/paybridge/'], (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'paybridge', 'index.html')));
app.get(['/admin', '/admin/'],         (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin', 'index.html')));

app.use(express.static(PUBLIC_DIR, { etag: false, maxAge: 0, index: false }));

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
const campaniasRoutes      = require('./routes/contactos/campanias');
const mailRoutes           = require('./routes/mail');
const mailTemplatesRoutes  = require('./routes/mailTemplates');
const dashboardRoutes      = require('./routes/dashboard');
const whatsappSyncRoutes   = require('./routes/whatsappSync');
const whatsappLeadsRoutes  = require('./routes/whatsappLeads');
const adminIaRoutes        = require('./routes/adminIa');
const voucherRoutes        = require('./routes/voucher');
const comprobantesRoutes   = require('./routes/comprobantes');
const techRoutes           = require('./routes/tech');
const paybridgeRoutes      = require('./routes/paybridge');
const adminCoreRoutes      = require('./routes/adminCore');
const arcaRoutes           = require('./routes/arca');

// Quick cotizacion estado update (used by cotizador frontend)
const dbPool = require('./utils/db');
app.patch('/api/cotizaciones/:id/estado', async (req, res, next) => {
  try {
    const { estado } = req.body;
    const valid = ['borrador','enviada','aceptada','rechazada','vencida','anulada'];
    if (!valid.includes(estado)) return res.status(400).json({ error: 'Estado invalido' });
    const { rows } = await dbPool.query(
      'UPDATE cotizaciones SET estado = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [estado, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Cotizacion no encontrada' });
    if (estado === 'aceptada' && rows[0].contacto_id) {
      await dbPool.query(`UPDATE contactos SET estado = 'negociacion', updated_at = NOW() WHERE id = $1 AND estado IN ('nuevo','contactado','calificado','cotizado')`, [rows[0].contacto_id]);
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Anular cotización (preserva correlatividad)
app.patch('/api/cotizaciones/:id/anular', async (req, res, next) => {
  try {
    const { motivo, usuario } = req.body;
    const { rows } = await dbPool.query(
      `UPDATE cotizaciones SET estado = 'anulada', anulado_at = NOW(), anulado_por = $2, motivo_anulacion = $3, updated_at = NOW()
       WHERE id = $1 AND estado != 'anulada' RETURNING *`,
      [req.params.id, usuario || 'admin', motivo || '']
    );
    if (!rows.length) return res.status(404).json({ error: 'Cotización no encontrada o ya anulada' });
    const { logAudit } = require('./utils/auditLog');
    await logAudit({ tabla: 'cotizaciones', registro_id: rows[0].id, accion: 'ANULAR', campo: 'estado', valor_anterior: rows[0].estado, valor_nuevo: 'anulada', usuario: usuario || 'admin' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Peek next receipt number (does not reserve)
app.get('/api/recibos/next-number', async (req, res, next) => {
  try {
    const { peekNextNumber } = require('./utils/docNumbering');
    const { seq, numero } = await peekNextNumber('recibos');
    res.json({ numero, seq });
  } catch (err) { next(err); }
});

// Anular recibo (preserva correlatividad)
app.patch('/api/recibos/:id/anular', async (req, res, next) => {
  try {
    const { motivo, usuario } = req.body;
    const { rows } = await dbPool.query(
      `UPDATE recibos SET estado = 'anulado', anulado_at = NOW(), anulado_por = $2, motivo_anulacion = $3
       WHERE id = $1 AND (estado IS NULL OR estado != 'anulado') RETURNING *`,
      [req.params.id, usuario || 'admin', motivo || '']
    );
    if (!rows.length) return res.status(404).json({ error: 'Recibo no encontrado o ya anulado' });
    // Revertir el pago asociado
    await dbPool.query(`UPDATE pagos SET estado = 'anulado' WHERE referencia = $1`, [rows[0].numero]);
    const { logAudit } = require('./utils/auditLog');
    await logAudit({ tabla: 'recibos', registro_id: rows[0].id, accion: 'ANULAR', usuario: usuario || 'admin' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Borrar (soft) cotización — copia a historial y la oculta de la lista, preservando el número
async function softDeleteDoc(tipo, id, motivo, usuario) {
  const table = tipo === 'cotizacion' ? 'cotizaciones' : 'recibos';
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    if (!rows.length) { await client.query('ROLLBACK'); return null; }
    const doc = rows[0];
    let payload = { ...doc };
    if (tipo === 'cotizacion') {
      const items = await client.query(`SELECT * FROM cotizacion_items WHERE cotizacion_id = $1`, [id]);
      payload.items = items.rows;
    }
    await client.query(
      `INSERT INTO documentos_borrados (tipo, doc_id, contacto_id, numero, motivo, usuario, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [tipo, id, doc.contacto_id, doc.numero, motivo || '', usuario || 'admin', JSON.stringify(payload)]
    );
    await client.query(`UPDATE ${table} SET estado = 'borrado' WHERE id = $1`, [id]);
    if (tipo === 'recibo') {
      await client.query(`UPDATE pagos SET estado = 'anulado' WHERE referencia = $1`, [doc.numero]);
    }
    await client.query('COMMIT');
    return doc;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

app.post('/api/cotizaciones/:id/borrar', async (req, res, next) => {
  try {
    const doc = await softDeleteDoc('cotizacion', req.params.id, req.body.motivo, req.body.usuario);
    if (!doc) return res.status(404).json({ error: 'Cotización no encontrada' });
    const { logAudit } = require('./utils/auditLog');
    await logAudit({ tabla: 'cotizaciones', registro_id: doc.id, accion: 'BORRAR', usuario: req.body.usuario || 'admin' });
    res.json({ ok: true, numero: doc.numero });
  } catch (err) { next(err); }
});

app.post('/api/recibos/:id/borrar', async (req, res, next) => {
  try {
    const doc = await softDeleteDoc('recibo', req.params.id, req.body.motivo, req.body.usuario);
    if (!doc) return res.status(404).json({ error: 'Recibo no encontrado' });
    const { logAudit } = require('./utils/auditLog');
    await logAudit({ tabla: 'recibos', registro_id: doc.id, accion: 'BORRAR', usuario: req.body.usuario || 'admin' });
    res.json({ ok: true, numero: doc.numero });
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
app.use('/api/contactos/:contactoId/campanias', campaniasRoutes);
// Recibos by contact
app.get('/api/contactos/:contactoId/recibos', async (req, res, next) => {
  try {
    const { rows } = await dbPool.query(
      `SELECT * FROM recibos WHERE contacto_id = $1 AND (estado IS NULL OR estado != 'borrado')
       ORDER BY created_at DESC`, [req.params.contactoId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});
app.use('/api/mail/templates', mailTemplatesRoutes);
app.use('/api/mail', mailRoutes);
app.use('/api/proveedores', proveedoresRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/whatsapp-sync', whatsappSyncRoutes);
app.use('/api/whatsapp-leads', whatsappLeadsRoutes);
app.use('/api/admin-ia', adminIaRoutes);
app.use('/api/voucher', voucherRoutes);
app.use('/api/comprobantes', comprobantesRoutes);

// ── Verticales nuevas ─────────────────────────────────────────────────────────
app.use('/api/tech',      techRoutes);
app.use('/api/paybridge', paybridgeRoutes);
app.use('/api/admin',     adminCoreRoutes);
app.use('/api/arca',      arcaRoutes);

// ── WA Import — receives file as base64 or rows as JSON ──────────────────────
app.post('/api/wa-import', async (req, res, next) => {
  try {
    let rows = req.body.rows;

    // If file sent as base64, parse it first
    if (!rows && req.body.fileData && req.body.fileName) {
      const XLSX = require('xlsx');
      const buf = Buffer.from(req.body.fileData, 'base64');
      const ext = path.extname(req.body.fileName).toLowerCase();

      let sheetRows;
      if (ext === '.csv' || ext === '.txt') {
        // Parse CSV from buffer
        const wb = XLSX.read(buf, { type: 'buffer' });
        sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      } else {
        // Parse XLSX/XLS
        const wb = XLSX.read(buf, { type: 'buffer' });
        sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      }

      if (!sheetRows || !sheetRows.length) {
        return res.status(400).json({ error: 'Archivo vacio o sin datos' });
      }

      // Map columns flexibly
      const firstRow = sheetRows[0];
      const keys = Object.keys(firstRow);
      const findCol = (hints) => keys.find(k => hints.some(h => k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(h))) || null;
      const colTel = findCol(['telef', 'phone', 'from', 'numero']) || keys[0];
      const colNom = findCol(['nombre', 'name', 'contacto']);
      const colMsg = findCol(['mensaje', 'message', 'body', 'texto']);
      const colFecha = findCol(['fecha', 'date', 'timestamp']);
      const colEstado = findCol(['estado', 'status']);

      rows = sheetRows.map(r => ({
        telefono: String(r[colTel] || ''),
        nombre: colNom ? String(r[colNom] || '') : '',
        mensaje: colMsg ? String(r[colMsg] || '') : '',
        fecha: colFecha ? String(r[colFecha] || '') : '',
        estado: colEstado ? String(r[colEstado] || '') : '',
      }));
    }

    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ error: 'No se encontraron datos para importar' });
    }

    const stats = { contacts_created: 0, contacts_updated: 0, messages_imported: 0,
                    files_imported: 0, duplicates_skipped: 0, errors: 0, campaigns: {} };

    for (const row of rows) {
      try {
        // Parse the webhook payload from the "telefono" field
        const parsed = parseWAWebhook(row.telefono || '');
        if (!parsed.phone) { stats.errors++; continue; }

        // Use parsed content, fallback to row.mensaje
        const contenido = parsed.content || (row.mensaje || '').trim();
        const nombre = (row.nombre || '').trim();
        const fecha = parsed.timestamp || row.fecha || new Date().toISOString();

        // Find or create contact
        const { rows: existing } = await dbPool.query(
          'SELECT id, nombre FROM contactos WHERE telefono = $1 LIMIT 1', [parsed.phone]
        );

        let contactoId;
        if (existing.length) {
          contactoId = existing[0].id;
          stats.contacts_updated++;
          // Update campaign info if new
          const updates = ['fecha_ultima_interaccion = NOW()', 'updated_at = NOW()'];
          const params = [];
          if (parsed.campaign_label && parsed.campaign_type !== 'direct') {
            updates.push(`campana_publicitaria = COALESCE(campana_publicitaria, $${params.length+1})`);
            params.push(parsed.campaign_label);
            updates.push(`campana_source_url = COALESCE(campana_source_url, $${params.length+1})`);
            params.push(parsed.referral_url);
            updates.push(`campana_tipo = COALESCE(campana_tipo, $${params.length+1})`);
            params.push(parsed.campaign_type);
          }
          if (parsed.destino) {
            updates.push(`destino_interes = COALESCE(destino_interes, $${params.length+1})`);
            params.push(parsed.destino);
          }
          if (nombre && !existing[0].nombre) {
            updates.push(`nombre = $${params.length+1}`);
            params.push(nombre);
          }
          params.push(contactoId);
          await dbPool.query(`UPDATE contactos SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
        } else {
          const { rows: created } = await dbPool.query(
            `INSERT INTO contactos (nombre, telefono, origen, estado, canal_preferido, consentimiento_whatsapp,
              campana_publicitaria, campana_source_url, campana_tipo, wa_message_id, wa_first_message, wa_forwarded,
              destino_interes, fecha_ultima_interaccion)
             VALUES ($1,$2,'whatsapp','nuevo','whatsapp',true,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING id`,
            [nombre || 'WhatsApp ' + parsed.phone, parsed.phone,
             parsed.campaign_type !== 'direct' ? parsed.campaign_label : null,
             parsed.referral_url, parsed.campaign_type, parsed.wa_id,
             contenido ? contenido.substring(0, 500) : null, parsed.forwarded, parsed.destino || null]
          );
          contactoId = created[0].id;
          stats.contacts_created++;
        }

        // Track campaign
        const cl = parsed.campaign_label || 'Mensaje directo';
        stats.campaigns[cl] = (stats.campaigns[cl] || 0) + 1;

        // Skip if duplicate message
        if (parsed.wa_id) {
          const { rows: dup } = await dbPool.query(
            "SELECT id FROM conversaciones WHERE contacto_id = $1 AND contenido LIKE $2 LIMIT 1",
            [contactoId, `%${parsed.wa_id.substring(0, 25)}%`]
          );
          if (dup.length) { stats.duplicates_skipped++; continue; }
        }

        // Insert message
        if (contenido) {
          const tipo = parsed.is_outgoing ? 'saliente' : 'entrante';
          const { rows: convRows } = await dbPool.query(
            `INSERT INTO conversaciones (contacto_id, canal, tipo, contenido, usuario_responsable, estado_conversacion, created_at)
             VALUES ($1, 'whatsapp', $2, $3, 'wa-import', 'abierta', $4) RETURNING id`,
            [contactoId, tipo, contenido, fecha]
          );
          stats.messages_imported++;

          // Insert file reference if applicable
          if (parsed.file_name && ['audio','document','image','video'].includes(parsed.msg_type)) {
            await dbPool.query(
              `INSERT INTO conversacion_archivos (conversacion_id, contacto_id, nombre_archivo, tipo_archivo, created_at)
               VALUES ($1, $2, $3, $4, $5)`,
              [convRows[0].id, contactoId, parsed.file_name, parsed.file_type_label, fecha]
            );
            stats.files_imported++;
          }
        }
      } catch (rowErr) {
        stats.errors++;
      }
    }

    // Log sync
    await dbPool.query(
      `INSERT INTO whatsapp_sync_log (source, registros_procesados, contactos_creados, mensajes_importados, errores)
       VALUES ('wa-import', $1, $2, $3, $4)`,
      [rows.length, stats.contacts_created, stats.messages_imported, stats.errors]
    );

    res.json({ message: 'Importacion completada', stats });
  } catch (err) { next(err); }
});

// ── Parse WhatsApp Business API webhook payload ──────────────────────────────
function parseWAWebhook(raw) {
  const result = { phone: '', wa_id: null, timestamp: null, msg_type: 'unknown', content: '',
    file_name: null, file_type_label: 'otro', is_outgoing: false, forwarded: false,
    referral_url: null, campaign_type: 'direct', campaign_label: 'Mensaje directo', destino: '' };

  if (!raw || !raw.trim()) return result;
  raw = raw.trim();

  let data;
  try { data = JSON.parse(raw); } catch {
    // Try to extract phone with regex
    const m = raw.match(/"from"\s*:\s*"(\d+)"/);
    if (m) result.phone = normalizePhone(m[1]);
    return result;
  }

  if (data.from) result.phone = normalizePhone(String(data.from));
  if (data.id) result.wa_id = String(data.id);
  if (data.timestamp) result.timestamp = data.timestamp;

  const type = data.type || '';
  result.msg_type = type;

  if (type === 'text' && data.text?.body) {
    result.content = data.text.body;
  } else if (type === 'audio') {
    result.content = '[Audio de voz]';
    result.file_name = 'audio_whatsapp';
    result.file_type_label = 'audio';
  } else if (type === 'document' && data.document) {
    result.file_name = data.document.filename || 'documento';
    result.file_type_label = 'pdf';
    result.content = `[Documento: ${result.file_name}]`;
    if (/PROPUESTA|COTIZACION|FACTURA|PRESUPUESTO/i.test(result.file_name)) result.is_outgoing = true;
  } else if (type === 'image') {
    result.content = `[Imagen]${data.image?.caption ? ': ' + data.image.caption : ''}`;
    result.file_name = 'imagen_whatsapp';
    result.file_type_label = 'imagen';
  } else if (type === 'video') {
    result.content = '[Video]';
    result.file_name = 'video_whatsapp';
    result.file_type_label = 'video';
  } else if (type === 'sticker') {
    result.content = '[Sticker]';
  } else if (type === 'location' && data.location) {
    const loc = data.location;
    result.content = `[Ubicacion: ${loc.name || ''} (${loc.latitude}, ${loc.longitude})]`;
  }

  if (data.errors?.length) {
    const e = data.errors[0];
    result.content = `[Error: ${e.title || 'Tipo no soportado'}]`;
    result.msg_type = 'error';
  }

  if (data.referral) {
    const ref = data.referral;
    result.referral_url = ref.source_url;
    const url = ref.source_url || '';
    const st = ref.source_type || '';
    if (url.includes('instagram.com')) result.campaign_type = st === 'ad' ? 'instagram_ad' : 'instagram_organic';
    else if (url.includes('facebook.com') || url.includes('fb.me')) result.campaign_type = st === 'ad' ? 'facebook_ad' : 'facebook_organic';
    else if (st === 'ad') result.campaign_type = 'meta_ad';
    const labels = { instagram_ad: 'Instagram Ad', facebook_ad: 'Facebook Ad', instagram_organic: 'Instagram', facebook_organic: 'Facebook', meta_ad: 'Meta Ad' };
    result.campaign_label = labels[result.campaign_type] || result.campaign_type;
    if (ref.body) result.campaign_label += ` - ${ref.body}`;
  }

  if (data.context?.forwarded) {
    result.forwarded = true;
    if (result.campaign_type === 'direct') { result.campaign_type = 'forwarded'; result.campaign_label = 'Reenviado'; }
  }

  // Extract destination from content
  const text = `${result.content} ${data.referral?.body || ''}`.toLowerCase();
  const destinos = ['cancun','jamaica','brasil','bariloche','miami','orlando','europa','punta cana','cartagena',
    'colombia','peru','cusco','rio de janeiro','florianopolis','mexico','playa del carmen','riviera maya',
    'praia do forte','maldivas','tailandia','dubai','iguazu','salta','ushuaia','el calafate','chile','uruguay'];
  result.destino = destinos.filter(d => text.includes(d)).map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');

  return result;
}

function normalizePhone(p) {
  const c = p.replace(/[^\d+]/g, '');
  return c.startsWith('+') ? c : c.startsWith('54') ? '+' + c : '+54' + c;
}

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  // Log con detalle: method, path, query, body (acotado), stack
  const detail = {
    method: req.method,
    path: req.path,
    query: req.query,
    body: typeof req.body === 'object' ? JSON.stringify(req.body).slice(0, 500) : undefined,
    error: err.message,
    code: err.code,
    detail_pg: err.detail,
    table: err.table,
    constraint: err.constraint,
    stack: err.stack,
  };
  log.error(req, 'unhandled_error', detail);
  // Tambien imprimir a stderr para que aparezca en docker logs sin parsing
  console.error('\n[ERROR]', req.method, req.path, '\n', err.stack || err.message, '\n');
  res.status(500).json({ error: err.message, code: err.code });
});

// ── Start ─────────────────────────────────────────────────────────────────────
// Only bind the port if this file is run directly (not required by tests)
if (require.main === module) {
  const { runMigrations } = require('./utils/migrate');
  runMigrations().then(() => {
    app.listen(PORT, () => {
      log.info('server_started', { port: PORT, env: process.env.NODE_ENV || 'development' });
    });
  });
}

module.exports = app;
