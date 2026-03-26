'use strict';

const TIPO_ICONS = {
  nota: 'N', tarea: 'T', oportunidad: 'O', conversacion: 'W',
  cotizacion: 'C', venta: 'V', factura: 'F', pago: 'P', audit: 'A',
};
const TIPO_COLORS = {
  nota: '#64748b', tarea: '#f59e0b', oportunidad: '#8b5cf6', conversacion: '#10b981',
  cotizacion: '#3b82f6', venta: '#10b981', factura: '#06b6d4', pago: '#10b981', audit: '#94a3b8',
};

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ContactoTimeline({ timeline }) {
  if (!timeline.length) return <div className="empty-msg">Sin actividad todavia</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {timeline.map((item, i) => (
        <div key={`${item.tipo}-${item.id}`} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: TIPO_COLORS[item.tipo] || '#64748b', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700,
          }}>
            {TIPO_ICONS[item.tipo] || '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              <span style={{ textTransform: 'capitalize' }}>{item.tipo}</span>
            </div>
            <div style={{ fontSize: 13, color: '#475569', marginTop: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {item.resumen}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              {fmtDate(item.created_at)}
              {item.created_by && ` — ${item.created_by}`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
