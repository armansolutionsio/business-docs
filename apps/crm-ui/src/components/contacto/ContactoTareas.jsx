'use strict';

import { useState, useEffect } from 'react';
import { listTareas, createTarea, updateTarea } from '../../api/contactos.js';

export default function ContactoTareas({ contactoId, user }) {
  const [tareas, setTareas] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ titulo: '', descripcion: '', fecha_vencimiento: '', prioridad: 'media', asignado_a: '' });

  async function load() { setTareas(await listTareas(contactoId)); }
  useEffect(() => { load(); }, [contactoId]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.titulo.trim()) return;
    await createTarea(contactoId, { ...form, created_by: user?.email });
    setForm({ titulo: '', descripcion: '', fecha_vencimiento: '', prioridad: 'media', asignado_a: '' });
    setShowForm(false);
    await load();
  }

  async function toggleDone(t) {
    const newEstado = t.estado === 'completada' ? 'pendiente' : 'completada';
    await updateTarea(contactoId, t.id, { estado: newEstado });
    await load();
  }

  const PRIO_COLORS = { baja: '#94a3b8', media: '#3b82f6', alta: '#f59e0b', urgente: '#ef4444' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Nueva tarea'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card" style={{ padding: 14, marginBottom: 16 }}>
          <div className="form-row">
            <div className="form-group"><label>Titulo</label>
              <input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
            </div>
            <div className="form-group"><label>Fecha limite</label>
              <input type="date" value={form.fecha_vencimiento} onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Prioridad</label>
              <select value={form.prioridad} onChange={e => setForm(f => ({ ...f, prioridad: e.target.value }))}>
                <option value="baja">Baja</option><option value="media">Media</option>
                <option value="alta">Alta</option><option value="urgente">Urgente</option>
              </select>
            </div>
            <div className="form-group"><label>Asignado a</label>
              <input value={form.asignado_a} onChange={e => setForm(f => ({ ...f, asignado_a: e.target.value }))} />
            </div>
          </div>
          <div className="form-group"><label>Descripcion</label>
            <textarea value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} rows={2} />
          </div>
          <button className="btn btn-primary btn-sm">Crear tarea</button>
        </form>
      )}

      {!tareas.length ? <div className="empty-msg">Sin tareas</div> : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {tareas.map(t => (
            <li key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
              <input type="checkbox" checked={t.estado === 'completada'} onChange={() => toggleDone(t)}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--brand)', cursor: 'pointer' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, textDecoration: t.estado === 'completada' ? 'line-through' : 'none', color: t.estado === 'completada' ? '#94a3b8' : '#1e293b' }}>
                  {t.titulo}
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#94a3b8', marginTop: 3, flexWrap: 'wrap' }}>
                  <span style={{ color: PRIO_COLORS[t.prioridad], fontWeight: 600 }}>{t.prioridad}</span>
                  {t.fecha_vencimiento && <span>Vence: {t.fecha_vencimiento}</span>}
                  {t.asignado_a && <span>Asignado: {t.asignado_a}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
