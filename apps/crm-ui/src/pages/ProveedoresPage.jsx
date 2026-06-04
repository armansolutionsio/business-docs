'use strict';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../ToastContext.jsx';
import { useAuth } from '../AuthContext.jsx';
import {
  listProveedores, createProveedor, updateProveedor,
} from '../api/contactos.js';
import EnviarMailModal from '../components/contacto/EnviarMailModal.jsx';

const TIPOS = [
  { value: 'aerolinea', label: 'Aerolinea' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'excursion', label: 'Excursion' },
  { value: 'seguro', label: 'Seguro' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'receptivo', label: 'Receptivo' },
  { value: 'otro', label: 'Otro' },
];

const TIPO_COLORS = {
  aerolinea: '#0ea5e9',
  hotel: '#8b5cf6',
  excursion: '#f59e0b',
  seguro: '#10b981',
  transfer: '#ec4899',
  receptivo: '#6366f1',
  otro: '#64748b',
};

const ESTADO_COLORS = {
  activo: '#10b981',
  inactivo: '#94a3b8',
  suspendido: '#ef4444',
};

const EMPTY_FORM = {
  razon_social: '', nombre_comercial: '', cuit: '', tipo_proveedor: '',
  contacto_principal: '', telefono: '', email: '', web: '',
  pais: '', provincia: '', localidad: '', direccion: '',
  servicios_que_ofrece: '', destinos_que_opera: '',
  medios_de_pago: '', condiciones_comerciales: '', plazos_de_pago: '',
  ejecutivo_de_cuenta: '', observaciones: '', estado: 'activo',
};

