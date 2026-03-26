'use strict';

import { useState, useEffect } from 'react';
import { listConversaciones, createConversacion } from '../../api/contactos.js';

function fmtDate(d) {
  return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const CANAL_ICONS = { whatsapp: 'WA', email: 'EM', telefono: 'TL', presencial: 'PR' };
const TIPO_LABELS = { entrante: 'Entrante', saliente: 'Saliente', nota_interna: 'Nota interna' };

export default function ContactoConversaciones({ contactoId, user }) {
  const [msgs, setMsgs] = useState([]);
  const [form, setForm] = useState({ canal: 'whatsapp', tipo: 'entrante', contenido: '' });
  const [saving, setSaving] = useState(false);

  async function load() { setMsgs(await listConversaciones(contactoId)); }
  useEffect(() => { load(); }, [contactoId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.contenido.trim()) return;
    setSaving(true);
    await createConversacion(contactoId, { ...form, usuario_responsable: user?.username });
    setForm({ canal: 'whatsapp', tipo: 'entrante', contenido: '' });
    await load();
    setSaving(false);
  }

  return (
    <div>
      <form onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
        <div className="form-row">
          <div className="form-group">
            <label>Canal</label>
            <select value={form.canal} onChange={e => setForm(f => ({ ...f, canal: e.target.value }))}>
              <option value="whatsapp">WhatsApp</option><option value="email">Email</option>
              <option value="telefono">Telefono</option><option value="presencial">Presencial</option>
            </select>
          </div>
          <div className="form-group">
            <label>Tipo</label>
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
              <option value="entrante">Entrante</option><option value="saliente">Saliente</option>
              <option value="nota_interna">Nota interna</option>
            </select>
          </div>
        </div>
        <textarea value={form.contenido} onChange={e => setForm(f => ({ ...f, contenido: e.target.value }))}
          placeholder="Contenido del mensaje o nota..." rows={3} style={{ marginBottom: 8 }} />
        <button className="btn btn-primary btn-sm" disabled={saving || !form.contenido.trim()}>
          {saving ? 'Guardando...' : 'Registrar'}
        </button>
      </form>

      {!msgs.length ? <div className="empty-msg">Sin conversaciones</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {msgs.map(m => (
            <div key={m.id} style={{
              display: 'flex', gap: 10, padding: 10, borderRadius: 8,
              background: m.tipo === 'saliente' ? '#f0fdf4' : m.tipo === 'nota_interna' ? '#fefce8' : '#f8fafc',
              border: '1px solid #e2e8f0',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: m.canal === 'whatsapp' ? '#25d366' : '#3b82f6',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700,
              }}>
                {CANAL_ICONS[m.canal] || m.canal[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                  {TIPO_LABELS[m.tipo] || m.tipo} — {fmtDate(m.created_at)}
                  {m.usuario_responsable && ` — ${m.usuario_responsable}`}
                </div>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{m.contenido}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
