'use strict';

import { useState } from 'react';

const ROLES = ['lead','contacto','cliente','pasajero','proveedor'];

export default function ContactoInfoCard({ contacto, onSave }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});

  function startEdit() {
    setForm({ ...contacto });
    setEditing(true);
  }

  function save() {
    onSave(form);
    setEditing(false);
  }

  const fields = [
    { key: 'tipo_registro', label: 'Tipo', type: 'select', options: ['persona','empresa'] },
    { key: 'rol_actual', label: 'Rol', type: 'select', options: ROLES },
    { key: 'nombre', label: 'Nombre' },
    { key: 'apellido', label: 'Apellido' },
    { key: 'razon_social', label: 'Razon Social' },
    { key: 'dni', label: 'DNI' },
    { key: 'cuit', label: 'CUIT' },
    { key: 'telefono', label: 'Telefono' },
    { key: 'telefono_secundario', label: 'Tel. Secundario' },
    { key: 'email', label: 'Email' },
    { key: 'email_secundario', label: 'Email Secundario' },
    { key: 'domicilio', label: 'Domicilio' },
    { key: 'localidad', label: 'Localidad' },
    { key: 'provincia', label: 'Provincia' },
    { key: 'codigo_postal', label: 'CP' },
    { key: 'pais', label: 'Pais' },
    { key: 'origen', label: 'Origen' },
    { key: 'vendedor_asignado', label: 'Vendedor' },
    { key: 'canal_preferido', label: 'Canal preferido', type: 'select', options: ['','whatsapp','email','telefono','presencial'] },
    { key: 'observaciones', label: 'Observaciones', type: 'textarea' },
  ];

  return (
    <div className="card" style={{ fontSize: 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 11, color: '#64748b' }}>Datos del contacto</span>
        {!editing ? (
          <button className="btn btn-secondary btn-sm" onClick={startEdit}>Editar</button>
        ) : (
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-primary btn-sm" onClick={save}>Guardar</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>X</button>
          </div>
        )}
      </div>

      <dl style={{ margin: 0 }}>
        {fields.map(f => {
          const val = editing ? (form[f.key] ?? '') : (contacto[f.key] ?? '');
          return (
            <div key={f.key} style={{ marginBottom: 8 }}>
              <dt style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 2 }}>{f.label}</dt>
              <dd style={{ margin: 0 }}>
                {editing ? (
                  f.type === 'select' ? (
                    <select value={val} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={{ fontSize: 12, padding: '4px 6px' }}>
                      {f.options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea value={val} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} rows={2} style={{ fontSize: 12 }} />
                  ) : (
                    <input value={val} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={{ fontSize: 12, padding: '4px 6px' }} />
                  )
                ) : (
                  <span style={{ color: val ? '#1e293b' : '#cbd5e1' }}>{val || '—'}</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      {contacto.fecha_ultima_interaccion && (
        <div style={{ marginTop: 12, fontSize: 11, color: '#94a3b8' }}>
          Ultima interaccion: {new Date(contacto.fecha_ultima_interaccion).toLocaleDateString('es-AR')}
        </div>
      )}
    </div>
  );
}
