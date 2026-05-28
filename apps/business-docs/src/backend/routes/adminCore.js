// Arman Admin — panel transversal de las 4 verticales + Arman IA.
// Schema: admin_core. Lee métricas cross-schema.

const express = require('express');
const { tenantMiddleware } = require('../utils/tenant');
const db = require('../utils/db');
const { hashPassword, requireAuth, requireAdmin } = require('../utils/auth');
const customersGlobalRoutes = require('./customersGlobal');

const router = express.Router();
router.use(requireAuth);
router.use(tenantMiddleware('admin'));

// Sub-router: identidad global de cliente
router.use('/customers/global', customersGlobalRoutes);

const num = (v, d = 0) => (v === '' || v == null ? d : Number(v));

// ── Tenants ────────────────────────────────────────────────────────────
router.get('/tenants', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(`SELECT * FROM tenants ORDER BY id`);
    res.json(rows);
  } catch (e) { next(e); }
});

// ── Users ──────────────────────────────────────────────────────────────
router.get('/users', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(
      `SELECT id, email, nombre, rol, verticales, activo, last_login, created_at FROM users ORDER BY created_at DESC`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/users', requireAdmin, async (req, res, next) => {
  try {
    const b = req.body;
    if (!b.email || !b.password) {
      return res.status(400).json({ error: 'email y password son requeridos' });
    }
    if (b.password.length < 8) {
      return res.status(400).json({ error: 'password debe tener al menos 8 caracteres' });
    }
    const hash = await hashPassword(b.password);
    const { rows } = await req.tdb.query(
      `INSERT INTO users (email, nombre, password_hash, rol, verticales, activo)
       VALUES ($1,$2,$3,$4,$5::jsonb,COALESCE($6,TRUE))
       RETURNING id, email, nombre, rol, verticales, activo, created_at`,
      [b.email, b.nombre, hash, b.rol || 'operador',
       JSON.stringify(b.verticales || ['tech','travel','paybridge']), b.activo]);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
    next(e);
  }
});

