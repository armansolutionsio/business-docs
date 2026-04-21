const express = require('express');
const router = express.Router();
const db = require('../utils/db');

// ── GET /api/whatsapp-leads — All contacts that came from WhatsApp ───────────
router.get('/', async (req, res, next) => {
  try {
    const { estado, search, vendedor, sort = 'ultimo_contacto', order = 'desc', limit = 50, offset = 0 } = req.query;
    const conditions = [`(c.origen = 'whatsapp' OR c.canal_preferido = 'whatsapp' OR EXISTS (SELECT 1 FROM conversaciones cv WHERE cv.contacto_id = c.id AND cv.canal = 'whatsapp'))`];
    const params = [];
    let idx = 1;

    if (estado) { conditions.push(`c.estado = $${idx++}`); params.push(estado); }
    if (vendedor) { conditions.push(`c.vendedor_asignado = $${idx++}`); params.push(vendedor); }
    if (search) {
      conditions.push(`(c.nombre ILIKE $${idx} OR c.apellido ILIKE $${idx} OR c.telefono ILIKE $${idx} OR c.email ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    // Sort options
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';
    const sortMap = {
      nombre: `COALESCE(c.nombre, c.apellido, '') ${sortDir}`,
      ultimo_contacto: `COALESCE((SELECT created_at FROM conversaciones cv WHERE cv.contacto_id = c.id ORDER BY cv.created_at DESC LIMIT 1), c.fecha_ultima_interaccion, c.created_at) ${sortDir}`,
      fecha_creacion: `c.created_at ${sortDir}`,
      mensajes: `(SELECT COUNT(*)::int FROM conversaciones cv WHERE cv.contacto_id = c.id AND cv.canal = 'whatsapp') ${sortDir}`,
    };
    const orderClause = sortMap[sort] || sortMap.ultimo_contacto;

    // Main query with last message, message count, and ultimo contacto (any direction)
    const query = `
      SELECT c.*,
        (SELECT COUNT(*)::int FROM conversaciones cv WHERE cv.contacto_id = c.id AND cv.canal = 'whatsapp') AS wa_messages_count,
        (SELECT contenido FROM conversaciones cv WHERE cv.contacto_id = c.id AND cv.canal = 'whatsapp' ORDER BY cv.created_at DESC LIMIT 1) AS ultimo_mensaje,
        (SELECT created_at FROM conversaciones cv WHERE cv.contacto_id = c.id AND cv.canal = 'whatsapp' ORDER BY cv.created_at DESC LIMIT 1) AS ultimo_mensaje_fecha,
        (SELECT tipo FROM conversaciones cv WHERE cv.contacto_id = c.id AND cv.canal = 'whatsapp' ORDER BY cv.created_at DESC LIMIT 1) AS ultimo_mensaje_tipo,
        (SELECT estado_conversacion FROM conversaciones cv WHERE cv.contacto_id = c.id AND cv.canal = 'whatsapp' ORDER BY cv.created_at DESC LIMIT 1) AS estado_conversacion,
        (SELECT COUNT(*)::int FROM conversacion_archivos ca WHERE ca.contacto_id = c.id) AS archivos_count,
        COALESCE(
          (SELECT created_at FROM conversaciones cv WHERE cv.contacto_id = c.id ORDER BY cv.created_at DESC LIMIT 1),
          c.fecha_ultima_interaccion,
          c.created_at
        ) AS ultimo_contacto
      FROM contactos c
      ${where}
      ORDER BY ${orderClause}
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    params.push(parseInt(limit), parseInt(offset));

    const countQuery = `SELECT COUNT(*)::int AS total FROM contactos c ${where}`;
    const countParams = params.slice(0, -2);

    const [dataRes, countRes] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, countParams),
    ]);

    res.json({
      data: dataRes.rows,
      total: countRes.rows[0]?.total || 0,
    });
  } catch (err) { next(err); }
});

// ── GET /api/whatsapp-leads/stats — WhatsApp-specific stats ──────────────────
router.get('/stats', async (req, res, next) => {
  try {
    const [totalRes, estadoRes, convStatsRes, hoyRes] = await Promise.all([
      db.query(`
        SELECT COUNT(DISTINCT c.id)::int AS total
        FROM contactos c
        WHERE c.origen = 'whatsapp' OR c.canal_preferido = 'whatsapp'
           OR EXISTS (SELECT 1 FROM conversaciones cv WHERE cv.contacto_id = c.id AND cv.canal = 'whatsapp')
      `),
      db.query(`
        SELECT c.estado, COUNT(*)::int AS count
        FROM contactos c
        WHERE c.origen = 'whatsapp' OR c.canal_preferido = 'whatsapp'
           OR EXISTS (SELECT 1 FROM conversaciones cv WHERE cv.contacto_id = c.id AND cv.canal = 'whatsapp')
        GROUP BY c.estado ORDER BY count DESC
      `),
      db.query(`
        SELECT
          COUNT(DISTINCT contacto_id)::int AS contactos_con_conversacion,
          COUNT(*)::int AS total_mensajes,
          COUNT(*) FILTER (WHERE tipo = 'entrante')::int AS entrantes,
          COUNT(*) FILTER (WHERE tipo = 'saliente')::int AS salientes
        FROM conversaciones WHERE canal = 'whatsapp'
      `),
      db.query(`
        SELECT COUNT(DISTINCT c.id)::int AS count
        FROM contactos c
        WHERE c.created_at::date = CURRENT_DATE
          AND (c.origen = 'whatsapp' OR c.canal_preferido = 'whatsapp')
      `),
    ]);

    res.json({
      total: totalRes.rows[0]?.total || 0,
      hoy: hoyRes.rows[0]?.count || 0,
      por_estado: estadoRes.rows,
      conversaciones: convStatsRes.rows[0] || {},
    });
  } catch (err) { next(err); }
});

module.exports = router;
