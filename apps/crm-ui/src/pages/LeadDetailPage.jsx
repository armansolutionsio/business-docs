import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import {
  getLead, updateLead, getParty, listActivityLogs,
} from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Timeline from '../components/Timeline.jsx';
import DocRefsPanel from '../components/DocRefsPanel.jsx';
import TasksPanel from '../components/TasksPanel.jsx';
import QuoteModal from '../components/QuoteModal.jsx';
import CloseWonModal from '../components/CloseWonModal.jsx';

const STATUSES = ['NEW', 'QUALIFIED', 'QUOTE_SENT', 'NEGOTIATION', 'WON', 'LOST'];
const TABS = ['Actividad', 'Documentos', 'Tareas'];

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function LeadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();

  const [lead, setLead] = useState(null);
  const [party, setParty] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState('Actividad');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const [showQuote, setShowQuote] = useState(false);
  const [showWon, setShowWon] = useState(false);
  const [docsRefreshKey, setDocsRefreshKey] = useState(0);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [leadData, logsData] = await Promise.all([
        getLead(id),
        listActivityLogs({ entity_id: id, entity_type: 'lead' }),
      ]);
      setLead(leadData);
      setEditForm({
        status: leadData.status,
        destination: leadData.destination || '',
        source: leadData.source || '',
        assigned_to: leadData.assigned_to || '',
        notes: leadData.notes || '',
      });
      setLogs(logsData);

      if (leadData.party_id) {
        const p = await getParty(leadData.party_id);
        setParty(p);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, [id]);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateLead(id, editForm);
      setLead(updated);
      setEditing(false);
      // Reload logs to reflect status change
      const logsData = await listActivityLogs({ entity_id: id, entity_type: 'lead' });
      setLogs(logsData);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleQuoteSuccess({ docRefId }) {
    setShowQuote(false);
    setDocsRefreshKey(k => k + 1);
    setActiveTab('Documentos');
    // Also move to QUOTE_SENT if still in earlier stage
    if (['NEW', 'QUALIFIED'].includes(lead.status)) {
      updateLead(id, { status: 'QUOTE_SENT' }).then(updated => {
        setLead(updated);
        listActivityLogs({ lead_id: id }).then(setLogs);
      });
    }
  }

  function handleWonSuccess({ saleId }) {
    setShowWon(false);
    loadAll();
  }

  if (loading) return <div className="page-container"><p className="loading-msg">Cargando lead...</p></div>;
  if (!lead) return <div className="page-container"><p className="error-msg">{error || 'Lead no encontrado'}</p></div>;

  return (
    <div className="page-container">
      <div className="lead-detail-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Volver</button>
        <div className="lead-detail-title">
          <h1>{lead.destination || 'Lead sin destino'}</h1>
          <StatusBadge status={lead.status} />
        </div>
        <div className="lead-detail-actions">
          {can('generate_quote') && lead.status !== 'WON' && lead.status !== 'LOST' && (
            <button className="btn btn-secondary" onClick={() => setShowQuote(true)}>
              Generar cotización
            </button>
          )}
          {can('close_won') && lead.status !== 'WON' && lead.status !== 'LOST' && (
            <button className="btn btn-success" onClick={() => setShowWon(true)}>
              Cerrar venta (WON)
            </button>
          )}
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}

      <div className="lead-detail-body">
        {/* Left: info card */}
        <div className="lead-info-card">
          <div className="card-header">
            <span>Información del lead</span>
            {!editing && (
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Editar</button>
            )}
          </div>

          {editing ? (
            <div className="lead-edit-form">
              <div className="form-group">
                <label>Estado</label>
                <select
                  value={editForm.status}
                  onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Destino</label>
                <input
                  value={editForm.destination}
                  onChange={e => setEditForm(f => ({ ...f, destination: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Fuente</label>
                <input
                  value={editForm.source}
                  onChange={e => setEditForm(f => ({ ...f, source: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Asignado a</label>
                <input
                  value={editForm.assigned_to}
                  onChange={e => setEditForm(f => ({ ...f, assigned_to: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Notas</label>
                <textarea
                  value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="form-actions-row">
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancelar</button>
                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          ) : (
            <dl className="info-list">
              <dt>Estado</dt><dd><StatusBadge status={lead.status} /></dd>
              <dt>Destino</dt><dd>{lead.destination || '—'}</dd>
              <dt>Fuente</dt><dd>{lead.source || '—'}</dd>
              <dt>Asignado</dt><dd>{lead.assigned_to || '—'}</dd>
              <dt>Creado</dt><dd>{fmtDateTime(lead.created_at)}</dd>
              <dt>Actualizado</dt><dd>{fmtDateTime(lead.updated_at)}</dd>
              <dt>Notas</dt><dd className="notes-dd">{lead.notes || '—'}</dd>
            </dl>
          )}

          {party && (
            <>
              <div className="card-header card-header-mt">Cliente</div>
              <dl className="info-list">
                <dt>Nombre</dt><dd>{party.full_name || '—'}</dd>
                <dt>{party.doc_type}</dt><dd>{party.doc_number_normalized}</dd>
                {party.email && <><dt>Email</dt><dd>{party.email}</dd></>}
                {party.phone && <><dt>Teléfono</dt><dd>{party.phone}</dd></>}
              </dl>
            </>
          )}
        </div>

        {/* Right: tabs */}
        <div className="lead-tabs-panel">
          <div className="tabs">
            {TABS.map(tab => (
              <button
                key={tab}
                className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="tab-content">
            {activeTab === 'Actividad' && <Timeline logs={logs} />}
            {activeTab === 'Documentos' && <DocRefsPanel leadId={id} refreshKey={docsRefreshKey} />}
            {activeTab === 'Tareas' && <TasksPanel leadId={id} />}
          </div>
        </div>
      </div>

      {showQuote && (
        <QuoteModal
          lead={lead}
          party={party}
          onClose={() => setShowQuote(false)}
          onSuccess={handleQuoteSuccess}
        />
      )}

      {showWon && (
        <CloseWonModal
          lead={lead}
          onClose={() => setShowWon(false)}
          onSuccess={handleWonSuccess}
        />
      )}
    </div>
  );
}
