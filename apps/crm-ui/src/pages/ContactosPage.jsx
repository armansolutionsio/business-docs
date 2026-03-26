'use strict';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../ToastContext.jsx';

const API = '/api/contactos';

const ESTADOS = ['contacto', 'contactado', 'lead', 'cliente', 'perdido'];
const ESTADO_COLORS = {
  contacto:   '#64748b',
  contactado: '#3b82f6',
  lead:       '#f59e0b',
  cliente:    '#10b981',
  perdido:    '#ef4444',
};
const ESTADO_LABELS = {
  contacto:   'Contacto',
  contactado: 'Contactado',
  lead:       'Lead',
  cliente:    'Cliente',
  perdido:    'Perdido',
};

export default function ContactosPage() {
  const { toast } = useToast();
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [provincias, setProvincias] = useState([]);
  const [localidades, setLocalidades] = useState([]);
  const [stats, setStats] = useState([]);

  // Map data — all contacts (not paginated)
  const [mapData, setMapData] = useState([]);
  const [mapLoading, setMapLoading] = useState(false);

  // Filters
  const [filters, setFilters] = useState({ provincia: '', localidad: '', estado: '', search: '' });
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Edit state
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});

  // View mode: 'table' or 'map'
  const [view, setView] = useState('table');
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef(null);

  // Fetch paginated data for table
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (filters.provincia) q.append('provincia', filters.provincia);
      if (filters.localidad) q.append('localidad', filters.localidad);
      if (filters.estado) q.append('estado', filters.estado);
      if (filters.search) q.append('search', filters.search);
      q.append('limit', PAGE_SIZE);
      q.append('offset', page * PAGE_SIZE);

      const res = await fetch(`${API}?${q}`);
      const json = await res.json();
      setData(json.data);
      setTotal(json.total);
    } catch (e) {
      toast('Error cargando contactos', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  // Fetch ALL contacts for the map (respecting filters but no pagination)
  const fetchMapData = useCallback(async () => {
    setMapLoading(true);
    try {
      const q = new URLSearchParams();
      if (filters.provincia) q.append('provincia', filters.provincia);
      if (filters.localidad) q.append('localidad', filters.localidad);
      if (filters.estado) q.append('estado', filters.estado);
      if (filters.search) q.append('search', filters.search);
      q.append('limit', 10000);
      q.append('offset', 0);

      const res = await fetch(`${API}?${q}`);
      const json = await res.json();
      setMapData(json.data);
    } catch (e) {
      toast('Error cargando mapa', 'error');
    } finally {
      setMapLoading(false);
    }
  }, [filters]);

  const fetchMeta = useCallback(async () => {
    const [provRes, statsRes] = await Promise.all([
      fetch(`${API}/provincias`).then(r => r.json()),
      fetch(`${API}/stats`).then(r => r.json()),
    ]);
    setProvincias(provRes);
    setStats(statsRes);
  }, []);

  const fetchLocalidades = useCallback(async (prov) => {
    const q = prov ? `?provincia=${encodeURIComponent(prov)}` : '';
    const res = await fetch(`${API}/localidades${q}`);
    setLocalidades(await res.json());
  }, []);

  useEffect(() => { fetchMeta(); }, []);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchLocalidades(filters.provincia); }, [filters.provincia]);

  // Fetch all map data when switching to map or when filters change
  useEffect(() => {
    if (view === 'map') fetchMapData();
  }, [view, fetchMapData]);

  // Map initialization
  useEffect(() => {
    if (view !== 'map' || !mapRef.current) return;
    if (mapInstance.current) return;

    const L = window.L;
    if (!L) return;

    const map = L.map(mapRef.current).setView([-34.6, -58.4], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    mapInstance.current = map;
    markersRef.current = L.layerGroup().addTo(map);
  }, [view]);

  // Update markers when mapData changes
  useEffect(() => {
    if (view !== 'map' || !markersRef.current) return;
    const L = window.L;
    if (!L) return;

    markersRef.current.clearLayers();

    const validPoints = mapData.filter(c => c.latitud && c.longitud);
    validPoints.forEach(c => {
      const color = ESTADO_COLORS[c.estado] || '#64748b';
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const marker = L.marker([c.latitud, c.longitud], { icon });
      marker.bindPopup(`
        <div style="font-size:13px;min-width:180px">
          <strong>${c.nombre || 'Sin nombre'}</strong><br/>
          <span style="display:inline-block;background:${color};color:#fff;padding:1px 8px;border-radius:8px;font-size:11px;font-weight:600;margin:4px 0">${ESTADO_LABELS[c.estado]}</span><br/>
          ${c.telefono ? `Tel: ${c.telefono}<br/>` : ''}
          ${c.localidad ? `${c.localidad}, ${c.provincia || ''}` : ''}
        </div>
      `);
      marker.addTo(markersRef.current);
    });

    if (validPoints.length && mapInstance.current) {
      const bounds = L.latLngBounds(validPoints.map(c => [c.latitud, c.longitud]));
      mapInstance.current.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [mapData, view]);

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
        markersRef.current = null;
      }
    };
  }, []);

  // Reset map instance when switching away so it re-initializes
  useEffect(() => {
    if (view !== 'map' && mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
      markersRef.current = null;
    }
  }, [view]);

  function handleFilter(key, value) {
    setPage(0);
    setFilters(f => {
      const next = { ...f, [key]: value };
      if (key === 'provincia') next.localidad = '';
      return next;
    });
  }

  // Quick status change — no need to enter full edit mode
  async function changeEstado(row, newEstado) {
    try {
      const res = await fetch(`${API}/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: newEstado }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const updated = await res.json();
      setData(d => d.map(r => r.id === row.id ? updated : r));
      setMapData(d => d.map(r => r.id === row.id ? updated : r));
      fetchMeta();
    } catch (e) {
      toast(e.message || 'Error actualizando estado', 'error');
    }
  }

  function startEdit(row) {
    setEditId(row.id);
    setEditData({ ...row });
  }

  function cancelEdit() {
    setEditId(null);
    setEditData({});
  }

  async function saveEdit() {
    try {
      const res = await fetch(`${API}/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const updated = await res.json();
      setData(d => d.map(r => r.id === editId ? updated : r));
      setMapData(d => d.map(r => r.id === editId ? updated : r));
      setEditId(null);
      setEditData({});
      toast('Contacto actualizado', 'success');
      fetchMeta();
    } catch (e) {
      toast(e.message || 'Error actualizando', 'error');
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Contactos</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn ${view === 'table' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('table')}>
            Tabla
          </button>
          <button className={`btn ${view === 'map' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('map')}>
            Mapa
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {ESTADOS.map(e => {
          const count = stats.find(s => s.estado === e)?.count || 0;
          return (
            <div key={e} style={{
              background: ESTADO_COLORS[e] + '18',
              border: `2px solid ${ESTADO_COLORS[e]}`,
              borderRadius: 8, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'pointer', fontWeight: filters.estado === e ? 700 : 500, fontSize: 13,
            }}
            onClick={() => handleFilter('estado', filters.estado === e ? '' : e)}
            >
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: ESTADO_COLORS[e] }}></span>
              {ESTADO_LABELS[e]} <strong>({count})</strong>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <select className="filter-select" value={filters.provincia} onChange={e => handleFilter('provincia', e.target.value)}>
          <option value="">Todas las provincias</option>
          {provincias.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="filter-select" value={filters.localidad} onChange={e => handleFilter('localidad', e.target.value)}>
          <option value="">Todas las localidades</option>
          {localidades.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select className="filter-select" value={filters.estado} onChange={e => handleFilter('estado', e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
        </select>
        <input
          className="filter-input"
          placeholder="Buscar nombre, tel, email..."
          value={filters.search}
          onChange={e => handleFilter('search', e.target.value)}
        />
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#64748b' }}>{total} resultados</span>
      </div>

      {/* Map View */}
      {view === 'map' && (
        <>
          {mapLoading && <div className="loading-msg" style={{ marginBottom: 8 }}>Cargando puntos...</div>}
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
            {mapData.filter(c => c.latitud && c.longitud).length} puntos en el mapa
          </div>
          <div ref={mapRef} style={{ width: '100%', height: 600, borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16 }}></div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#64748b' }}>
            {ESTADOS.map(e => (
              <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: ESTADO_COLORS[e], border: '2px solid #fff', boxShadow: '0 0 2px rgba(0,0,0,.3)' }}></span>
                {ESTADO_LABELS[e]}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Table View */}
      {view === 'table' && (
        <>
          <div className="table-wrapper">
            <table className="data-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Estado</th>
                  <th>Nombre</th>
                  <th>Telefono</th>
                  <th>Email</th>
                  <th>Localidad</th>
                  <th>Provincia</th>
                  <th>Domicilio</th>
                  <th>CP</th>
                  <th style={{ width: 70 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="loading-msg">Cargando...</td></tr>
                ) : !data.length ? (
                  <tr><td colSpan={9} className="empty-msg">Sin resultados</td></tr>
                ) : data.map(row => (
                  editId === row.id ? (
                    <tr key={row.id} style={{ background: '#fffbeb' }}>
                      <td>
                        <select value={editData.estado} onChange={e => setEditData(d => ({ ...d, estado: e.target.value }))} style={{ width: 120, fontSize: 12 }}>
                          {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
                        </select>
                      </td>
                      <td><input value={editData.nombre || ''} onChange={e => setEditData(d => ({ ...d, nombre: e.target.value }))} style={{ fontSize: 12 }} /></td>
                      <td><input value={editData.telefono || ''} onChange={e => setEditData(d => ({ ...d, telefono: e.target.value }))} style={{ fontSize: 12 }} /></td>
                      <td><input value={editData.email || ''} onChange={e => setEditData(d => ({ ...d, email: e.target.value }))} style={{ fontSize: 12 }} /></td>
                      <td><input value={editData.localidad || ''} onChange={e => setEditData(d => ({ ...d, localidad: e.target.value }))} style={{ fontSize: 12 }} /></td>
                      <td><input value={editData.provincia || ''} onChange={e => setEditData(d => ({ ...d, provincia: e.target.value }))} style={{ fontSize: 12 }} /></td>
                      <td><input value={editData.domicilio || ''} onChange={e => setEditData(d => ({ ...d, domicilio: e.target.value }))} style={{ fontSize: 12 }} /></td>
                      <td><input value={editData.codigo_postal || ''} onChange={e => setEditData(d => ({ ...d, codigo_postal: e.target.value }))} style={{ fontSize: 12, width: 60 }} /></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-primary btn-sm" onClick={saveEdit}>OK</button>
                          <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>X</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.id}>
                      <td>
                        <select
                          value={row.estado}
                          onChange={e => changeEstado(row, e.target.value)}
                          style={{
                            width: 120, fontSize: 11, fontWeight: 700,
                            background: ESTADO_COLORS[row.estado] || '#64748b',
                            color: '#fff', border: 'none', borderRadius: 10,
                            padding: '3px 8px', cursor: 'pointer',
                            appearance: 'auto',
                          }}
                        >
                          {ESTADOS.map(e => <option key={e} value={e} style={{ background: '#fff', color: '#333' }}>{ESTADO_LABELS[e]}</option>)}
                        </select>
                      </td>
                      <td style={{ fontWeight: 600 }}>{row.nombre}</td>
                      <td>{row.telefono}</td>
                      <td style={{ fontSize: 12 }}>{row.email}</td>
                      <td>{row.localidad}</td>
                      <td>{row.provincia}</td>
                      <td style={{ maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.domicilio}</td>
                      <td>{row.codigo_postal}</td>
                      <td>
                        <button className="btn btn-icon btn-sm" onClick={() => startEdit(row)} title="Editar">
                          Editar
                        </button>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16, alignItems: 'center' }}>
              <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                Anterior
              </button>
              <span style={{ fontSize: 13, color: '#64748b' }}>
                Pagina {page + 1} de {totalPages}
              </span>
              <button className="btn btn-secondary btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
