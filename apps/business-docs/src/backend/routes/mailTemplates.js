'use strict';

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { logAudit } = require('../utils/auditLog');

const ALLOWED = ['nombre', 'asunto', 'cuerpo', 'categoria', 'audiencia', 'activo', 'orden', 'notas'];

// GET /api/mail/templates?audiencia=cliente|proveedor&categoria=...&incluir_inactivos=1
router.get('/', async (req, res, next) => {
  try {
    const { audiencia, categoria, search } = req.query;
    const incluirInactivos = req.query.incluir_inactivos === '1' || req.query.incluir_inactivos === 'true';
    const where = [];
    const vals = [];
    let idx = 1;

    if (!incluirInactivos) where.push(`activo = TRUE`);
    if (audiencia) { where.push(`(audiencia = $${idx++} OR audiencia = 'ambos')`); vals.push(audiencia); }
    if (categoria) { where.push(`categoria = $${idx++}`); vals.push(categoria); }
    if (search) {
      where.push(`(nombre ILIKE $${idx} OR asunto ILIKE $${idx} OR cuerpo ILIKE $${idx})`);
      vals.push(`%${search}%`); idx++;
    }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await db.query(
      `SELECT * FROM mail_templates ${whereSQL} ORDER BY audiencia, orden, nombre`,
      vals
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/mail/templates/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM mail_templates WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Template no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/mail/templates
router.post('/', async (req, res, next) => {
  try {
    const { nombre, asunto, cuerpo } = req.body;
    if (!nombre || !asunto || !cuerpo) {
      return res.status(400).json({ error: 'Nombre, asunto y cuerpo son requeridos' });
    }
    const cols = [], vals = [], ph = [];
    let idx = 1;
    for (const f of ALLOWED) {
      if (req.body[f] !== undefined) { cols.push(f); vals.push(req.body[f]); ph.push(`$${idx++}`); }
    }
    cols.push('is_factory'); ph.push('FALSE');
    cols.push('created_by'); ph.push(`$${idx++}`); vals.push(req.body._user || null);

    const { rows } = await db.query(
      `INSERT INTO mail_templates (${cols.join(',')}) VALUES (${ph.join(',')}) RETURNING *`,
      vals
    );
    await logAudit({ tabla: 'mail_templates', registro_id: rows[0].id, accion: 'INSERT', usuario: req.body._user });
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/mail/templates/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const sets = [], vals = [];
    let idx = 1;
    for (const f of ALLOWED) {
      if (req.body[f] !== undefined) { sets.push(`${f} = $${idx++}`); vals.push(req.body[f]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    sets.push('updated_at = NOW()');
    vals.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE mail_templates SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'Template no encontrado' });
    await logAudit({ tabla: 'mail_templates', registro_id: rows[0].id, accion: 'UPDATE', usuario: req.body._user });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/mail/templates/:id  (soft: activo=false; hard si factory bloqueado)
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows: existing } = await db.query('SELECT * FROM mail_templates WHERE id = $1', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: 'Template no encontrado' });
    if (existing[0].is_factory) {
      // No borrar factory, solo desactivar
      const { rows } = await db.query(
        `UPDATE mail_templates SET activo = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      return res.json({ desactivado: true, template: rows[0] });
    }
    await db.query('DELETE FROM mail_templates WHERE id = $1', [req.params.id]);
    await logAudit({ tabla: 'mail_templates', registro_id: req.params.id, accion: 'DELETE', usuario: req.query._user });
    res.json({ borrado: true });
  } catch (err) { next(err); }
});

module.exports = router;
