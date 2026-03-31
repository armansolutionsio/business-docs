'use strict';

import { useState, useEffect } from 'react';
import { listCampanias, updateCampania } from '../../api/contactos.js';
import { useToast } from '../../ToastContext.jsx';

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

export default function ContactoCampanias({ contactoId, user }) {
  const { toast } = useToast();
  const [campanias, setCampanias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ estado: '', respuesta: '', notas: '' });

  async function load() {
    try {
      const data = await listCampanias(contactoId);
      setCampanias(data);
    } catch (e) {
      toast('Error cargando campañas', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [contactoId]);

  function startEdit(camp) {
    setEditingId(camp.id);
    setEditForm({ estado: camp.estado, respuesta: camp.respuesta || '', notas: camp.notas || '' });
  }

  async function saveEdit() {
    try {
      const updated = await updateCampania(contactoId, editingId, editForm);
      setCampanias(cs => cs.map(c => c.id === editingId ? updated : c));
      setEditingId(null);
      toast('Campaña actualizada', 'success');
    } catch (e) {
      toast(e.message || 'Error actualizando', 'error');
    }
  }

  if (loading) return <div className="loading-msg">Cargando campañas...</div>;

  if (!campanias.length) {
    return (
      <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
        No se enviaron campañas de mail a este contacto.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
        {campanias.length} mail(s) enviado(s)
      </div>

      {campanias.map(camp => {
        const color = ESTADO_COLORS[camp.estado] || '#64748b';
        const isExpanded = expandedId === camp.id;
        const isEditing = editingId === camp.id;

        return (
          <div key={camp.id} style={{
            border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 8,
            overflow: 'hidden',
          }}>
            {/* Header row */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                cursor: 'pointer', background: isExpanded ? '#f8fafc' : '#fff',
              }}
              onClick={() => setExpandedId(isExpanded ? null : camp.id)}
            >
              <span style={{
                background: color, color: '#fff', padding: '2px 8px', borderRadius: 8,
                fontSize: 11, fontWeight: 700, minWidth: 75, textAlign: 'center',
              }}>
                {ESTADO_LABELS[camp.estado] || camp.estado}
              </span>
              <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{camp.asunto}</span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                {new Date(camp.enviado_at).toLocaleString('es-AR')}
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{isExpanded ? '▲' : '▼'}</span>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div style={{ padding: '12px 14px', borderTop: '1px solid #e2e8f0', background: '#fafafa' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10, fontSize: 13 }}>
                  <div><strong>Para:</strong> {camp.destinatario}</div>
                  <div><strong>Enviado por:</strong> {camp.enviado_por || '-'}</div>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <strong style={{ fontSize: 13 }}>Mensaje:</strong>
                  <div style={{
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
                    padding: 10, marginTop: 4, fontSize: 13, whiteSpace: 'pre-wrap',
                  }}>
                    {camp.cuerpo}
                  </div>
                </div>

                {camp.respuesta && (
                  <div style={{ marginBottom: 10 }}>
                    <strong style={{ fontSize: 13 }}>Respuesta:</strong>
                    <div style={{
                      background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6,
                      padding: 10, marginTop: 4, fontSize: 13, whiteSpace: 'pre-wrap',
                    }}>
                      {camp.respuesta}
                    </div>
                    {camp.respondido_at && (
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                        Respondido: {new Date(camp.respondido_at).toLocaleString('es-AR')}
                      </div>
                    )}
                  </div>
                )}

                {camp.notas && (
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>
                    <strong>Notas:</strong> {camp.notas}
                  </div>
                )}

                {/* Edit form */}
                {isEditing ? (
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10, marginTop: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Estado</label>
                        <select
                          value={editForm.estado}
                          onChange={e => setEditForm(f => ({ ...f, estado: e.target.value }))}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                        >
                          {Object.entries(ESTADO_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Respuesta recibida</label>
                      <textarea
                        value={editForm.respuesta}
                        onChange={e => setEditForm(f => ({ ...f, respuesta: e.target.value }))}
                        rows={3}
                        placeholder="Pegá la respuesta del contacto..."
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, resize: 'vertical' }}
                      />
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Notas internas</label>
                      <input
                        value={editForm.notas}
                        onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))}
                        placeholder="Notas sobre esta campaña..."
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>Cancelar</button>
                      <button className="btn btn-primary btn-sm" onClick={saveEdit}>Guardar</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => startEdit(camp)}>
                      Actualizar estado
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
