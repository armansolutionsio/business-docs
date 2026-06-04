'use strict';

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../ToastContext.jsx';
import { useAuth } from '../AuthContext.jsx';

const ESTADO_COLORS = {
  enviado: '#3b82f6',
  entregado: '#06b6d4',
  leido: '#8b5cf6',
  respondido: '#10b981',
  fallido: '#ef4444',
  rebotado: '#f97316',
};
const ESTADO_LABELS = {
  enviado: 'Enviado',
  entregado: 'Entregado',
  leido: 'Leído',
  respondido: 'Respondido',
  fallido: 'Fallido',
  rebotado: 'Rebotado',
};
const ESTADOS = Object.keys(ESTADO_LABELS);

export default function CampaniasPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [campanias, setCampanias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ estado: '', respuesta: '', notas: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (filtroEstado) q.append('estado', filtroEstado);
      if (search) q.append('search', search);
      const res = await fetch(`/api/mail/campanias?${q}`);
      if (!res.ok) throw new Error('Error cargando');
      const data = await res.json();
      setCampanias(data);
    } catch (e) {
      toast('Error cargando campañas', 'error');
    } finally {
      setLoading(false);
    }
  }, [filtroEstado, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function startEdit(camp) {
    setEditingId(camp.id);
    setEditForm({ estado: camp.estado, respuesta: camp.respuesta || '', notas: camp.notas || '' });
  }

  async function saveEdit(camp) {
    try {
      const res = await fetch(`/api/contactos/${camp.contacto_id}/campanias/${camp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error('Error actualizando');
      const updated = await res.json();
      setCampanias(cs => cs.map(c => c.id === camp.id ? { ...c, ...updated } : c));
      setEditingId(null);
      toast('Campaña actualizada', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // Stats
  const stats = ESTADOS.map(e => ({ estado: e, count: campanias.filter(c => c.estado === e).length })).filter(s => s.count > 0);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Mails enviados</h1>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {stats.map(s => (
          <div key={s.estado} style={{
            background: ESTADO_COLORS[s.estado] + '18',
            border: `2px solid ${ESTADO_COLORS[s.estado]}`,
            borderRadius: 8, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8,
            cursor: 'pointer', fontWeight: filtroEstado === s.estado ? 700 : 500, fontSize: 13,
          }}
          onClick={() => setFiltroEstado(filtroEstado === s.estado ? '' : s.estado)}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: ESTADO_COLORS[s.estado] }}></span>
            {ESTADO_LABELS[s.estado]} <strong>({s.count})</strong>
          </div>
        ))}
        {campanias.length > 0 && (
          <div style={{ marginLeft: 'auto', fontSize: 13, color: '#64748b', alignSelf: 'center' }}>
            {campanias.length} total
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="filters-bar" style={{ marginBottom: 16 }}>
        <select className="filter-select" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
        </select>
        <input
          className="filter-input"
          placeholder="Buscar por asunto, destinatario..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-msg">Cargando campañas...</div>
      ) : !campanias.length ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
          No hay campañas de mail registradas.
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Estado</th>
                <th>Asunto</th>
                <th>Contacto</th>
                <th>Destinatario</th>
                <th>Enviado por</th>
                <th style={{ width: 160 }}>Fecha envío</th>
                <th style={{ width: 100 }}>Respuesta</th>
                <th style={{ width: 70 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {campanias.map(camp => {
                const color = ESTADO_COLORS[camp.estado] || '#64748b';
                const isExpanded = expandedId === camp.id;
                const isEditing = editingId === camp.id;

                return [
                  <tr key={camp.id} style={{ cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : camp.id)}>
                    <td>
                      <span style={{
                        background: color, color: '#fff', padding: '2px 8px', borderRadius: 8,
                        fontSize: 11, fontWeight: 700,
                      }}>
                        {ESTADO_LABELS[camp.estado] || camp.estado}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{camp.asunto}</td>
                    <td>
                      <span
                        style={{ color: 'var(--brand)', cursor: 'pointer', fontWeight: 600 }}
                        onClick={e => { e.stopPropagation(); navigate(`/clientes/${camp.contacto_id}`); }}
                      >
                        {camp.contacto_nombre || `#${camp.contacto_id}`}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{camp.destinatario}</td>
                    <td>{camp.enviado_por || '-'}</td>
                    <td style={{ fontSize: 12 }}>{new Date(camp.enviado_at).toLocaleString('es-AR')}</td>
                    <td>
                      {camp.respondido_at ? (
                        <span style={{ color: '#10b981', fontWeight: 600, fontSize: 12 }}>Si</span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: 12 }}>No</span>
                      )}
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); startEdit(camp); }}>
                        Editar
                      </button>
                    </td>
                  </tr>,
                  isExpanded && (
                    <tr key={`${camp.id}-detail`}>
                      <td colSpan={8} style={{ background: '#f8fafc', padding: 16 }}>
                        <div style={{ marginBottom: 10 }}>
                          <strong>Mensaje:</strong>
                          <div style={{
                            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
                            padding: 10, marginTop: 4, fontSize: 13, whiteSpace: 'pre-wrap',
                          }}>
                            {camp.cuerpo}
                          </div>
                        </div>
                        {camp.respuesta && (
                          <div style={{ marginBottom: 10 }}>
                            <strong>Respuesta:</strong>
                            <div style={{
                              background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6,
                              padding: 10, marginTop: 4, fontSize: 13, whiteSpace: 'pre-wrap',
                            }}>
                              {camp.respuesta}
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                              Respondido: {new Date(camp.respondido_at).toLocaleString('es-AR')}
                            </div>
                          </div>
                        )}
                        {camp.notas && <div style={{ fontSize: 13, color: '#64748b' }}><strong>Notas:</strong> {camp.notas}</div>}

                        {isEditing && (
                          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 12 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 10, marginBottom: 10 }}>
                              <div>
                                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Estado</label>
                                <select
                                  value={editForm.estado}
                                  onChange={e => setEditForm(f => ({ ...f, estado: e.target.value }))}
                                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                                >
                                  {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
                                </select>
                              </div>
                              <div>
                                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Notas</label>
                                <input
                                  value={editForm.notas}
                                  onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))}
                                  placeholder="Notas internas..."
                                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                                />
                              </div>
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Respuesta recibida</label>
                              <textarea
                                value={editForm.respuesta}
                                onChange={e => setEditForm(f => ({ ...f, respuesta: e.target.value }))}
                                rows={3}
                                placeholder="Pegá la respuesta del contacto..."
                                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, resize: 'vertical' }}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); setEditingId(null); }}>Cancelar</button>
                              <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); saveEdit(camp); }}>Guardar</button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
