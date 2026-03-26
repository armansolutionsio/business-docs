'use strict';

import { useState, useEffect } from 'react';
import { useToast } from '../ToastContext.jsx';

const API = '/api/proveedores';

export default function ProveedoresPage() {
  const { toast } = useToast();
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ razon_social: '', nombre_comercial: '', cuit: '', tipo_proveedor: '', telefono: '', email: '' });

  async function load() {
    setLoading(true);
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`${API}${q}`);
      setProveedores(await res.json());
    } catch (e) { toast('Error cargando proveedores', 'error'); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [search]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.razon_social.trim()) return;
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (res.ok) {
      setForm({ razon_social: '', nombre_comercial: '', cuit: '', tipo_proveedor: '', telefono: '', email: '' });
      setShowForm(false);
      toast('Proveedor creado', 'success');
      await load();
    } else {
      const err = await res.json();
      toast(err.error || 'Error', 'error');
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Proveedores</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Nuevo proveedor'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div className="form-row">
            <div className="form-group"><label>Razon Social</label>
              <input value={form.razon_social} onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))} />
            </div>
            <div className="form-group"><label>Nombre Comercial</label>
              <input value={form.nombre_comercial} onChange={e => setForm(f => ({ ...f, nombre_comercial: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>CUIT</label>
              <input value={form.cuit} onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))} />
            </div>
            <div className="form-group"><label>Tipo</label>
              <select value={form.tipo_proveedor} onChange={e => setForm(f => ({ ...f, tipo_proveedor: e.target.value }))}>
                <option value="">Seleccionar...</option>
                <option value="aerolinea">Aerolinea</option><option value="hotel">Hotel</option>
                <option value="excursion">Excursion</option><option value="seguro">Seguro</option>
                <option value="transfer">Transfer</option><option value="receptivo">Receptivo</option>
                <option value="otro">Otro</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Telefono</label>
              <input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
            </div>
            <div className="form-group"><label>Email</label>
              <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <button className="btn btn-primary btn-sm">Crear</button>
        </form>
      )}

      <div className="filters-bar" style={{ marginBottom: 16 }}>
        <input className="filter-input" placeholder="Buscar proveedor..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? <div className="loading-msg">Cargando...</div> : !proveedores.length ? <div className="empty-msg">Sin proveedores</div> : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead><tr><th>Razon Social</th><th>Nombre Comercial</th><th>Tipo</th><th>CUIT</th><th>Telefono</th><th>Email</th><th>Estado</th></tr></thead>
            <tbody>
              {proveedores.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.razon_social}</td>
                  <td>{p.nombre_comercial}</td>
                  <td>{p.tipo_proveedor}</td>
                  <td>{p.cuit}</td>
                  <td>{p.telefono}</td>
                  <td>{p.email}</td>
                  <td><span className={`badge ${p.estado === 'activo' ? 'badge-WON' : 'badge-LOST'}`}>{p.estado}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
