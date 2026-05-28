'use strict';

import { useState, useEffect } from 'react';
import { listOportunidades, createOportunidad, updateOportunidad } from '../../api/contactos.js';

const ETAPAS = ['nueva','cotizada','negociacion','ganada','perdida'];
const ETAPA_COLORS = { nueva:'#64748b', cotizada:'#f59e0b', negociacion:'#8b5cf6', ganada:'#10b981', perdida:'#ef4444' };

export default function ContactoOportunidades({ contactoId, user }) {
  const [opps, setOpps] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ titulo: '', destino: '', cantidad_pasajeros: 1, presupuesto_estimado: '' });

  async function load() { setOpps(await listOportunidades(contactoId)); }
  useEffect(() => { load(); }, [contactoId]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.titulo.trim()) return;
    await createOportunidad(contactoId, { ...form, vendedor: user?.email, created_by: user?.email });
    setForm({ titulo: '', destino: '', cantidad_pasajeros: 1, presupuesto_estimado: '' });
    setShowForm(false);
    await load();
  }

  async function changeEtapa(opp, newEtapa) {
    await updateOportunidad(contactoId, opp.id, { estado_oportunidad: newEtapa, _user: user?.email });
    await load();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Nueva oportunidad'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card" style={{ padding: 14, marginBottom: 16 }}>
          <div className="form-row">
            <div className="form-group"><label>Titulo</label>
              <input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ej: Viaje a Cancun" />
            </div>
            <div className="form-group"><label>Destino</label>
              <input value={form.destino} onChange={e => setForm(f => ({ ...f, destino: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Pasajeros</label>
              <input type="number" min={1} value={form.cantidad_pasajeros} onChange={e => setForm(f => ({ ...f, cantidad_pasajeros: e.target.value }))} />
            </div>
            <div className="form-group"><label>Presupuesto estimado</label>
              <input type="number" step="0.01" value={form.presupuesto_estimado} onChange={e => setForm(f => ({ ...f, presupuesto_estimado: e.target.value }))} />
            </div>
          </div>
          <button className="btn btn-primary btn-sm">Crear oportunidad</button>
        </form>
      )}

      {!opps.length ? <div className="empty-msg">Sin oportunidades</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {opps.map(o => (
            <div key={o.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{o.titulo}</span>
                <select value={o.estado_oportunidad} onChange={e => changeEtapa(o, e.target.value)}
                  style={{ fontSize: 11, fontWeight: 700, background: ETAPA_COLORS[o.estado_oportunidad], color: '#fff', border: 'none', borderRadius: 8, padding: '3px 10px', cursor: 'pointer' }}>
                  {ETAPAS.map(e => <option key={e} value={e} style={{ background: '#fff', color: '#333' }}>{e}</option>)}
                </select>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {o.destino && <span>Destino: {o.destino}</span>}
                <span>{o.cantidad_pasajeros} pax</span>
                {o.presupuesto_estimado && <span>Presupuesto: ${Number(o.presupuesto_estimado).toLocaleString()}</span>}
                {o.vendedor && <span>Vendedor: {o.vendedor}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