export default function ProveedoresPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const [selected, setSelected] = useState(new Set());
  const [showMailModal, setShowMailModal] = useState(false);

  const [detalleId, setDetalleId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listProveedores({
        search,
        tipo_proveedor: filtroTipo,
        estado: filtroEstado,
      });
      setProveedores(data);
    } catch (e) {
      toast('Error cargando proveedores', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, filtroTipo, filtroEstado]);

  useEffect(() => { load(); }, [load]);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function startEdit(prov) {
    setEditingId(prov.id);
    setForm({ ...EMPTY_FORM, ...prov });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.razon_social.trim()) {
      toast('La razon social es requerida', 'error');
      return;
    }
    try {
      if (editingId) {
        await updateProveedor(editingId, { ...form, _user: user?.email });
        toast('Proveedor actualizado', 'success');
      } else {
        await createProveedor({ ...form, _user: user?.email });
        toast('Proveedor creado', 'success');
      }
      cancelForm();
      await load();
    } catch (err) {
      toast(err.message || 'Error', 'error');
    }
  }

  function toggleSelect(id) {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === proveedores.length) setSelected(new Set());
    else setSelected(new Set(proveedores.map(p => p.id)));
  }

  const selectedProveedores = proveedores.filter(p => selected.has(p.id));
  const detalleProv = detalleId ? proveedores.find(p => p.id === detalleId) : null;

  // Stats por tipo
  const statsPorTipo = TIPOS.map(t => ({
    ...t,
    count: proveedores.filter(p => p.tipo_proveedor === t.value).length,
  })).filter(s => s.count > 0);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Proveedores</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {selected.size > 0 && (
            <button className="btn btn-primary" onClick={() => setShowMailModal(true)}>
              Enviar Mail ({selected.size})
            </button>
          )}
          <button className="btn btn-primary" onClick={startCreate}>
            + Nuevo Proveedor
          </button>
        </div>
      </div>

      {/* Stats */}
      {statsPorTipo.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {statsPorTipo.map(s => (
            <div key={s.value} style={{
              background: TIPO_COLORS[s.value] + '18',
              border: `2px solid ${TIPO_COLORS[s.value]}`,
              borderRadius: 8, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'pointer', fontWeight: filtroTipo === s.value ? 700 : 500, fontSize: 13,
            }}
            onClick={() => setFiltroTipo(filtroTipo === s.value ? '' : s.value)}
            >
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: TIPO_COLORS[s.value] }}></span>
              {s.label} <strong>({s.count})</strong>
            </div>
          ))}
        </div>
      )}

      {/* Formulario crear/editar */}
      {showForm && (
        <form onSubmit={handleSave} className="card" style={{ padding: 20, marginBottom: 20, background: '#faf5ff', border: '1px solid #d8c3ee' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 16, color: '#7B2CBF' }}>
            {editingId ? 'Editar proveedor' : 'Nuevo proveedor'}
          </h3>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Razon Social *</label>
              <input value={form.razon_social} onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Nombre Comercial</label>
              <input value={form.nombre_comercial} onChange={e => setForm(f => ({ ...f, nombre_comercial: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>CUIT</label>
              <input value={form.cuit} onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Tipo</label>
              <select value={form.tipo_proveedor} onChange={e => setForm(f => ({ ...f, tipo_proveedor: e.target.value }))}>
                <option value="">Sin clasificar</option>
                {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Estado</label>
              <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
                <option value="suspendido">Suspendido</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Contacto principal</label>
              <input value={form.contacto_principal} onChange={e => setForm(f => ({ ...f, contacto_principal: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Telefono</label>
              <input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Web</label>
              <input value={form.web} onChange={e => setForm(f => ({ ...f, web: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Pais</label>
              <input value={form.pais} onChange={e => setForm(f => ({ ...f, pais: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Provincia</label>
              <input value={form.provincia} onChange={e => setForm(f => ({ ...f, provincia: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Localidad</label>
              <input value={form.localidad} onChange={e => setForm(f => ({ ...f, localidad: e.target.value }))} />
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Direccion</label>
              <input value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Servicios que ofrece</label>
              <input value={form.servicios_que_ofrece} onChange={e => setForm(f => ({ ...f, servicios_que_ofrece: e.target.value }))} />
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Destinos que opera</label>
              <input value={form.destinos_que_opera} onChange={e => setForm(f => ({ ...f, destinos_que_opera: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Medios de pago</label>
              <input value={form.medios_de_pago} onChange={e => setForm(f => ({ ...f, medios_de_pago: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Condiciones</label>
              <input value={form.condiciones_comerciales} onChange={e => setForm(f => ({ ...f, condiciones_comerciales: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Plazos de pago</label>
              <input value={form.plazos_de_pago} onChange={e => setForm(f => ({ ...f, plazos_de_pago: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Ejecutivo de cuenta</label>
              <input value={form.ejecutivo_de_cuenta} onChange={e => setForm(f => ({ ...f, ejecutivo_de_cuenta: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label>Observaciones</label>
            <textarea rows={3} value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={cancelForm}>Cancelar</button>
            <button type="submit" className="btn btn-primary">{editingId ? 'Guardar cambios' : 'Crear proveedor'}</button>
          </div>
        </form>
      )}

      {/* Filtros */}
      <div className="filters-bar" style={{ marginBottom: 16 }}>
        <select className="filter-select" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="filter-select" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="activo">Activos</option>
          <option value="inactivo">Inactivos</option>
          <option value="suspendido">Suspendidos</option>
        </select>
        <input
          className="filter-input"
          placeholder="Buscar razon social, CUIT, nombre comercial..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#64748b' }}>
          {proveedores.length} proveedor{proveedores.length === 1 ? '' : 'es'}
        </span>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="loading-msg">Cargando...</div>
      ) : !proveedores.length ? (
        <div className="empty-msg" style={{ padding: 40 }}>
          No hay proveedores. Crea el primero con el boton "+ Nuevo Proveedor".
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    checked={proveedores.length > 0 && selected.size === proveedores.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Razon social</th>
                <th>Tipo</th>
                <th>Contacto</th>
                <th>Telefono</th>
                <th>Email</th>
                <th>Localidad</th>
                <th>Estado</th>
                <th style={{ width: 90 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map(p => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setDetalleId(p.id === detalleId ? null : p.id)}>
                  <td onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {p.razon_social}
                    {p.nombre_comercial && p.nombre_comercial !== p.razon_social && (
                      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>{p.nombre_comercial}</div>
                    )}
                  </td>
                  <td>
                    {p.tipo_proveedor ? (
                      <span style={{
                        background: (TIPO_COLORS[p.tipo_proveedor] || '#64748b') + '20',
                        color: TIPO_COLORS[p.tipo_proveedor] || '#64748b',
                        padding: '2px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '.5px',
                      }}>
                        {p.tipo_proveedor}
                      </span>
                    ) : <span style={{ color: '#cbd5e1' }}>-</span>}
                  </td>
                  <td>{p.contacto_principal || '-'}</td>
                  <td>{p.telefono || '-'}</td>
                  <td style={{ fontSize: 12 }}>{p.email || '-'}</td>
                  <td>{p.localidad || '-'}</td>
                  <td>
                    <span style={{
                      background: (ESTADO_COLORS[p.estado] || '#94a3b8') + '20',
                      color: ESTADO_COLORS[p.estado] || '#94a3b8',
                      padding: '2px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                      textTransform: 'uppercase',
                    }}>
                      {p.estado || 'activo'}
                    </span>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn btn-secondary btn-sm" onClick={() => startEdit(p)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detalle inline */}
      {detalleProv && (
        <div className="card" style={{ marginTop: 16, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>{detalleProv.razon_social}</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              {detalleProv.email && (
                <button className="btn btn-primary btn-sm" onClick={() => {
                  setSelected(new Set([detalleProv.id]));
                  setShowMailModal(true);
                }}>
                  Enviar Mail
                </button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => setDetalleId(null)}>Cerrar</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: 13 }}>
            {[
              ['CUIT', detalleProv.cuit],
              ['Tipo', detalleProv.tipo_proveedor],
              ['Contacto', detalleProv.contacto_principal],
              ['Telefono', detalleProv.telefono],
              ['Email', detalleProv.email],
              ['Web', detalleProv.web],
              ['Direccion', [detalleProv.direccion, detalleProv.localidad, detalleProv.provincia, detalleProv.pais].filter(Boolean).join(', ')],
              ['Servicios', detalleProv.servicios_que_ofrece],
              ['Destinos', detalleProv.destinos_que_opera],
              ['Medios de pago', detalleProv.medios_de_pago],
              ['Condiciones', detalleProv.condiciones_comerciales],
              ['Plazos de pago', detalleProv.plazos_de_pago],
              ['Ejecutivo de cuenta', detalleProv.ejecutivo_de_cuenta],
            ].filter(([_, v]) => v).map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.5px' }}>{label}</div>
                <div style={{ marginTop: 2 }}>{value}</div>
              </div>
            ))}
          </div>
          {detalleProv.observaciones && (
            <div style={{ marginTop: 12, padding: 10, background: '#f8fafc', borderRadius: 6, fontSize: 13 }}>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Observaciones</div>
              {detalleProv.observaciones}
            </div>
          )}
        </div>
      )}

      {/* Mail modal */}
      {showMailModal && (
        <EnviarMailModal
          selectedContacts={selectedProveedores}
          audiencia="proveedor"
          user={user}
          onClose={() => setShowMailModal(false)}
          onSent={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}
