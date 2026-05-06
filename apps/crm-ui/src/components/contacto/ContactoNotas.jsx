'use strict';

import { useState, useEffect } from 'react';
import { listNotas, createNota } from '../../api/contactos.js';

function fmtDate(d) {
  return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ContactoNotas({ contactoId, user }) {
  const [notas, setNotas] = useState([]);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const data = await listNotas(contactoId);
    setNotas(data);
  }
  useEffect(() => { load(); }, [contactoId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      await createNota(contactoId, { contenido: text.trim(), created_by: user?.email });
      setText('');
      await load();
    } catch (err) { /* toast handled upstream */ }
    setSaving(false);
  }

  return (
    <div>
      <form onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
        <textarea
          value={text} onChange={e => setText(e.target.value)}
          placeholder="Escribir nota interna..."
          rows={3} style={{ marginBottom: 8 }}
        />
        <button className="btn btn-primary btn-sm" disabled={saving || !text.trim()}>
          {saving ? 'Guardando...' : 'Agregar nota'}
        </button>
      </form>

      {!notas.length ? <div className="empty-msg">Sin notas</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notas.map(n => (
            <div key={n.id} className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{n.contenido}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                {fmtDate(n.created_at)} {n.created_by && `— ${n.created_by}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