router.patch('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    const sets = [];
    const params = [];
    if (b.nombre !== undefined)     { params.push(b.nombre);     sets.push(`nombre = $${params.length}`); }
    if (b.rol !== undefined)        { params.push(b.rol);        sets.push(`rol = $${params.length}`); }
    if (b.activo !== undefined)     { params.push(b.activo);     sets.push(`activo = $${params.length}`); }
    if (b.verticales !== undefined) { params.push(JSON.stringify(b.verticales)); sets.push(`verticales = $${params.length}::jsonb`); }
    if (b.password) {
      if (b.password.length < 8) return res.status(400).json({ error: 'password debe tener al menos 8 caracteres' });
      const hash = await hashPassword(b.password);
      params.push(hash); sets.push(`password_hash = $${params.length}`);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada para actualizar' });
    params.push(req.params.id);
    const { rows } = await req.tdb.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, email, nombre, rol, verticales, activo, last_login, created_at`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// ── Audit global ───────────────────────────────────────────────────────
router.get('/audit', async (req, res, next) => {
  try {
    const limit = Math.min(num(req.query.limit, 100), 500);
    const { rows } = await req.tdb.query(
      `SELECT * FROM audit_global ORDER BY created_at DESC LIMIT $1`, [limit]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/audit', async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await req.tdb.query(
      `INSERT INTO audit_global (vertical, usuario, accion, recurso, recurso_id, payload, ip)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING *`,
      [b.vertical, b.usuario, b.accion, b.recurso, b.recurso_id ? String(b.recurso_id) : null,
       JSON.stringify(b.payload || {}), b.ip || req.ip]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// ── Métricas globales (cross-schema) ───────────────────────────────────
router.get('/dashboard', async (req, res, next) => {
  try {
    const q = async (sql) => (await db.query(sql)).rows[0];

    const travel = await q(`
      SELECT
        (SELECT COUNT(*) FROM public.contactos)                                              AS contactos,
        (SELECT COUNT(*) FROM public.cotizaciones WHERE estado != 'borrado')                 AS cotizaciones,
        (SELECT COUNT(*) FROM public.facturas)                                               AS facturas,
        (SELECT COALESCE(SUM(total),0) FROM public.facturas WHERE created_at > NOW() - INTERVAL '30 days') AS facturado_30d
    `);
    const tech = await q(`
      SELECT
        (SELECT COUNT(*) FROM tech.contactos)                                                AS contactos,
        (SELECT COUNT(*) FROM tech.proyectos)                                                AS proyectos,
        (SELECT COUNT(*) FROM tech.facturas)                                                 AS facturas,
        (SELECT COALESCE(SUM(total),0) FROM tech.facturas WHERE created_at > NOW() - INTERVAL '30 days') AS facturado_30d
    `);
    const paybridge = await q(`
      SELECT
        (SELECT COUNT(*) FROM paybridge.contactos)                                           AS contactos,
        (SELECT COUNT(*) FROM paybridge.payment_links WHERE estado='activo')                 AS links_activos,
        (SELECT COUNT(*) FROM paybridge.transactions WHERE estado='completado')              AS tx_completadas,
        (SELECT COALESCE(SUM(fee),0) FROM paybridge.transactions WHERE created_at > NOW() - INTERVAL '30 days') AS fees_30d
    `);
    res.json({ travel, tech, paybridge });
  } catch (e) { next(e); }
});

// ─────────────────────────────────────────────────────────────────────────
//  ARMAN IA — sub-módulo dentro de Admin
// ─────────────────────────────────────────────────────────────────────────

// Sessions
router.get('/ia/sessions', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(
      `SELECT s.*, (SELECT COUNT(*) FROM ia_messages m WHERE m.session_id = s.id) AS msg_count
         FROM ia_sessions s ORDER BY s.updated_at DESC LIMIT 200`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/ia/sessions', async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await req.tdb.query(
      `INSERT INTO ia_sessions (usuario, titulo, vertical, contexto)
       VALUES ($1,$2,$3,$4::jsonb) RETURNING *`,
      [b.usuario || 'admin', b.titulo || 'Nueva sesión', b.vertical || null,
       JSON.stringify(b.contexto || {})]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.get('/ia/sessions/:id/messages', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(
      `SELECT * FROM ia_messages WHERE session_id = $1 ORDER BY created_at`, [req.params.id]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/ia/sessions/:id/messages', async (req, res, next) => {
  try {
    const b = req.body;
    const userMsg = await req.tdb.query(
      `INSERT INTO ia_messages (session_id, rol, contenido) VALUES ($1,'user',$2) RETURNING *`,
      [req.params.id, b.contenido]);

    // Respuesta IA: stub (mock). Cuando se conecte el modelo real, llamar acá
    // a Anthropic/OpenAI/etc. con req.tdb.query como contexto del vertical.
    const reply = `Recibido: "${(b.contenido || '').slice(0, 120)}". (Arman IA está en modo mock — conectar proveedor en services/iaProvider.js para respuestas reales.)`;
    const aiMsg = await req.tdb.query(
      `INSERT INTO ia_messages (session_id, rol, contenido, tokens_in, tokens_out, metadata)
       VALUES ($1,'assistant',$2,$3,$4,$5::jsonb) RETURNING *`,
      [req.params.id, reply, (b.contenido || '').length, reply.length,
       JSON.stringify({ provider: 'mock' })]);

    await req.tdb.query(`UPDATE ia_sessions SET updated_at = NOW() WHERE id = $1`, [req.params.id]);
    res.status(201).json({ user: userMsg.rows[0], assistant: aiMsg.rows[0] });
  } catch (e) { next(e); }
});

// Prompts library
router.get('/ia/prompts', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(`SELECT * FROM ia_prompts WHERE activo ORDER BY categoria, titulo`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/ia/prompts', async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await req.tdb.query(
      `INSERT INTO ia_prompts (slug, titulo, prompt, categoria, vertical, activo)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6,TRUE))
       ON CONFLICT (slug) DO UPDATE SET titulo=EXCLUDED.titulo, prompt=EXCLUDED.prompt,
         categoria=EXCLUDED.categoria, vertical=EXCLUDED.vertical, activo=EXCLUDED.activo
       RETURNING *`,
      [b.slug, b.titulo, b.prompt, b.categoria, b.vertical, b.activo]);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// Acciones (log de operaciones que la IA ejecutó sobre el sistema)
router.get('/ia/acciones', async (req, res, next) => {
  try {
    const { rows } = await req.tdb.query(
      `SELECT * FROM ia_acciones ORDER BY created_at DESC LIMIT 200`);
    res.json(rows);
  } catch (e) { next(e); }
});

module.exports = router;
