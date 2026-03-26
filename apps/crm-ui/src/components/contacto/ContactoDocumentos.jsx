'use strict';

import { useState, useEffect } from 'react';
import { listCotizaciones, listFacturas, listPagos } from '../../api/contactos.js';

async function updateCotizacionEstado(cotId, estado) {
  const res = await fetch(`/api/cotizaciones/${cotId}/estado`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estado }),
  });
  if (!res.ok) throw new Error('Error');
  return res.json();
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('es-AR');
}
function fmtMoney(v) {
  if (!v) return '$0';
  return '$' + Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2 });
}

const DOC_COLORS = { cotizacion: '#3b82f6', factura: '#8b5cf6', recibo: '#06b6d4', pago: '#10b981' };
const ESTADO_BADGE = {
  borrador: '#94a3b8', enviada: '#3b82f6', aceptada: '#10b981', rechazada: '#ef4444', vencida: '#f59e0b',
  emitida: '#3b82f6', pagada: '#10b981', anulada: '#ef4444',
  confirmado: '#10b981', pendiente: '#f59e0b',
};

export default function ContactoDocumentos({ contactoId }) {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState('todos');

  async function load() {
    setLoading(true);
    const [c, f, p] = await Promise.all([
      listCotizaciones(contactoId).catch(() => []),
      listFacturas(contactoId).catch(() => []),
      listPagos(contactoId).catch(() => []),
    ]);
    setCotizaciones(c);
    setFacturas(f);
    setPagos(p);
    setLoading(false);
  }
  useEffect(() => { load(); }, [contactoId]);

  if (loading) return <div className="loading-msg">Cargando documentos...</div>;

  const totalCotizado = cotizaciones.reduce((s, c) => s + Number(c.total || 0), 0);
  const totalFacturado = facturas.reduce((s, f) => s + Number(f.total || 0), 0);
  const totalPagado = pagos.reduce((s, p) => s + Number(p.monto || 0), 0);

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#dbeafe', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6', textTransform: 'uppercase' }}>Cotizado</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1e40af' }}>{fmtMoney(totalCotizado)}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{cotizaciones.length} cotizacion(es)</div>
        </div>
        <div style={{ background: '#ede9fe', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase' }}>Facturado</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#5b21b6' }}>{fmtMoney(totalFacturado)}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{facturas.length} factura(s)</div>
        </div>
        <div style={{ background: '#d1fae5', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#10b981', textTransform: 'uppercase' }}>Pagado</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#065f46' }}>{fmtMoney(totalPagado)}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{pagos.length} pago(s)</div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {['todos','cotizaciones','facturas','pagos'].map(t => (
          <button key={t} className={`btn btn-sm ${subTab === t ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSubTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>

      {/* Cotizaciones */}
      {(subTab === 'todos' || subTab === 'cotizaciones') && cotizaciones.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {subTab === 'todos' && <h3 style={{ fontSize: 13, fontWeight: 700, color: '#3b82f6', marginBottom: 8 }}>COTIZACIONES</h3>}
          {cotizaciones.map(c => (
            <div key={c.id} className="card" style={{ padding: 12, marginBottom: 8, borderLeft: '4px solid #3b82f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700 }}>{c.numero}</span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ background: ESTADO_BADGE[c.estado] || '#94a3b8', color: '#fff', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>{c.estado}</span>
                  {c.estado !== 'aceptada' && c.estado !== 'rechazada' && (
                    <>
                      <button className="btn btn-sm" style={{ background: '#10b981', color: '#fff', padding: '2px 8px', fontSize: 10 }}
                        onClick={async () => { await updateCotizacionEstado(c.id, 'aceptada'); load(); }} title="Aceptar">Aceptar</button>
                      <button className="btn btn-sm" style={{ background: '#ef4444', color: '#fff', padding: '2px 8px', fontSize: 10 }}
                        onClick={async () => { await updateCotizacionEstado(c.id, 'rechazada'); load(); }} title="Rechazar">Rechazar</button>
                    </>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b', marginTop: 6 }}>
                <span>Fecha: {fmtDate(c.fecha)}</span>
                <span>Moneda: {c.moneda}</span>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>Total: {fmtMoney(c.total)}</span>
                {c.validez_dias && <span>Validez: {c.validez_dias} dias</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Facturas */}
      {(subTab === 'todos' || subTab === 'facturas') && facturas.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {subTab === 'todos' && <h3 style={{ fontSize: 13, fontWeight: 700, color: '#8b5cf6', marginBottom: 8 }}>FACTURAS</h3>}
          {facturas.map(f => (
            <div key={f.id} className="card" style={{ padding: 12, marginBottom: 8, borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700 }}>{f.numero} (Tipo {f.tipo})</span>
                <span style={{ background: ESTADO_BADGE[f.estado] || '#94a3b8', color: '#fff', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>{f.estado}</span>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b', marginTop: 6 }}>
                <span>Fecha: {fmtDate(f.fecha)}</span>
                <span>IVA: {fmtMoney(f.iva)}</span>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>Total: {fmtMoney(f.total)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagos */}
      {(subTab === 'todos' || subTab === 'pagos') && pagos.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {subTab === 'todos' && <h3 style={{ fontSize: 13, fontWeight: 700, color: '#10b981', marginBottom: 8 }}>PAGOS</h3>}
          {pagos.map(p => (
            <div key={p.id} className="card" style={{ padding: 12, marginBottom: 8, borderLeft: '4px solid #10b981' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700 }}>{fmtMoney(p.monto)}</span>
                <span style={{ background: ESTADO_BADGE[p.estado] || '#10b981', color: '#fff', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>{p.estado}</span>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b', marginTop: 6 }}>
                <span>Fecha: {fmtDate(p.fecha)}</span>
                {p.medio && <span>Medio: {p.medio}</span>}
                {p.referencia && <span>Ref: {p.referencia}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {!cotizaciones.length && !facturas.length && !pagos.length && (
        <div className="empty-msg">Sin documentos comerciales</div>
      )}
    </div>
  );
}
