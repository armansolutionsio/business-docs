'use strict';

import { useState, useEffect, useRef } from 'react';
import { listConversaciones, createConversacion } from '../../api/contactos.js';

function fmtDate(d) {
  return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDay(d) {
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Hoy';
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
}

const CANAL_COLORS = { whatsapp: '#25d366', email: '#3b82f6', telefono: '#f59e0b', presencial: '#8b5cf6' };
const CANAL_LABELS = { whatsapp: 'WhatsApp', email: 'Email', telefono: 'Telefono', presencial: 'Presencial' };

export default function ContactoConversaciones({ contactoId, user }) {
  const [msgs, setMsgs] = useState([]);
  const [files, setFiles] = useState([]);
  const [form, setForm] = useState({ canal: 'whatsapp', tipo: 'entrante', contenido: '' });
  const [saving, setSaving] = useState(false);
  const [filterCanal, setFilterCanal] = useState('');
  const chatEndRef = useRef(null);

  async function load() {
    const [msgsData, filesData] = await Promise.all([
      listConversaciones(contactoId),
      fetch(`/api/whatsapp-sync/files/${contactoId}`).then(r => r.json()).catch(() => []),
    ]);
    setMsgs(msgsData);
    setFiles(filesData);
  }
  useEffect(() => { load(); }, [contactoId]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.contenido.trim()) return;
    setSaving(true);
    await createConversacion(contactoId, { ...form, usuario_responsable: user?.username });
    setForm(f => ({ ...f, contenido: '' }));
    await load();
    setSaving(false);
  }

  // Group messages by day
  const filtered = filterCanal ? msgs.filter(m => m.canal === filterCanal) : msgs;
  const sorted = [...filtered].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const grouped = {};
  sorted.forEach(m => {
    const day = new Date(m.created_at).toDateString();
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(m);
  });

  // Map files to conversacion_id for inline display
  const filesByConv = {};
  files.forEach(f => {
    if (f.conversacion_id) {
      if (!filesByConv[f.conversacion_id]) filesByConv[f.conversacion_id] = [];
      filesByConv[f.conversacion_id].push(f);
    }
  });

  const orphanFiles = files.filter(f => !f.conversacion_id);

  return (
    <div>
      {/* Channel filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={`btn btn-sm ${!filterCanal ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterCanal('')}>
          Todos ({msgs.length})
        </button>
        {['whatsapp', 'email', 'telefono', 'presencial'].map(c => {
          const count = msgs.filter(m => m.canal === c).length;
          if (!count) return null;
          return (
            <button key={c} className={`btn btn-sm ${filterCanal === c ? 'btn-primary' : 'btn-secondary'}`}
              style={filterCanal === c ? { background: CANAL_COLORS[c], borderColor: CANAL_COLORS[c] } : {}}
              onClick={() => setFilterCanal(filterCanal === c ? '' : c)}>
              {CANAL_LABELS[c]} ({count})
            </button>
          );
        })}
      </div>

      {/* Chat view */}
      <div className="wa-chat-container">
        <div className="wa-chat-messages">
          {!sorted.length && <div className="empty-msg">Sin conversaciones</div>}
          {Object.entries(grouped).map(([day, dayMsgs]) => (
            <div key={day}>
              <div className="wa-chat-day-divider">
                <span>{fmtDay(dayMsgs[0].created_at)}</span>
              </div>
              {dayMsgs.map(m => {
                const isSaliente = m.tipo === 'saliente';
                const isNota = m.tipo === 'nota_interna';
                const convFiles = filesByConv[m.id] || [];
                return (
                  <div key={m.id} className={`wa-chat-bubble-row ${isSaliente ? 'wa-outgoing' : isNota ? 'wa-note' : 'wa-incoming'}`}>
                    <div className={`wa-chat-bubble ${isSaliente ? 'wa-bubble-out' : isNota ? 'wa-bubble-note' : 'wa-bubble-in'}`}>
                      {/* Channel badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{
                          width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          background: CANAL_COLORS[m.canal] || '#64748b', color: '#fff', fontSize: 8, fontWeight: 700, flexShrink: 0,
                        }}>
                          {m.canal === 'whatsapp' ? 'W' : m.canal === 'email' ? 'E' : m.canal === 'telefono' ? 'T' : 'P'}
                        </span>
                        <span style={{ fontSize: 10, color: isSaliente ? 'rgba(255,255,255,.7)' : '#94a3b8', fontWeight: 600 }}>
                          {isNota ? 'Nota interna' : isSaliente ? 'Saliente' : 'Entrante'}
                          {m.usuario_responsable ? ` - ${m.usuario_responsable}` : ''}
                        </span>
                      </div>
                      {/* Message content */}
                      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{m.contenido}</div>
                      {/* Attached files */}
                      {convFiles.length > 0 && (
                        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {convFiles.map(f => (
                            <a key={f.id} href={f.url_drive || f.url_local || '#'} target="_blank" rel="noopener noreferrer"
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                                background: 'rgba(0,0,0,.05)', borderRadius: 4, fontSize: 11, textDecoration: 'none',
                                color: isSaliente ? '#fff' : 'var(--brand)',
                              }}>
                              <span>{f.tipo_archivo === 'imagen' ? '🖼' : f.tipo_archivo === 'pdf' ? '📄' : f.tipo_archivo === 'audio' ? '🎵' : f.tipo_archivo === 'video' ? '🎬' : '📎'}</span>
                              <span>{f.nombre_archivo}</span>
                            </a>
                          ))}
                        </div>
                      )}
                      {/* Timestamp */}
                      <div style={{ fontSize: 10, marginTop: 4, textAlign: 'right', opacity: .6 }}>
                        {new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Orphan files (not linked to a specific message) */}
        {orphanFiles.length > 0 && (
          <div style={{ padding: '8px 12px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Archivos ({orphanFiles.length})</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {orphanFiles.map(f => (
                <a key={f.id} href={f.url_drive || f.url_local || '#'} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, textDecoration: 'none', color: 'var(--brand)' }}>
                  <span>{f.tipo_archivo === 'imagen' ? '🖼' : f.tipo_archivo === 'pdf' ? '📄' : '📎'}</span>
                  {f.nombre_archivo}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Compose bar */}
        <form onSubmit={handleSubmit} className="wa-chat-compose">
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <select value={form.canal} onChange={e => setForm(f => ({ ...f, canal: e.target.value }))}
              style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }}>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="telefono">Telefono</option>
              <option value="presencial">Presencial</option>
            </select>
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
              style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }}>
              <option value="entrante">Entrante</option>
              <option value="saliente">Saliente</option>
              <option value="nota_interna">Nota interna</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={form.contenido}
              onChange={e => setForm(f => ({ ...f, contenido: e.target.value }))}
              placeholder="Escribe un mensaje..."
              style={{ flex: 1, borderRadius: 20, padding: '8px 16px', fontSize: 13 }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
            />
            <button type="submit" className="btn btn-primary" disabled={saving || !form.contenido.trim()}
              style={{ borderRadius: 20, padding: '8px 20px' }}>
              {saving ? '...' : 'Enviar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
