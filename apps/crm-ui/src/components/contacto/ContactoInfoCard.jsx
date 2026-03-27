'use strict';

import { useState } from 'react';

const ROLES = ['lead','contacto','cliente','pasajero','proveedor'];

const SECTIONS = [
  { title: 'Datos personales', fields: [
    { key: 'tipo_registro', label: 'Tipo', type: 'select', options: ['persona','empresa'] },
    { key: 'rol_actual', label: 'Rol', type: 'select', options: ROLES },
    { key: 'nombre', label: 'Nombre' },
    { key: 'apellido', label: 'Apellido' },
    { key: 'razon_social', label: 'Razon Social' },
    { key: 'dni', label: 'DNI' },
    { key: 'cuit', label: 'CUIT' },
  ]},
  { title: 'Contacto', fields: [
    { key: 'telefono', label: 'Telefono' },
    { key: 'telefono_secundario', label: 'Tel. Secundario' },
    { key: 'email', label: 'Email' },
    { key: 'email_secundario', label: 'Email Sec.' },
    { key: 'canal_preferido', label: 'Canal preferido', type: 'select', options: ['','whatsapp','email','telefono','presencial'] },
  ]},
  { title: 'Ubicacion', fields: [
    { key: 'domicilio', label: 'Domicilio' },
    { key: 'localidad', label: 'Localidad' },
    { key: 'provincia', label: 'Provincia' },
    { key: 'codigo_postal', label: 'CP' },
    { key: 'pais', label: 'Pais' },
  ]},
  { title: 'Interes comercial', fields: [
    { key: 'destino_interes', label: 'Destino' },
    { key: 'tipo_viaje', label: 'Tipo viaje', type: 'select', options: ['','individual','pareja','familia','grupo','empresa'] },
    { key: 'fecha_viaje_estimada', label: 'Fecha estimada', type: 'date' },
    { key: 'cantidad_pasajeros', label: 'Pasajeros', type: 'number' },
    { key: 'presupuesto', label: 'Presupuesto', type: 'number' },
    { key: 'prioridad', label: 'Prioridad', type: 'select', options: ['baja','media','alta','urgente'] },
    { key: 'probabilidad_cierre', label: 'Probabilidad %', type: 'number' },
  ]},
  { title: 'Seguimiento', fields: [
    { key: 'origen', label: 'Origen' },
    { key: 'vendedor_asignado', label: 'Vendedor' },
    { key: 'proxima_accion', label: 'Proxima accion' },
    { key: 'fecha_proxima_accion', label: 'Fecha prox. accion', type: 'date' },
    { key: 'motivo_perdida', label: 'Motivo perdida' },
  ]},
  { title: 'Permisos y notas', fields: [
    { key: 'consentimiento_whatsapp', label: 'WhatsApp OK', type: 'checkbox' },
    { key: 'consentimiento_email', label: 'Email OK', type: 'checkbox' },
    { key: 'observaciones', label: 'Observaciones', type: 'textarea' },
  ]},
];

export default function ContactoInfoCard({ contacto, onSave }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});

  function startEdit() { setForm({ ...contacto }); setEditing(true); }
  function save() { onSave(form); setEditing(false); }

  function renderField(f) {
    const val = editing ? (form[f.key] ?? '') : (contacto[f.key] ?? '');

    if (!editing) {
      if (f.type === 'checkbox') {
        return <span style={{ color: val ? '#10b981' : '#ef4444', fontWeight: 600 }}>{val ? 'Si' : 'No'}</span>;
      }
      return <span style={{ color: val ? '#1e293b' : '#cbd5e1', fontSize: 13 }}>{val || '—'}</span>;
    }

    if (f.type === 'select') {
      return <select value={val} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={{ fontSize: 12, padding: '4px 6px' }}>
        {f.options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
      </select>;
    }
    if (f.type === 'textarea') {
      return <textarea value={val} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} rows={2} style={{ fontSize: 12 }} />;
    }
    if (f.type === 'checkbox') {
      return <input type="checkbox" checked={!!val} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.checked }))}
        style={{ width: 16, height: 16, accentColor: '#7B2CBF' }} />;
    }
    return <input type={f.type || 'text'} value={val} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={{ fontSize: 12, padding: '4px 6px' }} />;
  }

  // Etiquetas display
  const tags = contacto.etiquetas || [];

  return (
    <div className="card" style={{ fontSize: 13, maxHeight: '85vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, position: 'sticky', top: 0, background: '#fff', paddingBottom: 8, borderBottom: '1px solid #e2e8f0' }}>
        <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 11, color: '#64748b' }}>Ficha</span>
        {!editing ? (
          <button className="btn btn-secondary btn-sm" onClick={startEdit}>Editar</button>
        ) : (
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-primary btn-sm" onClick={save}>Guardar</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>X</button>
          </div>
        )}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
          {tags.map((t, i) => (
            <span key={i} style={{ background: '#f3e8ff', color: '#7B2CBF', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>{t}</span>
          ))}
        </div>
      )}

      {SECTIONS.map(section => (
        <div key={section.title} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#7B2CBF', letterSpacing: 0.5, marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #f0f0f0' }}>
            {section.title}
          </div>
          <dl style={{ margin: 0 }}>
            {section.fields.map(f => (
              <div key={f.key} style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <dt style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', flexShrink: 0, minWidth: 80 }}>{f.label}</dt>
                <dd style={{ margin: 0, textAlign: 'right', flex: 1, minWidth: 0 }}>{renderField(f)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      {contacto.fecha_ultima_interaccion && (
        <div style={{ fontSize: 11, color: '#94a3b8', borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
          Ultima interaccion: {new Date(contacto.fecha_ultima_interaccion).toLocaleDateString('es-AR')}
        </div>
      )}
    </div>
  );
}
