// Sub-router CRM generico (notas, tareas, oportunidades, timeline) que se monta
// dentro de los routers de tech y paybridge. El schema sale del tenantMiddleware
// del router padre via req.tdb.

const express = require('express');

function buildCrmRouter() {
  const router = express.Router({ mergeParams: true });

  const num = (v, d = 0) => (v === '' || v == null ? d : Number(v));

  // ── NOTAS ──────────────────────────────────────────────────────────
  router.get('/contactos/:cid/notas', async (req, res, next) => {
    try {
      const { rows } = await req.tdb.query(
        `SELECT * FROM notas WHERE contacto_id = $1 ORDER BY created_at DESC`,
        [req.params.cid]
      );
      res.json(rows);
    } catch (e) { next(e); }
  });

  router.post('/contactos/:cid/notas', async (req, res, next) => {
    try {
      const b = req.body || {};
      if (!b.contenido) return res.status(400).json({ error: 'contenido requerido' });
      const { rows } = await req.tdb.query(
        `INSERT INTO notas (contacto_id, contenido, created_by) VALUES ($1,$2,$3) RETURNING *`,
        [req.params.cid, b.contenido, b.created_by || req.user?.email || null]
      );
      res.status(201).json(rows[0]);
    } catch (e) { next(e); }
  });

  router.delete('/notas/:id', async (req, res, next) => {
    try {
      const { rowCount } = await req.tdb.query(`DELETE FROM notas WHERE id = $1`, [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: 'No encontrada' });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ── TAREAS ─────────────────────────────────────────────────────────
  router.get('/tareas', async (req, res, next) => {
    try {
      const { estado, asignado, contacto_id } = req.query;
      const where = [];
      const params = [];
      if (estado)      { params.push(estado);      where.push(`estado = $${params.length}`); }
      if (asignado)    { params.push(asignado);    where.push(`asignado_a = $${params.length}`); }
      if (contacto_id) { params.push(contacto_id); where.push(`contacto_id = $${params.length}`); }
      const sql = `SELECT t.*, c.nombre AS contacto_nombre FROM tareas t
                   LEFT JOIN contactos c ON c.id = t.contacto_id
                   ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                   ORDER BY (estado='completada')::int, COALESCE(fecha_limite, '9999-12-31'), t.created_at DESC LIMIT 500`;
      const { rows } = await req.tdb.query(sql, params);
      res.json(rows);
    } catch (e) { next(e); }
  });

  router.post('/tareas', async (req, res, next) => {
    try {
      const b = req.body || {};
      if (!b.titulo) return res.status(400).json({ error: 'titulo requerido' });
      const { rows } = await req.tdb.query(
        `INSERT INTO tareas (contacto_id, titulo, descripcion, estado, prioridad, asignado_a, fecha_limite, created_by)
         VALUES ($1,$2,$3,COALESCE($4,'pendiente'),COALESCE($5,'normal'),$6,$7,$8) RETURNING *`,
        [b.contacto_id || null, b.titulo, b.descripcion || null, b.estado, b.prioridad,
         b.asignado_a || null, b.fecha_limite || null, b.created_by || req.user?.email || null]
      );
      res.status(201).json(rows[0]);
    } catch (e) { next(e); }
  });

  router.patch('/tareas/:id', async (req, res, next) => {
    try {
      const b = req.body || {};
      const sets = [], params = [];
      for (const k of ['titulo','descripcion','estado','prioridad','asignado_a','fecha_limite']) {
        if (b[k] !== undefined) { params.push(b[k]); sets.push(`${k} = $${params.length}`); }
      }
      if (b.estado === 'completada') sets.push(`completado_at = NOW()`);
      if (!sets.length) return res.status(400).json({ error: 'Nada para actualizar' });
      params.push(req.params.id);
      const { rows } = await req.tdb.query(
        `UPDATE tareas SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
      );
      if (!rows.length) return res.status(404).json({ error: 'No encontrada' });
      res.json(rows[0]);
    } catch (e) { next(e); }
  });

  router.delete('/tareas/:id', async (req, res, next) => {
    try {
      const { rowCount } = await req.tdb.query(`DELETE FROM tareas WHERE id = $1`, [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: 'No encontrada' });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ── OPORTUNIDADES ─────────────────────────────────────────────────
  router.get('/oportunidades', async (req, res, next) => {
    try {
      const { rows } = await req.tdb.query(
        `SELECT o.*, c.nombre AS contacto_nombre FROM oportunidades o
         LEFT JOIN contactos c ON c.id = o.contacto_id
         ORDER BY o.created_at DESC LIMIT 500`
      );
      res.json(rows);
    } catch (e) { next(e); }
  });

  router.get('/contactos/:cid/oportunidades', async (req, res, next) => {
    try {
      const { rows } = await req.tdb.query(
        `SELECT * FROM oportunidades WHERE contacto_id = $1 ORDER BY created_at DESC`,
        [req.params.cid]
      );
      res.json(rows);
    } catch (e) { next(e); }
  });

  router.post('/contactos/:cid/oportunidades', async (req, res, next) => {
    try {
      const b = req.body || {};
      if (!b.titulo) return res.status(400).json({ error: 'titulo requerido' });
      const { rows } = await req.tdb.query(
        `INSERT INTO oportunidades (contacto_id, titulo, descripcion, valor_estim, moneda, etapa, probabilidad, fecha_cierre, estado_oportunidad, vendedor, created_by)
         VALUES ($1,$2,$3,$4,COALESCE($5,'USD'),COALESCE($6,'descubrimiento'),COALESCE($7,0),$8,COALESCE($9,'abierta'),$10,$11) RETURNING *`,
        [req.params.cid, b.titulo, b.descripcion || null, num(b.valor_estim, null), b.moneda,
         b.etapa, num(b.probabilidad, 0), b.fecha_cierre || null, b.estado_oportunidad,
         b.vendedor || null, b.created_by || req.user?.email || null]
      );
      res.status(201).json(rows[0]);
    } catch (e) { next(e); }
  });

  router.patch('/oportunidades/:id', async (req, res, next) => {
    try {
      const b = req.body || {};
      const sets = [], params = [];
      for (const k of ['titulo','descripcion','valor_estim','moneda','etapa','probabilidad','fecha_cierre','estado_oportunidad','vendedor']) {
        if (b[k] !== undefined) { params.push(b[k]); sets.push(`${k} = $${params.length}`); }
      }
      sets.push(`updated_at = NOW()`);
      if (sets.length === 1) return res.status(400).json({ error: 'Nada para actualizar' });
      params.push(req.params.id);
      const { rows } = await req.tdb.query(
        `UPDATE oportunidades SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
      );
      if (!rows.length) return res.status(404).json({ error: 'No encontrada' });
      res.json(rows[0]);
    } catch (e) { next(e); }
  });

  // ── TIMELINE ──────────────────────────────────────────────────────
  router.get('/contactos/:cid/timeline', async (req, res, next) => {
    try {
      const { rows } = await req.tdb.query(
        `SELECT * FROM timeline WHERE contacto_id = $1 ORDER BY created_at DESC LIMIT 200`,
        [req.params.cid]
      );
      res.json(rows);
    } catch (e) { next(e); }
  });

  router.post('/contactos/:cid/timeline', async (req, res, next) => {
    try {
      const b = req.body || {};
      if (!b.tipo) return res.status(400).json({ error: 'tipo requerido' });
      const { rows } = await req.tdb.query(
        `INSERT INTO timeline (contacto_id, tipo, titulo, descripcion, metadata, usuario)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING *`,
        [req.params.cid, b.tipo, b.titulo || null, b.descripcion || null,
         JSON.stringify(b.metadata || {}), b.usuario || req.user?.email || null]
      );
      res.status(201).json(rows[0]);
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { buildCrmRouter };
