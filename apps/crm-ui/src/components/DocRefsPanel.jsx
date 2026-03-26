import { useState, useEffect } from 'react';
import { listDocRefs } from '../api.js';

const DOC_TYPE_LABELS = { QUOTE: 'Cotización', INVOICE: 'Factura', RECEIPT: 'Recibo' };

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDocNumber(docType, num) {
  if (!num) return '—';
  const prefix = { QUOTE: 'COT', INVOICE: 'FAC', RECEIPT: 'REC' }[docType] || docType.slice(0, 3);
  return `${prefix}-${String(num).padStart(4, '0')}`;
}

export default function DocRefsPanel({ leadId, refreshKey }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);
    listDocRefs({ lead_id: leadId })
      .then(setDocs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [leadId, refreshKey]);

  if (loading) return <p className="loading-msg">Cargando documentos...</p>;

  if (docs.length === 0) return <p className="empty-msg">Sin documentos generados.</p>;

  return (
    <div className="doc-refs-panel">
      {docs.map(doc => (
        <div key={doc.id} className="doc-ref-card">
          <div className="doc-ref-header">
            <span className="doc-ref-type">{DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}</span>
            <span className="doc-ref-number">{formatDocNumber(doc.doc_type, doc.doc_number)}</span>
          </div>
          <div className="doc-ref-meta">
            <span className="doc-ref-date">{fmtDate(doc.created_at)}</span>
            {doc.totals?.total && (
              <span className="doc-ref-total">
                Total: {Number(doc.totals.total).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
              </span>
            )}
          </div>
          {doc.external_ref && (
            <div className="doc-ref-extref">Ref: {doc.external_ref}</div>
          )}
          {doc.url && (
            <a href={doc.url} target="_blank" rel="noreferrer" className="doc-ref-link">
              Ver PDF
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
