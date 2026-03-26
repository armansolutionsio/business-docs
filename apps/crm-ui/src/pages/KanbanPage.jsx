import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listLeads, updateLead, getParty } from '../api.js';

const COLUMNS = [
  { key: 'NEW', label: 'Nuevo' },
  { key: 'QUALIFIED', label: 'Calificado' },
  { key: 'QUOTE_SENT', label: 'Cotización enviada' },
  { key: 'NEGOTIATION', label: 'Negociación' },
  { key: 'WON', label: 'Ganado' },
  { key: 'LOST', label: 'Perdido' },
];

export default function KanbanPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [parties, setParties] = useState({});
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  useEffect(() => {
    setLoading(true);
    listLeads({ limit: 200 })
      .then(async data => {
        setLeads(data);
        const ids = [...new Set(data.map(l => l.party_id).filter(Boolean))];
        const fetched = {};
        await Promise.all(ids.map(async id => {
          try { fetched[id] = await getParty(id); } catch {}
        }));
        setParties(fetched);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function leadsForColumn(status) {
    return leads.filter(l => l.status === status);
  }

  function handleDragStart(e, lead) {
    setDragging({ id: lead.id, fromStatus: lead.status });
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, colKey) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(colKey);
  }

  function handleDragLeave() {
    setDragOver(null);
  }

  async function handleDrop(e, toStatus) {
    e.preventDefault();
    setDragOver(null);
    if (!dragging || dragging.fromStatus === toStatus) { setDragging(null); return; }

    const { id } = dragging;
    setDragging(null);

    // Optimistic update
    setLeads(ls => ls.map(l => l.id === id ? { ...l, status: toStatus } : l));

    try {
      await updateLead(id, { status: toStatus });
    } catch (err) {
      console.error(err);
      // Revert
      setLeads(ls => ls.map(l => l.id === id ? { ...l, status: dragging.fromStatus } : l));
    }
  }

  if (loading) return <div className="page-container"><p className="loading-msg">Cargando...</p></div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Pipeline Kanban</h1>
      </div>
      <div className="kanban-board">
        {COLUMNS.map(col => (
          <div
            key={col.key}
            className={`kanban-column ${dragOver === col.key ? 'drag-over' : ''}`}
            onDragOver={e => handleDragOver(e, col.key)}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, col.key)}
          >
            <div className="kanban-column-header">
              <span className="kanban-column-title">{col.label}</span>
              <span className="kanban-column-count">{leadsForColumn(col.key).length}</span>
            </div>
            <div className="kanban-cards">
              {leadsForColumn(col.key).map(lead => (
                <div
                  key={lead.id}
                  className={`kanban-card ${dragging?.id === lead.id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={e => handleDragStart(e, lead)}
                  onClick={() => navigate(`/leads/${lead.id}`)}
                >
                  {parties[lead.party_id]?.full_name && (
                    <div className="kanban-card-client">{parties[lead.party_id].full_name}</div>
                  )}
                  <div className="kanban-card-destination">{lead.destination || 'Sin destino'}</div>
                  {lead.source && <div className="kanban-card-source">{lead.source}</div>}
                  {lead.assigned_to && (
                    <div className="kanban-card-assigned">👤 {lead.assigned_to}</div>
                  )}
                  {lead.notes && (
                    <div className="kanban-card-notes">{lead.notes.slice(0, 50)}{lead.notes.length > 50 ? '…' : ''}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
