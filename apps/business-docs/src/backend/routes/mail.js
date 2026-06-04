const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const db = require('../utils/db');
const { logAudit } = require('../utils/auditLog');
const { renderStoredQuote, renderStoredReceipt, listAttachableDocs } = require('../utils/storedDocRenderer');

const LOGO_PATH = path.join(__dirname, '../../../../crm-ui/dist/logo-arman-travel.png');
const UPLOADS_DIR = path.join(__dirname, '../../../uploads');

// Ensure uploads dir exists
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function buildHtml(cuerpo) {
  const bodyHtml = cuerpo.replace(/\n/g, '<br>');
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
        <tr>
          <td style="background:linear-gradient(135deg,#6A1B9A 0%,#7B2CBF 100%);padding:24px 32px;text-align:center">
            <img src="cid:logo" alt="Arman Travel" style="height:48px;width:auto" />
          </td>
        </tr>
        <tr>
          <td style="padding:32px;font-size:15px;line-height:1.7;color:#1e293b">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle">
                  <img src="cid:logo" alt="Arman Travel" style="height:28px;width:auto;opacity:.7" />
                </td>
                <td style="text-align:right;font-size:12px;color:#94a3b8;line-height:1.5">
                  Arman Travel<br>
                  travel@armansolutions.io
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <p style="font-size:11px;color:#94a3b8;margin-top:16px;text-align:center">
        Este email fue enviado por Arman Travel. Si no esperabas este mensaje, podés ignorarlo.
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Upload attachment ────────────────────────────────────────────────────────
const multer = require('multer');
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
  res.json({
    id: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
    path: req.file.path,
  });
});

// ── List all campaigns ───────────────────────────────────────────────────────
router.get('/campanias', async (req, res, next) => {
  try {
    const { estado, search } = req.query;
    let where = [];
    let vals = [];
    let idx = 1;

    if (estado) { where.push(`cm.estado = $${idx++}`); vals.push(estado); }
    if (search) {
      where.push(`(cm.asunto ILIKE $${idx} OR cm.destinatario ILIKE $${idx} OR c.nombre ILIKE $${idx} OR c.apellido ILIKE $${idx})`);
      vals.push(`%${search}%`);
      idx++;
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await db.query(`
      SELECT cm.*,
             COALESCE(c.nombre, '') || ' ' || COALESCE(c.apellido, '') AS contacto_nombre
      FROM campania_mail cm
      LEFT JOIN contactos c ON c.id = cm.contacto_id
      ${whereClause}
      ORDER BY cm.enviado_at DESC
      LIMIT 500
    `, vals);
    res.json(rows);
  } catch (err) { next(err); }
});

// Simple {{placeholder}} interpolation on the email body/subject.
function renderTemplate(text, vars) {
  if (!text) return '';
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null || v === '' ? '' : String(v);
  });
}

function buildVarsForContacto(c) {
  const nombre = [c.nombre, c.apellido].filter(Boolean).join(' ').trim()
    || c.razon_social || c.nombre_comercial || '';
  return {
    nombre,
    primer_nombre: (nombre.split(' ')[0] || '').trim(),
    email: c.email || '',
    telefono: c.telefono || '',
    empresa: c.razon_social || c.nombre_comercial || '',
  };
}

async function buildDocAttachments(documentos) {
  if (!documentos?.length) return [];
  const out = [];
  for (const d of documentos) {
    try {
      let rendered;
      if (d.tipo === 'cotizacion') rendered = await renderStoredQuote(d.id);
      else if (d.tipo === 'recibo') rendered = await renderStoredReceipt(d.id);
      else continue;
      out.push({
        filename: rendered.filename,
        content: rendered.buffer,
        contentType: 'application/pdf',
        _label: `${d.tipo} ${rendered.numero || d.id}`,
      });
    } catch (e) {
      // No bloqueamos el envio si un doc falla; lo registramos
      out.push({ _failed: true, _label: `${d.tipo} #${d.id}`, _error: e.message });
    }
  }
  return out;
}

