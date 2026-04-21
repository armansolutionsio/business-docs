'use strict';

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const ESTADO_COLORS = {
  nuevo:'#3b82f6', contactado:'#06b6d4', calificado:'#8b5cf6', cotizado:'#f59e0b',
  negociacion:'#d97706', ganado:'#10b981', perdido:'#ef4444', dormido:'#94a3b8', cliente_recurrente:'#065f46',
};

function fmtMoney(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0);
}
function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-msg">Cargando dashboard...</div>;
  if (!data) return <div className="error-msg">Error cargando datos</div>;

  const { kpis, stats_por_estado, funnel, vendedores, campanias_stats, leads_por_origen, recent_leads, tareas_proximas, oportunidades_abiertas, tiempo_promedio_etapa, revenue_mensual } = data;

  // Funnel bar max for scaling
  const funnelSteps = [
    { label: 'Total', value: funnel.total, color: '#64748b' },
    { label: 'Contactados', value: funnel.contactados, color: '#06b6d4' },
    { label: 'Calificados', value: funnel.calificados, color: '#8b5cf6' },
    { label: 'Cotizados', value: funnel.cotizados, color: '#f59e0b' },
    { label: 'Negociacion', value: funnel.negociacion, color: '#d97706' },
    { label: 'Ganados', value: funnel.ganados, color: '#10b981' },
  ];
  const funnelMax = Math.max(...funnelSteps.map(s => s.value), 1);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Dashboard CEO</h1>
      </div>

      {/* KPI Cards */}
      <div className="dash-kpi-grid">
        <div className="dash-kpi-card" style={{ borderLeft: '4px solid #3b82f6' }}>
          <div className="dash-kpi-label">Leads Hoy</div>
          <div className="dash-kpi-value">{kpis.leads_hoy}</div>
        </div>
        <div className="dash-kpi-card" style={{ borderLeft: '4px solid #06b6d4' }}>
          <div className="dash-kpi-label">Leads Semana</div>
          <div className="dash-kpi-value">{kpis.leads_semana}</div>
        </div>
        <div className="dash-kpi-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
          <div className="dash-kpi-label">Leads Mes</div>
          <div className="dash-kpi-value">{kpis.leads_mes}</div>
        </div>
        <div className="dash-kpi-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="dash-kpi-label">Revenue Total</div>
          <div className="dash-kpi-value">{fmtMoney(kpis.revenue_total)}</div>
        </div>
        <div className="dash-kpi-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div className="dash-kpi-label">Ventas Cerradas</div>
          <div className="dash-kpi-value">{kpis.ventas_count}</div>
        </div>
        <div className="dash-kpi-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="dash-kpi-label">Tasa Conversion</div>
          <div className="dash-kpi-value">{kpis.tasa_conversion}%</div>
        </div>
        <div className="dash-kpi-card" style={{ borderLeft: `4px solid ${kpis.tareas_vencidas > 0 ? '#ef4444' : '#10b981'}` }}>
          <div className="dash-kpi-label">Tareas Vencidas</div>
          <div className="dash-kpi-value" style={{ color: kpis.tareas_vencidas > 0 ? '#ef4444' : '#10b981' }}>{kpis.tareas_vencidas}</div>
        </div>
      </div>

      {/* Two column: Funnel + Pipeline */}
      <div className="dash-grid-2">
        {/* Conversion Funnel */}
        <div className="dash-panel">
          <h3 className="dash-panel-title">Embudo de Conversion</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {funnelSteps.map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 90, fontSize: 12, fontWeight: 600, color: '#64748b', textAlign: 'right' }}>{s.label}</span>
                <div style={{ flex: 1, height: 24, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${(s.value / funnelMax) * 100}%`, height: '100%', background: s.color, borderRadius: 4, minWidth: s.value > 0 ? 20 : 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{s.value}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline Status */}
        <div className="dash-panel">
          <h3 className="dash-panel-title">Contactos por Estado</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {stats_por_estado.map(s => (
              <div key={s.estado} style={{
                background: (ESTADO_COLORS[s.estado] || '#64748b') + '15',
                border: `2px solid ${ESTADO_COLORS[s.estado] || '#64748b'}`,
                borderRadius: 8, padding: '8px 14px', textAlign: 'center', minWidth: 90,
              }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: ESTADO_COLORS[s.estado] }}>{s.count}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'capitalize' }}>{s.estado?.replace('_', ' ')}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Revenue Mensual */}
      {revenue_mensual.length > 0 && (
        <div className="dash-panel" style={{ marginBottom: 16 }}>
          <h3 className="dash-panel-title">Revenue Mensual (ultimos 6 meses)</h3>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 160 }}>
            {revenue_mensual.map(m => {
              const maxRev = Math.max(...revenue_mensual.map(x => parseFloat(x.revenue)), 1);
              const pct = (parseFloat(m.revenue) / maxRev) * 100;
              return (
                <div key={m.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{fmtMoney(m.revenue)}</span>
                  <div style={{ width: '100%', background: '#7B2CBF', borderRadius: '4px 4px 0 0', height: `${Math.max(pct, 4)}%`, minHeight: 4 }} />
                  <span style={{ fontSize: 10, color: '#64748b' }}>{m.mes}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Three column: Vendedores + Origen + Campañas */}
      <div className="dash-grid-3">
        {/* Performance Vendedores */}
        <div className="dash-panel">
          <h3 className="dash-panel-title">Performance Vendedores</h3>
          <table className="dash-mini-table">
            <thead>
              <tr><th>Vendedor</th><th>Total</th><th>Ganados</th><th>Revenue</th></tr>
            </thead>
            <tbody>
              {vendedores.map(v => (
                <tr key={v.vendedor}>
                  <td style={{ fontWeight: 600 }}>{v.vendedor}</td>
                  <td>{v.total}</td>
                  <td style={{ color: '#10b981', fontWeight: 600 }}>{v.ganados}</td>
                  <td>{fmtMoney(v.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Leads por Origen */}
        <div className="dash-panel">
          <h3 className="dash-panel-title">Leads por Origen</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {leads_por_origen.map(o => {
              const maxO = Math.max(...leads_por_origen.map(x => x.count), 1);
              return (
                <div key={o.origen} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 80, fontSize: 12, color: '#64748b', textAlign: 'right', textTransform: 'capitalize' }}>{o.origen}</span>
                  <div style={{ flex: 1, height: 18, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(o.count / maxO) * 100}%`, height: '100%', background: o.origen === 'whatsapp' ? '#25d366' : '#7B2CBF', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6, minWidth: 20 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{o.count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Campañas Stats */}
        <div className="dash-panel">
          <h3 className="dash-panel-title">Campañas Email</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {campanias_stats.map(c => {
              const colors = { enviado: '#3b82f6', entregado: '#06b6d4', leido: '#8b5cf6', respondido: '#10b981', fallido: '#ef4444', rebotado: '#f59e0b' };
              return (
                <div key={c.estado} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: colors[c.estado] || '#64748b', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, textTransform: 'capitalize' }}>{c.estado}</span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{c.count}</span>
                </div>
              );
            })}
            {!campanias_stats.length && <div className="empty-msg">Sin campañas</div>}
          </div>
        </div>
      </div>

      {/* Tiempo Promedio por Etapa */}
      {tiempo_promedio_etapa.length > 0 && (
        <div className="dash-panel" style={{ marginBottom: 16 }}>
          <h3 className="dash-panel-title">Tiempo Promedio por Etapa (dias)</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {tiempo_promedio_etapa.map(t => (
              <div key={t.estado} style={{
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 16px',
                textAlign: 'center', minWidth: 100,
              }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: ESTADO_COLORS[t.estado] || '#64748b' }}>{t.dias_promedio}d</div>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'capitalize' }}>{t.estado?.replace('_', ' ')}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>{t.count} contactos</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom: Recent Leads + Tasks + Opportunities */}
      <div className="dash-grid-3">
        {/* Recent Leads */}
        <div className="dash-panel">
          <h3 className="dash-panel-title">Leads Recientes</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recent_leads.map(l => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                onClick={() => navigate(`/contactos/${l.id}`)}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: ESTADO_COLORS[l.estado], flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {l.nombre || l.apellido || 'Sin nombre'}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{l.origen || 'sin origen'} - {fmtDate(l.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Tasks */}
        <div className="dash-panel">
          <h3 className="dash-panel-title">Tareas Proximas</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tareas_proximas.map(t => {
              const vencida = t.fecha_vencimiento && new Date(t.fecha_vencimiento) < new Date();
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                  onClick={() => navigate(`/contactos/${t.contacto_id}`)}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: vencida ? '#ef4444' : t.prioridad === 'alta' || t.prioridad === 'urgente' ? '#f59e0b' : '#3b82f6',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.titulo}
                    </div>
                    <div style={{ fontSize: 11, color: vencida ? '#ef4444' : '#94a3b8' }}>
                      {t.contacto_nombre} - {fmtDate(t.fecha_vencimiento)} {vencida ? '(VENCIDA)' : ''}
                    </div>
                  </div>
                </div>
              );
            })}
            {!tareas_proximas.length && <div className="empty-msg">Sin tareas pendientes</div>}
          </div>
        </div>

        {/* Open Opportunities */}
        <div className="dash-panel">
          <h3 className="dash-panel-title">Oportunidades Abiertas</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {oportunidades_abiertas.map(o => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                onClick={() => navigate(`/contactos/${o.contacto_id}`)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.titulo}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {o.contacto_nombre} - {o.destino || 'sin destino'}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#7B2CBF' }}>{fmtMoney(o.presupuesto_estimado)}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{o.probabilidad_cierre || 0}%</div>
                </div>
              </div>
            ))}
            {!oportunidades_abiertas.length && <div className="empty-msg">Sin oportunidades abiertas</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
