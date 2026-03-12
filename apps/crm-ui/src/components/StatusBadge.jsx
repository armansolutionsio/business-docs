const STATUS_LABELS = {
  NEW: 'Nuevo',
  QUALIFIED: 'Calificado',
  QUOTE_SENT: 'Cotización enviada',
  NEGOTIATION: 'Negociación',
  WON: 'Ganado',
  LOST: 'Perdido',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`status-badge status-${status?.toLowerCase()}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