// ── Send email ───────────────────────────────────────────────────────────────
// Body: { contacto_ids?, proveedor_ids?, asunto, cuerpo, enviado_por,
//         adjuntos?: [{id, originalName, mimetype}],   // uploaded files
//         documentos?: [{tipo: 'cotizacion'|'recibo', id}] // generated PDFs
//       }
router.post('/send', async (req, res, next) => {
  try {
    const { contacto_ids = [], proveedor_ids = [], asunto, cuerpo, enviado_por, adjuntos, documentos } = req.body;

    if (!contacto_ids.length && !proveedor_ids.length) {
      return res.status(400).json({ error: 'Seleccione al menos un destinatario' });
    }
    if (!asunto || !cuerpo) return res.status(400).json({ error: 'Asunto y cuerpo son requeridos' });

    // Cargar destinatarios (contactos y/o proveedores)
    let destinatarios = [];
    if (contacto_ids.length) {
      const { rows } = await db.query(
        `SELECT id, nombre, apellido, email, estado, telefono, razon_social, 'contacto' AS _origen
         FROM contactos WHERE id = ANY($1)`, [contacto_ids]
      );
      destinatarios = destinatarios.concat(rows);
    }
    if (proveedor_ids.length) {
      const { rows } = await db.query(
        `SELECT id, razon_social, nombre_comercial, email, telefono, contacto_principal,
                NULL::text AS estado, 'proveedor' AS _origen
         FROM proveedores WHERE id = ANY($1)`, [proveedor_ids]
      );
      destinatarios = destinatarios.concat(rows);
    }

    const sinEmail = destinatarios.filter(c => !c.email);
    const conEmail = destinatarios.filter(c => c.email);

    if (!conEmail.length) {
      return res.status(400).json({ error: 'Ninguno de los destinatarios tiene email' });
    }

    const transporter = createTransporter();

    // Generar adjuntos compartidos: logo, archivos subidos y documentos del sistema
    const baseAttachments = [
      { filename: 'logo-arman-travel.png', path: LOGO_PATH, cid: 'logo' },
    ];
    if (adjuntos?.length) {
      for (const adj of adjuntos) {
        const filePath = path.join(UPLOADS_DIR, adj.id);
        if (fs.existsSync(filePath)) {
          baseAttachments.push({
            filename: adj.originalName,
            path: filePath,
            contentType: adj.mimetype,
          });
        }
      }
    }
    const docsRendered = await buildDocAttachments(documentos);
    for (const d of docsRendered) {
      if (!d._failed) baseAttachments.push({
        filename: d.filename, content: d.content, contentType: d.contentType,
      });
    }

    const resultados = [];

    for (const contacto of conEmail) {
      const vars = buildVarsForContacto(contacto);
      const asuntoFinal = renderTemplate(asunto, vars);
      const cuerpoFinal = renderTemplate(cuerpo, vars);
      const htmlBody = buildHtml(cuerpoFinal);

      let estado = 'enviado';
      let error = null;

      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: contacto.email,
          subject: asuntoFinal,
          html: htmlBody,
          attachments: baseAttachments,
        });
      } catch (mailErr) {
        estado = 'fallido';
        error = mailErr.message;
      }

      const adjNames = [
        ...(adjuntos?.map(a => a.originalName) || []),
        ...docsRendered.filter(d => !d._failed).map(d => d.filename),
      ];
      const docsFallidos = docsRendered.filter(d => d._failed);
      const notas = [
        adjNames.length ? `Adjuntos: ${adjNames.join(', ')}` : null,
        docsFallidos.length ? `Docs fallidos: ${docsFallidos.map(d => d._label).join(', ')}` : null,
      ].filter(Boolean).join(' | ') || null;

      // Solo registramos en campania_mail si es contacto (no proveedor)
      let campaniaId = null;
      if (contacto._origen === 'contacto') {
        const { rows } = await db.query(
          `INSERT INTO campania_mail (contacto_id, asunto, cuerpo, destinatario, estado, enviado_por, notas)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [contacto.id, asuntoFinal, cuerpoFinal, contacto.email, estado, enviado_por || null, notas]
        );
        campaniaId = rows[0].id;
        await logAudit({ tabla: 'campania_mail', registro_id: campaniaId, accion: 'INSERT', usuario: enviado_por });
        await db.query('UPDATE contactos SET fecha_ultima_interaccion = NOW() WHERE id = $1', [contacto.id]);

        if (estado === 'enviado' && contacto.estado === 'nuevo') {
          await db.query(`UPDATE contactos SET estado = 'contactado', updated_at = NOW() WHERE id = $1`, [contacto.id]);
          await logAudit({ tabla: 'contactos', registro_id: contacto.id, accion: 'UPDATE', campo: 'estado', valor_anterior: 'nuevo', valor_nuevo: 'contactado', usuario: enviado_por });
        }
      } else {
        // Proveedor: registramos un log mas liviano
        await logAudit({
          tabla: 'proveedores', registro_id: contacto.id, accion: 'MAIL',
          campo: 'email', valor_nuevo: asuntoFinal, usuario: enviado_por,
        });
      }

      const nombreMostrar = contacto._origen === 'proveedor'
        ? (contacto.razon_social || contacto.nombre_comercial || 'Proveedor')
        : [contacto.nombre, contacto.apellido].filter(Boolean).join(' ');

      resultados.push({
        id: contacto.id,
        origen: contacto._origen,
        nombre: nombreMostrar,
        email: contacto.email,
        estado, error,
        campania_id: campaniaId,
        estado_actualizado: estado === 'enviado' && contacto._origen === 'contacto' && contacto.estado === 'nuevo' ? 'contactado' : null,
      });
    }

    if (adjuntos?.length) {
      for (const adj of adjuntos) {
        const filePath = path.join(UPLOADS_DIR, adj.id);
        fs.unlink(filePath, () => {});
      }
    }

    res.json({
      enviados: resultados.filter(r => r.estado === 'enviado').length,
      fallidos: resultados.filter(r => r.estado === 'fallido').length,
      sin_email: sinEmail.map(c => ({
        id: c.id,
        nombre: c._origen === 'proveedor'
          ? (c.razon_social || c.nombre_comercial || 'Proveedor')
          : [c.nombre, c.apellido].filter(Boolean).join(' '),
      })),
      docs_fallidos: docsRendered.filter(d => d._failed).map(d => ({ label: d._label, error: d._error })),
      detalle: resultados,
    });
  } catch (err) { next(err); }
});

// ── Documentos adjuntables del contacto ─────────────────────────────────────
router.get('/attachable-docs/:contactoId', async (req, res, next) => {
  try {
    const docs = await listAttachableDocs(req.params.contactoId);
    res.json(docs);
  } catch (err) { next(err); }
});

// ── IMAP Reply Checker ───────────────────────────────────────────────────────
// Checks inbox for replies to campaign emails and auto-updates status
const Imap = require('imap');

function createImapConnection() {
  return new Imap({
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASS,
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
  });
}

async function checkReplies() {
  // Get all campaign emails that are 'enviado' (not yet marked as replied)
  const { rows: pendientes } = await db.query(
    `SELECT DISTINCT destinatario FROM campania_mail WHERE estado = 'enviado'`
  );
  if (!pendientes.length) return;

  const emailSet = new Set(pendientes.map(r => r.destinatario.toLowerCase()));

  return new Promise((resolve) => {
    let imap;
    try {
      imap = createImapConnection();
    } catch (e) {
      resolve();
      return;
    }

    imap.once('error', () => resolve());
    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err, box) => {
        if (err) { imap.end(); resolve(); return; }

        // Search for recent unseen emails (last 3 days)
        const since = new Date();
        since.setDate(since.getDate() - 3);
        const sinceStr = since.toISOString().split('T')[0];

        imap.search([['SINCE', sinceStr]], (err, results) => {
          if (err || !results?.length) { imap.end(); resolve(); return; }

          const f = imap.fetch(results, { bodies: 'HEADER.FIELDS (FROM SUBJECT DATE)', struct: false });
          const replies = [];

          f.on('message', (msg) => {
            msg.on('body', (stream) => {
              let buffer = '';
              stream.on('data', (chunk) => { buffer += chunk.toString('utf8'); });
              stream.on('end', () => {
                const fromMatch = buffer.match(/From:\s*.*?<([^>]+)>/i) || buffer.match(/From:\s*(\S+@\S+)/i);
                const subjectMatch = buffer.match(/Subject:\s*(.+)/i);
                if (fromMatch) {
                  const fromEmail = fromMatch[1].toLowerCase().trim();
                  const subject = subjectMatch ? subjectMatch[1].trim() : '';
                  if (emailSet.has(fromEmail)) {
                    replies.push({ from: fromEmail, subject });
                  }
                }
              });
            });
          });

          f.once('end', async () => {
            // Update campaigns where we got a reply
            for (const reply of replies) {
              await db.query(
                `UPDATE campania_mail SET estado = 'respondido', respondido_at = NOW()
                 WHERE destinatario ILIKE $1 AND estado = 'enviado'`,
                [reply.from]
              );
            }
            imap.end();
            resolve(replies.length);
          });

          f.once('error', () => { imap.end(); resolve(); });
        });
      });
    });

    imap.connect();
  });
}

// Endpoint to manually trigger reply check
router.post('/check-replies', async (req, res, next) => {
  try {
    const count = await checkReplies();
    res.json({ checked: true, replies_found: count || 0 });
  } catch (err) { next(err); }
});

// Auto-check replies every 5 minutes
let replyInterval = null;
function startReplyChecker() {
  if (replyInterval) return;
  // Initial check after 30 seconds
  setTimeout(() => {
    checkReplies().catch(() => {});
    // Then every 5 minutes
    replyInterval = setInterval(() => {
      checkReplies().catch(() => {});
    }, 5 * 60 * 1000);
  }, 30000);
}
startReplyChecker();

module.exports = router;
