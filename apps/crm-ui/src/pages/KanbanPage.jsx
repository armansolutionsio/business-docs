'use strict';

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listContactos, updateContacto } from '../api/contactos.js';
import { useToast } from '../ToastContext.jsx';

const COLUMNS = [
  { key: 'nuevo',      label: 'Nuevo',       color: '#3b82f6' },
  { key: 'contactado', label: 'Contactado',   color: '#06b6d4' },
  { key: 'calificado', label: 'Calificado',   color: '#8b5cf6' },
  { key: 'cotizado',   label: 'Cotizado',     color: '#f59e0b' },
  { key: 'negociacion',label: 'Negociacion',  color: '#d97706' },
  { key: 'ganado',     label: 'Ganado',       color: '#10b981' },
  { key: 'perdido',    label: 'Perdido',      color: '#ef4444' },
  { key: 'dormido',    label: 'Dormido',      color: '#94a3b8' },
];

export default function KanbanPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [contactos, setContactos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [motivoModal, setMotivoModal] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [colSearch, setColSearch] = useState({});

  async function load() {
    setLoading(true);
    try {
      const res = await listContactos({ limit: 500 });
      setContactos(res.data || []);
    } catch (e) { toast('Error cargando pipeline', 'error'); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function handleDragStart(e, id) {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
  }

  async function handleDrop(e, nuevoEstado) {
    e.preventDefault();
    setDragOverCol(null);
    if (!dragId) return;

    const contacto = contactos.find(c => c.id === dragId);
    if (!contacto || contacto.estado === nuevoEstado) { setDragId(null); return; }

    if (nuevoEstado === 'perdido') {
      setMotivoModal({ id: dragId, nuevoEstado });
      setDragId(null);
      return;
    }

    setContactos(prev => prev.map(c => c.id === dragId ? { ...c, estado: nuevoEstado } : c));
    setDragId(null);

    try {
      await updateContacto(dragId, { estado: nuevoEstado });
    } catch (e) {
      toast('Error actualizando estado', 'error');
      load();
    }
  }

  async function confirmMotivo() {
    if (!motivoModal) return;
    const { id, nuevoEstado } = motivoModal;
    setContactos(prev => prev.map(c => c.id === id ? { ...c, estado: nuevoEstado, motivo_perdida: motivo } : c));
    setMotivoModal(null);
    try {
      await updateContacto(id, { estado: nuevoEstado, motivo_perdida: motivo || 'Sin especificar' });
      setMotivo('');
    } catch (e) {
      toast('Error', 'error');
      load();
    }
  }

  const grouped = {};
  COLUMNS.forEach(c => { grouped[c.key] = []; });
  contactos.forEach(c => {
    if (!grouped[c.estado]) return;
    const q = (colSearch[c.estado] || '').toLowerCase();
    if (q) {
      const haystack = [c.nombre, c.apellido, c.razon_social, c.telefono, c.email, c.destino_interes, c.vendedor_asignado, c.origen]
        .filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return;
    }
    grouped[c.estado].push(c);
  });

  if (loading) return <div className="loading-msg">Cargando pipeline...</div>;

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-title">Pipeline Comercial</h1>
        <span style={{ fontSize: 13, color: '#64748b' }}>{contactos.length} contactos</span>
      </div>

      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start' }}>
        {COLUMNS.map(col => (
          <div
            key={col.key}
            onDragOver={e => { e.preventDefault(); setDragOverCol(col.key); }}
            onDragLeave={() => setDragOverCol(null)}
            onDrop={e => handleDrop(e, col.key)}
            style={{
              flex: '0 0 220px', minHeight: 400,
              background: dragOverCol === col.key ? '#f3e8ff' : '#f1f5f9',
              borderRadius: 10, padding: 10,
              outline: dragOverCol === col.key ? '2px dashed #7B2CBF' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: col.color }}></span>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{col.label}</span>
              </div>
              <span style={{ background: 'rgba(0,0,0,.1)', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                {grouped[col.key].length}
              </span>
            </div>

            <input
              placeholder="Buscar..."
              value={colSearch[col.key] || ''}
              onChange={e => setColSearch(prev => ({ ...prev, [col.key]: e.target.value }))}
              style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 8, background: '#fff' }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {grouped[col.key].map(c => {
                const name = c.razon_social || [c.nombre, c.apellido].filter(Boolean).join(' ') || 'Sin nombre';
                return (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={e => handleDragStart(e, c.id)}
                    onClick={() => navigate(`/clientes/${c.id}`)}
                    style={{
                      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                      padding: 10, cursor: 'grab', boxShadow: '0 1px 3px rgba(0,0,0,.08)',
                      borderLeft: `3px solid ${col.color}`,
                      opacity: dragId === c.id ? 0.4 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{name}</span>
                      {c.codigo && <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace' }}>{c.codigo}</span>}
                    </div>
                    {c.destino_interes && <div style={{ fontSize: 11, color: '#7B2CBF', fontWeight: 500, marginTop: 2 }}>{c.destino_interes}</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: '#94a3b8' }}>
                      <span>{c.origen || ''}</span>
                      {c.vendedor_asignado && <span>{c.vendedor_asignado}</span>}
                    </div>
                    {c.proxima_accion && (
                      <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 4, fontWeight: 600 }}>
                        {c.proxima_accion}
                      </div>
                    )}
                    {c.presupuesto && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', marginTop: 3 }}>
                        ${Number(c.presupuesto).toLocaleString()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Motivo de perdida modal */}
      {motivoModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <span className="modal-title">Motivo de perdida</span>
              <button className="modal-close" onClick={() => { setMotivoModal(null); setMotivo(''); load(); }}>&times;</button>
            </div>
            <div className="form-group">
              <label>Por que se perdio esta oportunidad?</label>
              <select value={motivo} onChange={e => setMotivo(e.target.value)} style={{ marginBottom: 8 }}>
                <option value="">Seleccionar motivo...</option>
                <option value="Precio">Precio</option>
                <option value="Timing">Timing / no era el momento</option>
                <option value="Competencia">Se fue con la competencia</option>
                <option value="No responde">No responde</option>
                <option value="Cambio de planes">Cambio de planes</option>
                <option value="Sin presupuesto">Sin presupuesto</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => { setMotivoModal(null); setMotivo(''); load(); }}>Cancelar</button>
              <button className="btn btn-danger" onClick={confirmMotivo}>Confirmar perdida</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
