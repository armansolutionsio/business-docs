'use strict';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../ToastContext.jsx';
import { useAuth } from '../AuthContext.jsx';
import {
  listMailTemplates, createMailTemplate, updateMailTemplate, deleteMailTemplate,
} from '../api/contactos.js';

const AUDIENCIAS = [
  { value: 'cliente', label: 'Clientes' },
  { value: 'proveedor', label: 'Proveedores' },
  { value: 'ambos', label: 'Ambos' },
];

const CATEGORIA_COLORS = {
  nuevo: '#3b82f6', contactado: '#06b6d4', cotizado: '#f59e0b',
  negociacion: '#d97706', ganado: '#10b981', dormido: '#94a3b8',
  cotizacion: '#f59e0b', reserva: '#10b981', pago: '#06b6d4',
  consulta: '#8b5cf6', reclamo: '#ef4444', post_venta: '#7c3aed',
};

const EMPTY_FORM = {
  nombre: '', asunto: '', cuerpo: '',
  categoria: '', audiencia: 'cliente', activo: true, orden: 100,
};

export default function TemplatesPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroAudiencia, setFiltroAudiencia] = useState('');
  const [search, setSearch] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMailTemplates({
        audiencia: filtroAudiencia,
        search,
        incluir_inactivos: verInactivos ? '1' : '',
      });
      setTemplates(data);
    } catch (e) {
      toast('Error cargando plantillas', 'error');
    } finally {
      setLoading(false);
    }
  }, [filtroAudiencia, search, verInactivos]);

  useEffect(() => { load(); }, [load]);

  function startCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, audiencia: filtroAudiencia || 'cliente' });
    setShowForm(true);
    setPreview(null);
  }

  function startEdit(tpl) {
    setEditingId(tpl.id);
    setForm({
      nombre: tpl.nombre, asunto: tpl.asunto, cuerpo: tpl.cuerpo,
      categoria: tpl.categoria || '', audiencia: tpl.audiencia,
      activo: tpl.activo, orden: tpl.orden,
    });
    setShowForm(true);
    setPreview(null);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.nombre.trim() || !form.asunto.trim() || !form.cuerpo.trim()) {
      toast('Nombre, asunto y mensaje son requeridos', 'error');
      return;
    }
    try {
      if (editingId) {
        await updateMailTemplate(editingId, { ...form, _user: user?.email });
        toast('Plantilla actualizada', 'success');
      } else {
        await createMailTemplate({ ...form, _user: user?.email });
        toast('Plantilla creada', 'success');
      }
      cancelForm();
      await load();
    } catch (err) {
      toast(err.message || 'Error', 'error');
    }
  }

  async function handleDelete(tpl) {
    const msg = tpl.is_factory
      ? `Desactivar la plantilla del sistema "${tpl.nombre}"?`
      : `Borrar la plantilla "${tpl.nombre}"?`;
    if (!confirm(msg)) return;
    try {
      const res = await deleteMailTemplate(tpl.id);
      toast(res.desactivado ? 'Plantilla desactivada' : 'Plantilla borrada', 'success');
      await load();
    } catch (err) {
      toast(err.message || 'Error', 'error');
    }
  }

  async function handleToggleActive(tpl) {
    try {
      await updateMailTemplate(tpl.id, { activo: !tpl.activo, _user: user?.email });
      await load();
    } catch (err) {
      toast(err.message || 'Error', 'error');
    }
  }

  // Agrupar por audiencia para visualización
  const grupos = ['cliente', 'proveedor', 'ambos'].map(aud => ({
    audiencia: aud,
    items: templates.filter(t => t.audiencia === aud),
  })).filter(g => g.items.length > 0);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Plantillas de Mail</h1>
        <button className="btn btn-primary" onClick={startCreate}>
          + Nueva Plantilla
        </button>
      </div>

      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
        Las plantillas se usan al enviar mails desde <strong>Clientes</strong> y <strong>Proveedores</strong>. Podés
        usar variables como <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>{'{{nombre}}'}</code> que se reemplazan al enviar.
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSave} className="card" style={{ padding: 20, marginBottom: 20, background: '#faf5ff', border: '1px solid #d8c3ee' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 16, color: '#7B2CBF' }}>
            {editingId ? 'Editar plantilla' : 'Nueva plantilla'}
          </h3>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Nombre *</label>
              <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Audiencia *</label>
              <select value={form.audiencia} onChange={e => setForm(f => ({ ...f, audiencia: e.target.value }))}>
                {AUDIENCIAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Categoria</label>
              <input value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} placeholder="cotizacion, pago, ..." />
            </div>
            <div className="form-group" style={{ maxWidth: 100 }}>
              <label>Orden</label>
              <input type="number" value={form.orden} onChange={e => setForm(f => ({ ...f, orden: parseInt(e.target.value) || 100 }))} />
            </div>
          </div>
          <div className="form-group">
            <label>Asunto *</label>
            <input value={form.asunto} onChange={e => setForm(f => ({ ...f, asunto: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Mensaje *</label>
            <textarea
              value={form.cuerpo}
              onChange={e => setForm(f => ({ ...f, cuerpo: e.target.value }))}
              rows={12}
              required
              style={{ fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              Variables: <code>{'{{nombre}}'}</code>, <code>{'{{primer_nombre}}'}</code>, <code>{'{{email}}'}</code>, <code>{'{{telefono}}'}</code>, <code>{'{{empresa}}'}</code>
            </div>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="activo"
              checked={form.activo}
              onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
            />
            <label htmlFor="activo" style={{ margin: 0 }}>Plantilla activa (disponible al enviar mails)</label>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={cancelForm}>Cancelar</button>
            <button type="submit" className="btn btn-primary">{editingId ? 'Guardar cambios' : 'Crear plantilla'}</button>
          </div>
        </form>
      )}

      {/* Filtros */}
      <div className="filters-bar" style={{ marginBottom: 16 }}>
        <select className="filter-select" value={filtroAudiencia} onChange={e => setFiltroAudiencia(e.target.value)}>
          <option value="">Todas las audiencias</option>
          {AUDIENCIAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <input
          className="filter-input"
          placeholder="Buscar nombre, asunto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
          <input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} />
          Ver inactivas
        </label>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#64748b' }}>
          {templates.length} plantilla{templates.length === 1 ? '' : 's'}
        </span>
      </div>

      {loading ? (
        <div className="loading-msg">Cargando...</div>
      ) : !templates.length ? (
        <div className="empty-msg" style={{ padding: 40 }}>Sin plantillas para los filtros aplicados.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {grupos.map(grupo => (
            <div key={grupo.audiencia}>
              <h3 style={{
                fontSize: 13, fontWeight: 700, color: '#475569', textTransform: 'uppercase',
                letterSpacing: '.5px', margin: '0 0 8px 0', paddingBottom: 6, borderBottom: '1px solid #e2e8f0',
              }}>
                {AUDIENCIAS.find(a => a.value === grupo.audiencia)?.label || grupo.audiencia} · {grupo.items.length}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
                {grupo.items.map(tpl => (
                  <div key={tpl.id} className="card" style={{
                    padding: 14, opacity: tpl.activo ? 1 : 0.55, transition: 'opacity .15s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                          {tpl.categoria && (
                            <span style={{
                              background: CATEGORIA_COLORS[tpl.categoria] || '#64748b',
                              color: '#fff', padding: '1px 7px', borderRadius: 6,
                              fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px',
                            }}>
                              {tpl.categoria.replace('_', ' ')}
                            </span>
                          )}
                          {tpl.is_factory && (
                            <span style={{
                              background: '#f1f5f9', color: '#64748b',
                              padding: '1px 7px', borderRadius: 6, fontSize: 9, fontWeight: 700, letterSpacing: '.5px',
                            }}>
                              SISTEMA
                            </span>
                          )}
                          {!tpl.activo && (
                            <span style={{
                              background: '#fee2e2', color: '#991b1b',
                              padding: '1px 7px', borderRadius: 6, fontSize: 9, fontWeight: 700, letterSpacing: '.5px',
                            }}>
                              INACTIVA
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{tpl.nombre}</div>
                        <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tpl.asunto}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      fontSize: 12, color: '#475569', marginBottom: 10,
                      maxHeight: 60, overflow: 'hidden', position: 'relative',
                      lineHeight: 1.4,
                    }}>
                      {tpl.cuerpo.split('\n').slice(0, 3).join(' ').substring(0, 200)}
                      {tpl.cuerpo.length > 200 && '...'}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setPreview(tpl)} style={{ fontSize: 11 }}>
                        Ver completo
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => startEdit(tpl)} style={{ fontSize: 11 }}>
                        Editar
                      </button>
                      {!tpl.is_factory && (
                        <button
                          className="btn btn-sm"
                          onClick={() => handleToggleActive(tpl)}
                          style={{ fontSize: 11, background: tpl.activo ? '#fef3c7' : '#dcfce7', color: tpl.activo ? '#92400e' : '#065f46', border: 'none' }}
                        >
                          {tpl.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      )}
                      <button
                        className="btn btn-sm"
                        onClick={() => handleDelete(tpl)}
                        style={{ fontSize: 11, background: '#fee2e2', color: '#991b1b', border: 'none' }}
                      >
                        {tpl.is_factory ? 'Desactivar' : 'Borrar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal preview */}
      {preview && (
        <div className="modal-overlay" onClick={() => setPreview(null)}>
          <div className="modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{preview.nombre}</h2>
              <button className="modal-close" onClick={() => setPreview(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Asunto</div>
              <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, fontWeight: 600 }}>{preview.asunto}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Mensaje</div>
              <div style={{
                background: '#f8fafc', padding: 14, borderRadius: 6, whiteSpace: 'pre-wrap',
                fontSize: 13, lineHeight: 1.6, maxHeight: 400, overflow: 'auto',
              }}>
                {preview.cuerpo}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setPreview(null)}>Cerrar</button>
              <button className="btn btn-primary" onClick={() => { startEdit(preview); setPreview(null); }}>Editar plantilla</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
