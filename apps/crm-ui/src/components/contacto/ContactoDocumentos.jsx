'use strict';

import { useState, useEffect } from 'react';
import { listCotizaciones, listFacturas, listPagos, listRecibos, anularCotizacion, anularRecibo, borrarCotizacion, borrarRecibo } from '../../api/contactos.js';

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
function fmtMoney(v, moneda) {
  if (!v) return '$0';
  const sym = moneda === 'USD' ? 'USD ' : '$';
  return sym + Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2 });
}

const ESTADO_BADGE = {
  borrador: '#94a3b8', enviada: '#3b82f6', aceptada: '#10b981', rechazada: '#ef4444', vencida: '#f59e0b',
  emitida: '#3b82f6', pagada: '#10b981', anulada: '#7f1d1d', anulado: '#7f1d1d',
  confirmado: '#10b981', pendiente: '#f59e0b', activo: '#10b981',
};

export default function ContactoDocumentos({ contactoId }) {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [recibos, setRecibos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState('todos');

  async function load() {
    setLoading(true);
    const [c, f, p, r] = await Promise.all([
      listCotizaciones(contactoId).catch(() => []),
      listFacturas(contactoId).catch(() => []),
      listPagos(contactoId).catch(() => []),
      listRecibos(contactoId).catch(() => []),
    ]);
    setCotizaciones(c);
    setFacturas(f);
    setPagos(p);
    setRecibos(r);
    setLoading(false);
  }
  useEffect(() => { load(); }, [contactoId]);

  async function handleAnularCotizacion(cotId) {
    const motivo = prompt('Motivo de anulación (opcional):');
    if (motivo === null) return; // canceló
    try {
      await anularCotizacion(cotId, { motivo, usuario: 'admin' });
      load();
    } catch (e) {
      alert('Error al anular: ' + e.message);
    }
  }

  async function handleAnularRecibo(recId) {
    const motivo = prompt('Motivo de anulación (opcional):');
    if (motivo === null) return;
    try {
      await anularRecibo(recId, { motivo, usuario: 'admin' });
      load();
    } catch (e) {
      alert('Error al anular: ' + e.message);
    }
  }

  async function handleBorrarCotizacion(cotId, numero) {
    const motivo = prompt(`Eliminar cotización ${numero} (creada por error).\nEl número queda reservado para preservar la correlatividad.\nMotivo (obligatorio):`);
    if (!motivo) return;
    try {
      await borrarCotizacion(cotId, { motivo, usuario: 'admin' });
      load();
    } catch (e) {
      alert('Error al borrar: ' + e.message);
    }
  }

  async function handleBorrarRecibo(recId, numero) {
    const motivo = prompt(`Eliminar recibo ${numero} (creado por error).\nEl número queda reservado para preservar la correlatividad.\nMotivo (obligatorio):`);
    if (!motivo) return;
    try {
      await borrarRecibo(recId, { motivo, usuario: 'admin' });
      load();
    } catch (e) {
      alert('Error al borrar: ' + e.message);
    }
  }

  if (loading) return <div className="loading-msg">Cargando documentos...</div>;

  // Excluir anulados de totales
  const totalCotizado = cotizaciones.filter(c => c.estado !== 'anulada').reduce((s, c) => s + Number(c.total || 0), 0);
  const totalFacturado = facturas.filter(f => f.estado !== 'anulada').reduce((s, f) => s + Number(f.total || 0), 0);
  const totalPagado = pagos.filter(p => p.estado !== 'anulado').reduce((s, p) => s + Number(p.monto || 0), 0);

  const isAnulado = (estado) => estado === 'anulada' || estado === 'anulado';

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#dbeafe', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6', textTransform: 'uppercase' }}>Cotizado</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1e40af' }}>{fmtMoney(totalCotizado)}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{cotizaciones.filter(c => c.estado !== 'anulada').length} cotizacion(es)</div>
        </div>
        <div style={{ background: '#ede9fe', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase' }}>Facturado</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#5b21b6' }}>{fmtMoney(totalFacturado)}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{facturas.filter(f => f.estado !== 'anulada').length} factura(s)</div>
        </div>
        <div style={{ background: '#d1fae5', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#10b981', textTransform: 'uppercase' }}>Pagado</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#065f46' }}>{fmtMoney(totalPagado)}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{pagos.filter(p => p.estado !== 'anulado').length} pago(s)</div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {['todos','cotizaciones','recibos','facturas','pagos'].map(t => (
          <button key={t} className={`btn btn-sm ${subTab === t ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSubTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>

      {/* Cotizaciones */}
      {(subTab === 'todos' || subTab === 'cotizaciones') && cotizaciones.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {subTab === 'todos' && <h3 style={{ fontSize: 13, fontWeight: 700, color: '#3b82f6', marginBottom: 8 }}>COTIZACIONES</h3>}
          {cotizaciones.map(c => {
            const anulado = isAnulado(c.estado);
            return (
              <div key={c.id} className="card" style={{ padding: 12, marginBottom: 8, borderLeft: `4px solid ${anulado ? '#cbd5e1' : '#3b82f6'}`, opacity: anulado ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, textDecoration: anulado ? 'line-through' : 'none' }}>{c.numero}</span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ background: ESTADO_BADGE[c.estado] || '#94a3b8', color: '#fff', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>{c.estado}</span>
                    {!anulado && c.estado !== 'aceptada' && c.estado !== 'rechazada' && (
                      <>
                        <button className="btn btn-sm" style={{ background: '#10b981', color: '#fff', padding: '2px 8px', fontSize: 10 }}
                          onClick={async () => { await updateCotizacionEstado(c.id, 'aceptada'); load(); }}>Aceptar</button>
                        <button className="btn btn-sm" style={{ background: '#ef4444', color: '#fff', padding: '2px 8px', fontSize: 10 }}
                          onClick={async () => { await updateCotizacionEstado(c.id, 'rechazada'); load(); }}>Rechazar</button>
                      </>
                    )}
                    {!anulado && (
                      <button className="btn btn-sm" style={{ background: '#7f1d1d', color: '#fff', padding: '2px 8px', fontSize: 10 }}
                        onClick={() => handleAnularCotizacion(c.id)} title="Anular cotización">Anular</button>
                    )}
                    <button className="btn btn-sm" style={{ background: '#64748b', color: '#fff', padding: '2px 8px', fontSize: 10 }}
                      onClick={() => handleBorrarCotizacion(c.id, c.numero)} title="Eliminar (cargada por error)">Eliminar</button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b', marginTop: 6 }}>
                  <span>Fecha: {fmtDate(c.fecha)}</span>
                  <span>Moneda: {c.moneda}</span>
                  <span style={{ fontWeight: 600, color: anulado ? '#94a3b8' : '#1e293b' }}>Total: {fmtMoney(c.total, c.moneda)}</span>
                  {c.validez_dias && <span>Validez: {c.validez_dias} dias</span>}
                </div>
                {anulado && c.motivo_anulacion && (
                  <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4, fontStyle: 'italic' }}>Motivo: {c.motivo_anulacion}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Recibos */}
      {(subTab === 'todos' || subTab === 'recibos') && recibos.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {subTab === 'todos' && <h3 style={{ fontSize: 13, fontWeight: 700, color: '#06b6d4', marginBottom: 8 }}>RECIBOS</h3>}
          {recibos.map(r => {
            const anulado = isAnulado(r.estado);
            return (
              <div key={r.id} className="card" style={{ padding: 12, marginBottom: 8, borderLeft: `4px solid ${anulado ? '#cbd5e1' : '#06b6d4'}`, opacity: anulado ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, textDecoration: anulado ? 'line-through' : 'none' }}>{r.numero}</span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ background: ESTADO_BADGE[r.estado] || ESTADO_BADGE.activo, color: '#fff', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>{r.estado || 'activo'}</span>
                    {!anulado && (
                      <button className="btn btn-sm" style={{ background: '#7f1d1d', color: '#fff', padding: '2px 8px', fontSize: 10 }}
                        onClick={() => handleAnularRecibo(r.id)} title="Anular recibo">Anular</button>
                    )}
                    <button className="btn btn-sm" style={{ background: '#64748b', color: '#fff', padding: '2px 8px', fontSize: 10 }}
                      onClick={() => handleBorrarRecibo(r.id, r.numero)} title="Eliminar (cargado por error)">Eliminar</button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b', marginTop: 6 }}>
                  <span>Fecha: {fmtDate(r.fecha)}</span>
                  {r.medio_pago && <span>Medio: {r.medio_pago}</span>}
                  <span style={{ fontWeight: 600, color: anulado ? '#94a3b8' : '#1e293b' }}>Monto: {fmtMoney(r.monto, r.moneda)}</span>
                </div>
                {r.notas && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{r.notas}</div>}
                {anulado && r.motivo_anulacion && (
                  <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4, fontStyle: 'italic' }}>Motivo: {r.motivo_anulacion}</div>
                )}
              </div>
            );
          })}
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
          {pagos.map(p => {
            const anulado = p.estado === 'anulado';
            return (
              <div key={p.id} className="card" style={{ padding: 12, marginBottom: 8, borderLeft: `4px solid ${anulado ? '#cbd5e1' : '#10b981'}`, opacity: anulado ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, textDecoration: anulado ? 'line-through' : 'none' }}>{fmtMoney(p.monto)}</span>
                  <span style={{ background: ESTADO_BADGE[p.estado] || '#10b981', color: '#fff', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>{p.estado}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b', marginTop: 6 }}>
                  <span>Fecha: {fmtDate(p.fecha)}</span>
                  {p.medio && <span>Medio: {p.medio}</span>}
                  {p.referencia && <span>Ref: {p.referencia}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!cotizaciones.length && !facturas.length && !pagos.length && !recibos.length && (
        <div className="empty-msg">Sin documentos comerciales</div>
      )}
    </div>
  );
}
