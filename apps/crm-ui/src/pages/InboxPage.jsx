import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { useToast } from '../ToastContext.jsx';
import { listLeads, createLead, upsertParty, getParty } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';

const STATUSES = ['', 'NEW', 'QUALIFIED', 'QUOTE_SENT', 'NEGOTIATION', 'WON', 'LOST'];

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const EMPTY_LEAD = {
  // Datos del cliente (opcional al crear)
  clientName: '',
  clientDoc: '',
  clientEmail: '',
  clientPhone: '',
  // Datos del lead
  destination: '',
  source: '',
  assigned_to: '',
  notes: '',
};

export default function InboxPage() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [leads, setLeads] = useState([]);
  const [parties, setParties] = useState({}); // party_id → party
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newLead, setNewLead] = useState({ ...EMPTY_LEAD, assigned_to: user?.username || '' });
  const [existingClient, setExistingClient] = useState(null); // party found by doc lookup

  const [filters, setFilters] = useState({
    status: '', source: '', destination: '', assigned_to: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listLeads(filters);
      setLeads(data);

      // Fetch parties for leads that have party_id (deduplicated)
      const ids = [...new Set(data.map(l => l.party_id).filter(Boolean))];
      const fetched = {};
      await Promise.all(ids.map(async id => {
        try { fetched[id] = await getParty(id); } catch {}
      }));
      setParties(fetched);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  function handleFilterChange(e) {
    setFilters(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  // Lookup existing party when doc field loses focus
  async function handleDocBlur() {
    const docStr = newLead.clientDoc.trim();
    if (!docStr) { setExistingClient(null); return; }
    try {
      const docNum = docStr.replace(/[-./\s]/g, '');
      const docType = docNum.length <= 8 ? 'DNI' : 'CUIT';
      // upsertParty with only doc data to check if exists (no name/email to avoid overwriting)
      const resp = await fetch(`/api/core/v1/parties?limit=500`);
      if (!resp.ok) return;
      const all = await resp.json();
      const found = all.find(p => p.doc_number_normalized === docNum || p.doc_number_normalized === docStr);
      setExistingClient(found || null);
    } catch { setExistingClient(null); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      let partyId = null;
      let partyWasNew = false;

      if (newLead.clientDoc.trim()) {
        const docStr = newLead.clientDoc.trim();
        const docNum = docStr.replace(/[-./\s]/g, '');
        const docType = docNum.length <= 8 ? 'DNI' : 'CUIT';
        partyWasNew = !existingClient;
        const party = await upsertParty({
          doc_type: docType,
          doc_number: docStr,
          full_name: newLead.clientName || null,
          email: newLead.clientEmail || null,
          phone: newLead.clientPhone || null,
        });
        partyId = party.id;
      }

      const lead = await createLead({
        party_id: partyId,
        destination: newLead.destination || null,
        source: newLead.source || null,
        assigned_to: newLead.assigned_to || null,
        notes: newLead.notes || null,
        status: 'NEW',
      });

      setShowNew(false);
      setNewLead({ ...EMPTY_LEAD, assigned_to: user?.username || '' });
      setExistingClient(null);

      if (partyId && !partyWasNew) {
        toast(`Lead creado y asociado al cliente existente${existingClient?.full_name ? ' ' + existingClient.full_name : ''}.`, 'info');
      } else if (partyId) {
        toast('Lead y cliente creados con éxito.', 'success');
      } else {
        toast('Lead creado con éxito.', 'success');
      }

      navigate(`/leads/${lead.id}`);
    } catch (err) {
      toast(err.message || 'Error al crear el lead.', 'error');
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  function clientLabel(lead) {
    const p = parties[lead.party_id];
    if (p?.full_name) return p.full_name;
    if (p) return p.doc_number_normalized;
    return '—';
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Leads</h1>
        {can('create_lead') && (
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ Nuevo Lead</button>
        )}
      </div>

      <div className="filters-bar">
        <select name="status" value={filters.status} onChange={handleFilterChange} className="filter-select">
          <option value="">Todos los estados</option>
          {STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input name="source" value={filters.source} onChange={handleFilterChange} placeholder="Fuente..." className="filter-input" />
        <input name="destination" value={filters.destination} onChange={handleFilterChange} placeholder="Destino..." className="filter-input" />
        <input name="assigned_to" value={filters.assigned_to} onChange={handleFilterChange} placeholder="Asignado..." className="filter-input" />
        <button className="btn btn-secondary btn-sm" onClick={load}>Buscar</button>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {loading ? (
        <p className="loading-msg">Cargando...</p>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Cliente</th>
                <th>Destino</th>
                <th>Fuente</th>
                <th>Asignado</th>
                <th>Fecha</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 && (
                <tr><td colSpan={7} className="empty-cell">Sin resultados. Creá el primer lead con el botón de arriba.</td></tr>
              )}
              {leads.map(lead => (
                <tr key={lead.id} className="table-row-link" onClick={() => navigate(`/leads/${lead.id}`)}>
                  <td><StatusBadge status={lead.status} /></td>
                  <td className="client-cell">{clientLabel(lead)}</td>
                  <td>{lead.destination || '—'}</td>
                  <td>{lead.source || '—'}</td>
                  <td>{lead.assigned_to || '—'}</td>
                  <td>{fmtDate(lead.created_at)}</td>
                  <td className="notes-cell">{lead.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Nuevo Lead</h2>
              <button className="modal-close" onClick={() => setShowNew(false)}>×</button>
            </div>
            <form onSubmit={handleCreate} className="modal-form">

              <h3 className="form-section-title">Cliente (opcional)</h3>

              {existingClient && (
                <div className="client-exists-banner">
                  <span style={{ fontSize: 20 }}>ℹ</span>
                  <div>
                    <strong>Cliente ya registrado</strong>
                    <span>{existingClient.full_name || existingClient.doc_number_normalized} — el lead se asociará a este cliente.</span>
                  </div>
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label>Nombre completo</label>
                  <input
                    value={newLead.clientName}
                    onChange={e => setNewLead(l => ({ ...l, clientName: e.target.value }))}
                    placeholder="Juan García"
                  />
                </div>
                <div className="form-group">
                  <label>DNI / CUIT</label>
                  <input
                    value={newLead.clientDoc}
                    onChange={e => { setNewLead(l => ({ ...l, clientDoc: e.target.value })); setExistingClient(null); }}
                    onBlur={handleDocBlur}
                    placeholder="30123456 o 20-30123456-7"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={newLead.clientEmail}
                    onChange={e => setNewLead(l => ({ ...l, clientEmail: e.target.value }))}
                    placeholder="juan@email.com"
                  />
                </div>
                <div className="form-group">
                  <label>Teléfono</label>
                  <input
                    value={newLead.clientPhone}
                    onChange={e => setNewLead(l => ({ ...l, clientPhone: e.target.value }))}
                    placeholder="+54 9 11 1234-5678"
                  />
                </div>
              </div>

              <h3 className="form-section-title">Consulta</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Destino</label>
                  <input
                    value={newLead.destination}
                    onChange={e => setNewLead(l => ({ ...l, destination: e.target.value }))}
                    placeholder="ej. Cancún, Europa, Caribe..."
                  />
                </div>
                <div className="form-group">
                  <label>Fuente</label>
                  <input
                    value={newLead.source}
                    onChange={e => setNewLead(l => ({ ...l, source: e.target.value }))}
                    placeholder="ej. Instagram, referido, web..."
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Asignado a</label>
                <input
                  value={newLead.assigned_to}
                  onChange={e => setNewLead(l => ({ ...l, assigned_to: e.target.value }))}
                  placeholder="nacho, agus..."
                />
              </div>
              <div className="form-group">
                <label>Notas</label>
                <textarea
                  value={newLead.notes}
                  onChange={e => setNewLead(l => ({ ...l, notes: e.target.value }))}
                  rows={3}
                  placeholder="Detalles del viaje, preferencias, presupuesto..."
                />
              </div>

              {error && <p className="form-error">{error}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creando...' : 'Crear Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
