const express = require('express');
const router = express.Router();
const path = require('path');
const { execFile } = require('child_process');
const multer = require('multer');
const fs = require('fs');
const db = require('../utils/db');
const { logAudit } = require('../utils/auditLog');
const log = require('../utils/logger');

// Upload config for CSV/XLSX files
const uploadDir = path.join(__dirname, '../../../uploads/wa-imports');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max

// ── POST /api/whatsapp-sync — Import messages from Google Sheets data ────────
// Expects body: { rows: [ { telefono, nombre, mensaje, fecha, tipo, archivo_url, archivo_nombre, archivo_tipo } ] }
router.post('/', async (req, res, next) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ error: 'Se requiere un array de rows con mensajes' });
    }

    const results = { created_contacts: 0, updated_contacts: 0, messages_imported: 0, files_imported: 0, errors: [] };

    for (const row of rows) {
      try {
        const telefono = (row.telefono || '').trim();
        if (!telefono) { results.errors.push({ row, error: 'Sin telefono' }); continue; }

        // Find or create contact
        let contactoId;
        const { rows: existing } = await db.query(
          'SELECT id FROM contactos WHERE telefono = $1 LIMIT 1', [telefono]
        );

        if (existing.length) {
          contactoId = existing[0].id;
          results.updated_contacts++;
        } else {
          const nombre = (row.nombre || '').trim();
          const { rows: created } = await db.query(
            `INSERT INTO contactos (nombre, telefono, origen, estado, canal_preferido, consentimiento_whatsapp)
             VALUES ($1, $2, 'whatsapp', 'nuevo', 'whatsapp', true) RETURNING id`,
            [nombre || 'WhatsApp ' + telefono, telefono]
          );
          contactoId = created[0].id;
          results.created_contacts++;
          await logAudit({ tabla: 'contactos', registro_id: contactoId, accion: 'INSERT', usuario: 'whatsapp-sync' });
        }

        // Insert conversation message
        const fecha = row.fecha ? new Date(row.fecha) : new Date();
        const tipo = row.tipo || 'entrante';
        const contenido = (row.mensaje || '').trim();

        if (contenido) {
          const { rows: convRows } = await db.query(
            `INSERT INTO conversaciones (contacto_id, canal, tipo, contenido, usuario_responsable, estado_conversacion, created_at)
             VALUES ($1, 'whatsapp', $2, $3, 'whatsapp-sync', 'abierta', $4) RETURNING id`,
            [contactoId, tipo, contenido, fecha]
          );
          results.messages_imported++;

          // If there's a file attachment
          if (row.archivo_url) {
            await db.query(
              `INSERT INTO conversacion_archivos (conversacion_id, contacto_id, nombre_archivo, tipo_archivo, url_drive, created_at)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [convRows[0].id, contactoId, row.archivo_nombre || 'archivo', row.archivo_tipo || 'otro', row.archivo_url, fecha]
            );
            results.files_imported++;
          }
        }

        // Update last interaction date
        await db.query('UPDATE contactos SET fecha_ultima_interaccion = NOW() WHERE id = $1', [contactoId]);

      } catch (rowErr) {
        results.errors.push({ telefono: row.telefono, error: rowErr.message });
      }
    }

    // Log sync event
    await db.query(
      `INSERT INTO whatsapp_sync_log (source, registros_procesados, contactos_creados, mensajes_importados, errores)
       VALUES ('google_sheets', $1, $2, $3, $4)`,
      [rows.length, results.created_contacts, results.messages_imported, results.errors.length]
    );

    res.json(results);
  } catch (err) { next(err); }
});

// ── POST /api/whatsapp-sync/bulk-files — Import Drive files for a contact ────
router.post('/bulk-files', async (req, res, next) => {
  try {
    const { contacto_id, files } = req.body;
    if (!contacto_id || !Array.isArray(files)) {
      return res.status(400).json({ error: 'Se requiere contacto_id y array de files' });
    }

    let imported = 0;
    for (const f of files) {
      await db.query(
        `INSERT INTO conversacion_archivos (contacto_id, nombre_archivo, tipo_archivo, url_drive, tamano_bytes)
         VALUES ($1, $2, $3, $4, $5)`,
        [contacto_id, f.nombre || 'archivo', f.tipo || 'otro', f.url, f.tamano || null]
      );
      imported++;
    }

    res.json({ imported });
  } catch (err) { next(err); }
});

// ── GET /api/whatsapp-sync/log — Sync history ────────────────────────────────
router.get('/log', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM whatsapp_sync_log ORDER BY created_at DESC LIMIT 50'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/whatsapp-sync/files/:contactoId — Get files for a contact ───────
router.get('/files/:contactoId', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM conversacion_archivos WHERE contacto_id = $1 ORDER BY created_at DESC`,
      [req.params.contactoId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /api/whatsapp-sync/import — Upload CSV/XLSX and run Python pipeline
router.post('/import', async (req, res, next) => {
  try {
    // Multer 2 returns a promise in Express 5
    await new Promise((resolve, reject) => {
      upload.single('file')(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    if (!req.file) return res.status(400).json({ error: 'No se envio archivo' });

    const originalName = req.file.originalname || 'import';
    const ext = path.extname(originalName).toLowerCase();
    if (!['.csv', '.xlsx', '.xls', '.txt'].includes(ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Formato no soportado. Usar .csv, .xlsx, o .txt' });
    }

    // Rename file with proper extension
    const newPath = req.file.path + ext;
    fs.renameSync(req.file.path, newPath);

    const dryRun = req.query.dry_run === 'true';

    // Execute Python pipeline
    const pipelineScript = path.resolve(__dirname, '../../../../services/wa-data-pipeline/pipeline.py');
    const args = ['--file', newPath];
    if (dryRun) args.push('--dry-run');

    execFile('python', [pipelineScript, ...args], {
      cwd: path.dirname(pipelineScript),
      timeout: 120000, // 2 min max
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    }, (err, stdout, stderr) => {
      // Clean up uploaded file
      try { fs.unlinkSync(newPath); } catch (_) {}

      if (err) {
        log.error('wa_pipeline_failed', { error: err.message, stderr });
        return res.status(500).json({
          error: 'Error ejecutando pipeline',
          details: stderr || err.message,
          output: stdout,
        });
      }

      // Parse stats from stdout
      const stats = parsePipelineOutput(stdout);
      res.json({
        message: dryRun ? 'Dry run completado' : 'Importacion completada',
        dry_run: dryRun,
        output: stdout,
        stats,
      });
    });
  } catch (err) { next(err); }
});

function parsePipelineOutput(output) {
  const stats = {};
  const lines = output.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s+([\w\s]+):\s+(\d+)/);
    if (match) {
      const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
      stats[key] = parseInt(match[2]);
    }
  }
  // Extract campaigns
  const campaigns = [];
  let inCampaigns = false;
  for (const line of lines) {
    if (line.includes('Campanas detectadas:')) { inCampaigns = true; continue; }
    if (inCampaigns && line.trim().startsWith('-')) {
      campaigns.push(line.trim().replace(/^-\s*/, ''));
    } else if (inCampaigns && line.includes('===')) {
      inCampaigns = false;
    }
  }
  stats.campaigns = campaigns;
  return stats;
}

module.exports = router;
