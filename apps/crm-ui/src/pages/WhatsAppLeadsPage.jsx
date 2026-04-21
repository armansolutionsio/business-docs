'use strict';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../ToastContext.jsx';
import { useAuth } from '../AuthContext.jsx';

const ESTADOS = ['nuevo','contactado','calificado','cotizado','negociacion','ganado','perdido','dormido','cliente_recurrente'];
const ESTADO_COLORS = {
  nuevo:'#3b82f6', contactado:'#06b6d4', calificado:'#8b5cf6', cotizado:'#f59e0b',
  negociacion:'#d97706', ganado:'#10b981', perdido:'#ef4444', dormido:'#94a3b8', cliente_recurrente:'#065f46',
};
const CAMPANA_COLORS = {
  instagram_ad: '#E1306C', facebook_ad: '#1877F2', meta_ad: '#0668E1',
  instagram_organic: '#C13584', facebook_organic: '#4267B2',
  direct: '#25d366', forwarded: '#94a3b8', referral_link: '#f59e0b',
};

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function timeAgo(d) {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

// Parse a CSV line respecting quoted fields (handles JSON inside quotes)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } // escaped quote
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export default function WhatsAppLeadsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ estado: '', search: '' });
  const [sort, setSort] = useState({ field: 'ultimo_contacto', order: 'desc' });
  const [page, setPage] = useState(0);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [syncLog, setSyncLog] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const PAGE_SIZE = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (filters.estado) q.append('estado', filters.estado);
      if (filters.search) q.append('search', filters.search);
      q.append('sort', sort.field);
      q.append('order', sort.order);
      q.append('limit', PAGE_SIZE);
      q.append('offset', page * PAGE_SIZE);
      const res = await fetch(`/api/whatsapp-leads?${q}`);
      const json = await res.json();
      setData(json.data);
      setTotal(json.total);
    } catch (e) {
      toast('Error cargando leads WhatsApp', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, page, sort]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp-leads/stats');
      setStats(await res.json());
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchStats(); }, []);

  function handleFilter(key, value) {
    setPage(0);
    setFilters(f => ({ ...f, [key]: value }));
  }

  function handleSort(field) {
    setPage(0);
    setSort(s => s.field === field
      ? { field, order: s.order === 'asc' ? 'desc' : 'asc' }
      : { field, order: field === 'nombre' ? 'asc' : 'desc' }
    );
  }
  const sortIcon = (field) => sort.field === field ? (sort.order === 'asc' ? ' ▲' : ' ▼') : '';

  // ── CSV Import via Python Pipeline ─────────────────────────────────────────
  async function handleFileUpload(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls', 'txt'].includes(ext)) {
      toast('Formato no soportado. Usar .csv, .xlsx, o .txt', 'error');
      return;
    }

    setImporting(true);
    setImportResult(null);
    try {
      // Read file as base64 (works for both CSV and XLSX)
      const fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/wa-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData, fileName: file.name }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error en importacion');
      setImportResult(result);
      toast(`Importacion OK: ${result.stats?.contactos_creados || 0} contactos creados, ${result.stats?.mensajes_importados || 0} mensajes`, 'success');
      fetchData();
      fetchStats();
      loadSyncLog();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
      setImportResult({ error: e.message });
    } finally {
      setImporting(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileUpload(file);
  }

  function handleFileInput(e) {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  }

  async function loadSyncLog() {
    try {
      const res = await fetch('/api/whatsapp-sync/log');
      setSyncLog(await res.json());
    } catch (e) { /* silent */ }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Aggregate campaigns from current data
  const campaignCounts = {};
  data.forEach(row => {
    const c = row.campana_tipo || 'sin_campana';
    campaignCounts[c] = (campaignCounts[c] || 0) + 1;
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: '#25d366', color: '#fff', width: 32, height: 32, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 }}>W</span>
          Leads WhatsApp
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => { setShowImportModal(true); setImportResult(null); loadSyncLog(); }}>
            Importar CSV / Excel
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="dash-kpi-grid" style={{ marginBottom: 16 }}>
          <div className="dash-kpi-card" style={{ borderLeft: '4px solid #25d366' }}>
            <div className="dash-kpi-label">Total Leads WA</div>
            <div className="dash-kpi-value">{stats.total}</div>
          </div>
          <div className="dash-kpi-card" style={{ borderLeft: '4px solid #3b82f6' }}>
            <div className="dash-kpi-label">Nuevos Hoy</div>
            <div className="dash-kpi-value">{stats.hoy}</div>
          </div>
          <div className="dash-kpi-card" style={{ borderLeft: '4px solid #06b6d4' }}>
            <div className="dash-kpi-label">Total Mensajes</div>
            <div className="dash-kpi-value">{stats.conversaciones?.total_mensajes || 0}</div>
          </div>
          <div className="dash-kpi-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
            <div className="dash-kpi-label">Entrantes</div>
            <div className="dash-kpi-value">{stats.conversaciones?.entrantes || 0}</div>
          </div>
          <div className="dash-kpi-card" style={{ borderLeft: '4px solid #f59e0b' }}>
            <div className="dash-kpi-label">Salientes</div>
            <div className="dash-kpi-value">{stats.conversaciones?.salientes || 0}</div>
          </div>
        </div>
      )}

      {/* Status breakdown */}
      {stats?.por_estado?.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {stats.por_estado.map(s => (
            <div key={s.estado} style={{
              background: (ESTADO_COLORS[s.estado] || '#64748b') + '18',
              border: `2px solid ${ESTADO_COLORS[s.estado] || '#64748b'}`,
              borderRadius: 8, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'pointer', fontWeight: filters.estado === s.estado ? 700 : 500, fontSize: 13,
            }}
            onClick={() => handleFilter('estado', filters.estado === s.estado ? '' : s.estado)}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: ESTADO_COLORS[s.estado] }}></span>
              {s.estado} <strong>({s.count})</strong>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="filters-bar">
        <select className="filter-select" value={filters.estado} onChange={e => handleFilter('estado', e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <input className="filter-input" placeholder="Buscar nombre, tel, email..." value={filters.search}
          onChange={e => handleFilter('search', e.target.value)} />
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#64748b' }}>{total} resultados</span>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="data-table" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ width: '5%' }}>Estado</th>
              <th style={{ width: '12%', cursor: 'pointer' }} onClick={() => handleSort('nombre')}>
                Nombre{sortIcon('nombre')}
              </th>
              <th style={{ width: '9%' }}>Telefono</th>
              <th style={{ width: '10%' }}>Campana</th>
              <th style={{ width: '18%' }}>Ultimo Mensaje</th>
              <th style={{ width: '10%', cursor: 'pointer' }} onClick={() => handleSort('ultimo_contacto')}>
                Ultimo Contacto{sortIcon('ultimo_contacto')}
              </th>
              <th style={{ width: '4%', cursor: 'pointer' }} onClick={() => handleSort('mensajes')}>
                Msgs{sortIcon('mensajes')}
              </th>
              <th style={{ width: '8%' }}>Destino</th>
              <th style={{ width: '6%' }}>Conv.</th>
              <th style={{ width: '8%' }}>Vendedor</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="loading-msg">Cargando...</td></tr>
            ) : !data.length ? (
              <tr><td colSpan={10} className="empty-msg">Sin leads WhatsApp. Importa tu primer CSV.</td></tr>
            ) : data.map(row => (
              <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/contactos/${row.id}`)}>
                <td>
                  <span style={{
                    background: ESTADO_COLORS[row.estado] || '#64748b', color: '#fff',
                    padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                  }}>{row.estado}</span>
                </td>
                <td style={{ fontWeight: 600, color: 'var(--brand)' }}>
                  {row.nombre || row.apellido || row.razon_social || 'Sin nombre'}
                </td>
                <td style={{ fontSize: 12 }}>{row.telefono}</td>
                <td>
                  {row.campana_tipo && row.campana_tipo !== 'direct' ? (
                    <span style={{
                      background: (CAMPANA_COLORS[row.campana_tipo] || '#64748b') + '20',
                      color: CAMPANA_COLORS[row.campana_tipo] || '#64748b',
                      padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                      display: 'inline-block', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={row.campana_publicitaria || ''}>
                      {row.campana_tipo === 'instagram_ad' ? 'IG Ad' :
                       row.campana_tipo === 'facebook_ad' ? 'FB Ad' :
                       row.campana_tipo === 'forwarded' ? 'Reenviado' :
                       row.campana_tipo?.replace('_', ' ')}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>Directo</span>
                  )}
                </td>
                <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.ultimo_mensaje_tipo === 'saliente' && <span style={{ color: '#94a3b8', marginRight: 4 }}>Tu:</span>}
                  {row.ultimo_mensaje || <span style={{ color: '#94a3b8' }}>Sin mensajes</span>}
                </td>
                <td style={{ fontSize: 11 }}>
                  <div style={{ color: '#374151' }}>{fmtDate(row.ultimo_contacto)}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{timeAgo(row.ultimo_contacto)}</div>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ background: '#25d36620', color: '#25d366', padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>
                    {row.wa_messages_count}
                  </span>
                </td>
                <td style={{ fontSize: 11, color: '#64748b', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.destino_interes || '-'}
                </td>
                <td>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 6,
                    background: row.estado_conversacion === 'abierta' ? '#d1fae5' : row.estado_conversacion === 'pendiente' ? '#fef3c7' : '#f1f5f9',
                    color: row.estado_conversacion === 'abierta' ? '#065f46' : row.estado_conversacion === 'pendiente' ? '#92400e' : '#64748b',
                  }}>
                    {row.estado_conversacion || 'sin conv'}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: '#64748b' }}>{row.vendedor_asignado || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button>
          <span style={{ fontSize: 13, color: '#64748b' }}>Pagina {page + 1} de {totalPages}</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Siguiente</button>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => !importing && setShowImportModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Importar Leads WhatsApp</h2>
              <button className="modal-close" onClick={() => !importing && setShowImportModal(false)}>&times;</button>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !importing && fileInputRef.current?.click()}
              style={{
                border: `3px dashed ${dragOver ? '#25d366' : '#d1d5db'}`,
                borderRadius: 12, padding: 40, textAlign: 'center',
                background: dragOver ? '#f0fdf4' : '#f9fafb',
                cursor: importing ? 'wait' : 'pointer',
                transition: 'all .2s',
                marginBottom: 16,
              }}
            >
              <input type="file" ref={fileInputRef} onChange={handleFileInput}
                accept=".csv,.xlsx,.xls,.txt" style={{ display: 'none' }} />

              {importing ? (
                <div>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>...</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#25d366' }}>Procesando con motor de ingenieria de datos...</div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Parseando metadata, detectando campanas, creando contactos...</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>+</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#374151' }}>
                    Arrastra tu archivo CSV o Excel aca
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                    o hace click para seleccionar. Soporta .csv, .xlsx, .txt
                  </div>
                </div>
              )}
            </div>

            {/* Format explanation */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Formato esperado del Google Sheet:</div>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Telefono</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Nombre</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Mensaje</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Fecha</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '4px 8px', fontSize: 10, fontFamily: 'monospace', color: '#64748b' }}>{`{"from":"549...","id":"wamid..."}`}</td>
                    <td style={{ padding: '4px 8px' }}>Juan</td>
                    <td style={{ padding: '4px 8px' }}>Hola, quiero info</td>
                    <td style={{ padding: '4px 8px' }}>2026-03-13T20:11</td>
                    <td style={{ padding: '4px 8px' }}>Nuevo</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                El motor detecta automaticamente: campanas de Instagram/Facebook, mensajes reenviados, destinos de interes, y normaliza telefonos.
              </div>
            </div>

            {/* Import Result */}
            {importResult && !importResult.error && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#166534', marginBottom: 8 }}>Importacion completada</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>{importResult.stats?.contactos_creados || 0}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>Contactos creados</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>{importResult.stats?.contactos_existentes || 0}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>Existentes</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#8b5cf6' }}>{importResult.stats?.mensajes_importados || 0}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>Mensajes</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: importResult.stats?.errores > 0 ? '#ef4444' : '#10b981' }}>{importResult.stats?.errores || 0}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>Errores</div>
                  </div>
                </div>
                {importResult.stats?.campaigns?.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: '1px solid #d1fae5', paddingTop: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#166534', marginBottom: 4 }}>Campanas detectadas:</div>
                    {importResult.stats.campaigns.map((c, i) => (
                      <div key={i} style={{ fontSize: 11, color: '#374151' }}>{c}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {importResult?.error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#991b1b' }}>Error en importacion</div>
                <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>{importResult.error}</div>
              </div>
            )}

            {/* Sync History */}
            {syncLog.length > 0 && (
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>Historial de Importaciones</h4>
                <table className="dash-mini-table">
                  <thead>
                    <tr><th>Fecha</th><th>Fuente</th><th>Procesados</th><th>Creados</th><th>Mensajes</th><th>Errores</th></tr>
                  </thead>
                  <tbody>
                    {syncLog.slice(0, 10).map(s => (
                      <tr key={s.id}>
                        <td>{fmtDate(s.created_at)}</td>
                        <td><span style={{ fontSize: 10, fontWeight: 600, color: s.source === 'python_pipeline' ? '#7B2CBF' : '#64748b' }}>{s.source}</span></td>
                        <td>{s.registros_procesados}</td>
                        <td style={{ color: '#10b981', fontWeight: 600 }}>{s.contactos_creados}</td>
                        <td>{s.mensajes_importados}</td>
                        <td style={{ color: s.errores > 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>{s.errores}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowImportModal(false)} disabled={importing}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
