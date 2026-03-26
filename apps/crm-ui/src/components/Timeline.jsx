function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function describeEvent(log) {
  const p = log.payload || {};
  switch (log.action) {
    case 'CREATE':
      return log.entity_type === 'lead' ? 'Lead creado' : `${log.entity_type} creado`;
    case 'UPDATE':
      if (p.previous_status && p.new_status) {
        return `Estado: ${p.previous_status} → ${p.new_status}`;
      }
      return p.field ? `Campo actualizado: ${p.field}` : 'Lead actualizado';
    case 'STATUS_CHANGE':
      return `Estado: ${p.previous_status || '?'} → ${p.new_status || '?'}`;
    default:
      return log.action;
  }
}

export default function Timeline({ logs }) {
  if (!logs || logs.length === 0) {
    return <p className="empty-msg">Sin actividad registrada.</p>;
  }

  return (
    <ul className="timeline">
      {logs.map(log => (
        <li key={log.id} className="timeline-item">
          <div className="timeline-dot" />
          <div className="timeline-body">
            <div className="timeline-event">{describeEvent(log)}</div>
            <div className="timeline-meta">
              {log.actor_id && <span className="timeline-actor">{log.actor_id}</span>}
              <span className="timeline-date">{fmtDateTime(log.created_at)}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
