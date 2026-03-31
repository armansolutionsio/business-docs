const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const db = require('../utils/db');
const { logAudit } = require('../utils/auditLog');

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

// ── Send email ───────────────────────────────────────────────────────────────
router.post('/send', async (req, res, next) => {
  try {
    const { contacto_ids, asunto, cuerpo, enviado_por, adjuntos } = req.body;

    if (!contacto_ids?.length) return res.status(400).json({ error: 'Seleccioná al menos un contacto' });
    if (!asunto || !cuerpo) return res.status(400).json({ error: 'Asunto y cuerpo son requeridos' });

    // Fetch contacts with email AND estado
    const { rows: contactos } = await db.query(
      `SELECT id, nombre, apellido, email, estado FROM contactos WHERE id = ANY($1)`,
      [contacto_ids]
    );

    const sinEmail = contactos.filter(c => !c.email);
    const conEmail = contactos.filter(c => c.email);

    if (!conEmail.length) {
      return res.status(400).json({ error: 'Ninguno de los contactos seleccionados tiene email' });
    }

    const transporter = createTransporter();
    const htmlBody = buildHtml(cuerpo);

    // Build attachments array: always include logo, plus user files
    const attachments = [
      { filename: 'logo-arman-travel.png', path: LOGO_PATH, cid: 'logo' },
    ];

    // Add user-uploaded files
    if (adjuntos?.length) {
      for (const adj of adjuntos) {
        const filePath = path.join(UPLOADS_DIR, adj.id);
        if (fs.existsSync(filePath)) {
          attachments.push({
            filename: adj.originalName,
            path: filePath,
            contentType: adj.mimetype,
          });
        }
      }
    }

    const resultados = [];

    for (const contacto of conEmail) {
      let estado = 'enviado';
      let error = null;

      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: contacto.email,
          subject: asunto,
          html: htmlBody,
          attachments,
        });
      } catch (mailErr) {
        estado = 'fallido';
        error = mailErr.message;
      }

      // Record in DB
      const adjNames = adjuntos?.length ? adjuntos.map(a => a.originalName).join(', ') : null;
      const { rows } = await db.query(
        `INSERT INTO campania_mail (contacto_id, asunto, cuerpo, destinatario, estado, enviado_por, notas)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [contacto.id, asunto, cuerpo, contacto.email, estado, enviado_por || null, adjNames ? `Adjuntos: ${adjNames}` : null]
      );

      await logAudit({ tabla: 'campania_mail', registro_id: rows[0].id, accion: 'INSERT', usuario: enviado_por });
      await db.query('UPDATE contactos SET fecha_ultima_interaccion = NOW() WHERE id = $1', [contacto.id]);

      // Auto-transition: nuevo -> contactado when mail is sent successfully
      if (estado === 'enviado' && contacto.estado === 'nuevo') {
        await db.query(`UPDATE contactos SET estado = 'contactado', updated_at = NOW() WHERE id = $1`, [contacto.id]);
        await logAudit({ tabla: 'contactos', registro_id: contacto.id, accion: 'UPDATE', campo: 'estado', valor_anterior: 'nuevo', valor_nuevo: 'contactado', usuario: enviado_por });
      }

      resultados.push({
        contacto_id: contacto.id,
        nombre: [contacto.nombre, contacto.apellido].filter(Boolean).join(' '),
        email: contacto.email,
        estado,
        error,
        campania_id: rows[0].id,
        estado_actualizado: estado === 'enviado' && contacto.estado === 'nuevo' ? 'contactado' : null,
      });
    }

    // Cleanup uploaded temp files after sending
    if (adjuntos?.length) {
      for (const adj of adjuntos) {
        const filePath = path.join(UPLOADS_DIR, adj.id);
        fs.unlink(filePath, () => {});
      }
    }

    res.json({
      enviados: resultados.filter(r => r.estado === 'enviado').length,
      fallidos: resultados.filter(r => r.estado === 'fallido').length,
      sin_email: sinEmail.map(c => ({ id: c.id, nombre: [c.nombre, c.apellido].filter(Boolean).join(' ') })),
      detalle: resultados,
    });
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
