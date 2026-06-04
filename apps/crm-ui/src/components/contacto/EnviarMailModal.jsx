'use strict';

import { useState, useEffect, useRef } from 'react';
import { sendMail, listMailTemplates, listAttachableDocs } from '../../api/contactos.js';
import { useToast } from '../../ToastContext.jsx';

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatMoney(n, moneda) {
  const v = parseFloat(n || 0);
  const sym = moneda === 'USD' ? 'USD ' : moneda === 'EUR' ? 'EUR ' : '$';
  return sym + v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ESTADO_COLORS = {
  nuevo: '#3b82f6', contactado: '#06b6d4', cotizado: '#f59e0b',
  negociacion: '#d97706', ganado: '#10b981', dormido: '#94a3b8',
  cotizacion: '#f59e0b', reserva: '#10b981', pago: '#06b6d4',
  consulta: '#8b5cf6', reclamo: '#ef4444', post_venta: '#7c3aed',
};

/**
 * Props:
 *  - selectedContacts: array de {id, nombre, apellido, razon_social, email, ...}
 *  - audiencia: 'cliente' | 'proveedor' (default 'cliente'). Define que templates se cargan
 *    y a que endpoint van los IDs en /api/mail/send.
 *  - onClose, onSent, user
 */
export default function EnviarMailModal({ selectedContacts, audiencia = 'cliente', onClose, onSent, user }) {
  const { toast } = useToast();
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [sending, setSending] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [vista, setVista] = useState('templates'); // 'templates' | 'compose'
  const [adjuntos, setAdjuntos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Templates desde DB
  const [templates, setTemplates] = useState([]);
  const [loadingTpl, setLoadingTpl] = useState(true);

  // Documentos del sistema (cotizaciones, recibos) - solo cuando hay 1 contacto cliente
  const [docsContacto, setDocsContacto] = useState({ cotizaciones: [], recibos: [] });
  const [docsSeleccionados, setDocsSeleccionados] = useState([]); // [{tipo, id}]

  const sinEmail = selectedContacts.filter(c => !c.email);
  const conEmail = selectedContacts.filter(c => c.email);
  const unicoContactoCliente = audiencia === 'cliente' && conEmail.length === 1 ? conEmail[0] : null;

  // Cargar templates
  useEffect(() => {
    setLoadingTpl(true);
    listMailTemplates({ audiencia })
      .then(setTemplates)
      .catch(() => toast('Error cargando plantillas', 'error'))
      .finally(() => setLoadingTpl(false));
  }, [audiencia]);

  // Cargar documentos adjuntables del contacto (solo 1 cliente seleccionado)
  useEffect(() => {
    if (!unicoContactoCliente) { setDocsContacto({ cotizaciones: [], recibos: [] }); return; }
    listAttachableDocs(unicoContactoCliente.id)
      .then(setDocsContacto)
      .catch(() => {});
  }, [unicoContactoCliente?.id]);

  function applyTemplate(tpl) {
    setAsunto(tpl.asunto);
    setCuerpo(tpl.cuerpo);
    setVista('compose');
  }

  function toggleDoc(tipo, id) {
    setDocsSeleccionados(prev => {
      const key = `${tipo}-${id}`;
      const has = prev.some(d => `${d.tipo}-${d.id}` === key);
      return has ? prev.filter(d => `${d.tipo}-${d.id}` !== key) : [...prev, { tipo, id }];
    });
  }

  function isDocSelected(tipo, id) {
    return docsSeleccionados.some(d => d.tipo === tipo && d.id === id);
  }

  async function handleFileUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setUploading(true);
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/mail/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Error subiendo archivo');
        const data = await res.json();
        setAdjuntos(prev => [...prev, data]);
      } catch (err) {
        toast(`Error subiendo ${file.name}`, 'error');
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeAdjunto(id) {
    setAdjuntos(prev => prev.filter(a => a.id !== id));
  }

  async function handleSend() {
    if (!asunto.trim() || !cuerpo.trim()) {
      toast('Completá asunto y mensaje', 'error');
      return;
    }
    setSending(true);
    try {
      const body = {
        asunto,
        cuerpo,
        enviado_por: user?.email,
        adjuntos: adjuntos.map(a => ({ id: a.id, originalName: a.originalName, mimetype: a.mimetype })),
        documentos: docsSeleccionados,
      };
      if (audiencia === 'proveedor') body.proveedor_ids = selectedContacts.map(c => c.id);
      else body.contacto_ids = selectedContacts.map(c => c.id);

      const res = await sendMail(body);
      setResultado(res);
      toast(`${res.enviados} mail(s) enviado(s)`, 'success');
      if (onSent) onSent();
    } catch (e) {
      toast(e.message || 'Error enviando mails', 'error');
    } finally {
      setSending(false);
    }
  }

  const mimeIcons = {
    'application/pdf': 'PDF',
    'image/': 'IMG',
    default: 'DOC',
  };
  function getFileIcon(mimetype) {
    for (const [key, icon] of Object.entries(mimeIcons)) {
      if (key !== 'default' && mimetype?.startsWith(key)) return icon;
    }
    return mimeIcons.default;
  }

  // Cantidad total de adjuntos
  const totalAdjuntos = adjuntos.length + docsSeleccionados.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            Enviar Mail {audiencia === 'proveedor' ? 'a Proveedor' : 'a Cliente'}
          </h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
        {!resultado ? (
          <>
            {/* Recipients */}
            <div style={{ marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: '#475569' }}>
                Destinatarios ({conEmail.length} con email):
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 80, overflow: 'auto' }}>
                {conEmail.map(c => (
                  <span key={c.id} style={{
                    background: audiencia === 'proveedor' ? '#fef3c7' : '#e0f2fe',
                    padding: '3px 10px', borderRadius: 12, fontSize: 12,
                  }}>
                    {c.razon_social || c.nombre || 'Sin nombre'} &lt;{c.email}&gt;
                  </span>
                ))}
              </div>
              {sinEmail.length > 0 && (
                <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>
                  {sinEmail.length} sin email omitidos
                </div>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e2e8f0', marginBottom: 14 }}>
              {[
                { k: 'templates', label: 'Plantillas' },
                { k: 'compose', label: 'Mensaje' },
              ].map(t => (
                <button
                  key={t.k}
                  onClick={() => setVista(t.k)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '8px 16px', fontSize: 13, fontWeight: 600,
                    color: vista === t.k ? '#7B2CBF' : '#94a3b8',
                    borderBottom: vista === t.k ? '2px solid #7B2CBF' : '2px solid transparent',
                    marginBottom: -2,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Templates view */}
            {vista === 'templates' && (
              <div>
                {loadingTpl ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: 30 }}>Cargando plantillas...</div>
                ) : !templates.length ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: 30 }}>
                    No hay plantillas para {audiencia}. Crea una desde la seccion <strong>Plantillas</strong>.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                      Elegí una plantilla o pasa directamente a <a onClick={() => setVista('compose')} style={{ color: '#7B2CBF', cursor: 'pointer', fontWeight: 600 }}>escribir el mensaje</a>.
                    </div>
                    {templates.map(tpl => (
                      <button
                        key={tpl.id}
                        onClick={() => applyTemplate(tpl)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                          padding: '10px 14px', cursor: 'pointer', textAlign: 'left',
                          transition: 'all .15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#7B2CBF'; e.currentTarget.style.background = '#faf5ff'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#fff'; }}
                      >
                        {tpl.categoria && (
                          <span style={{
                            background: ESTADO_COLORS[tpl.categoria] || '#64748b',
                            color: '#fff', padding: '2px 8px', borderRadius: 8,
                            fontSize: 10, fontWeight: 700, minWidth: 80, textAlign: 'center',
                            textTransform: 'uppercase', flexShrink: 0, letterSpacing: '.5px',
                          }}>
                            {tpl.categoria.replace('_', ' ')}
                          </span>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{tpl.nombre}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tpl.asunto}
                          </div>
                        </div>
                        {tpl.is_factory && (
                          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>SISTEMA</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Compose view */}
            {vista === 'compose' && (
              <>
                <div className="form-group">
                  <label>Asunto</label>
                  <input
                    value={asunto}
                    onChange={e => setAsunto(e.target.value)}
                    placeholder="Asunto del mail..."
                  />
                </div>

                <div className="form-group">
                  <label>Mensaje</label>
                  <textarea
                    value={cuerpo}
                    onChange={e => setCuerpo(e.target.value)}
                    placeholder="Escribi el mensaje..."
                    rows={9}
                    style={{ resize: 'vertical' }}
                  />
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    Variables disponibles: <code>{'{{nombre}}'}</code>, <code>{'{{primer_nombre}}'}</code>, <code>{'{{email}}'}</code>, <code>{'{{telefono}}'}</code>, <code>{'{{empresa}}'}</code>
                  </div>
                </div>

                {/* Documentos del contacto (cotizaciones / recibos) */}
                {unicoContactoCliente && (docsContacto.cotizaciones.length > 0 || docsContacto.recibos.length > 0) && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: 8 }}>
                      Documentos del cliente para adjuntar
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {docsContacto.cotizaciones.map(c => (
                        <label key={`c-${c.id}`} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          background: isDocSelected('cotizacion', c.id) ? '#faf5ff' : '#f8fafc',
                          border: `1px solid ${isDocSelected('cotizacion', c.id) ? '#7B2CBF' : '#e2e8f0'}`,
                          borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                        }}>
                          <input
                            type="checkbox"
                            checked={isDocSelected('cotizacion', c.id)}
                            onChange={() => toggleDoc('cotizacion', c.id)}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>Cotizacion {c.numero}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{formatMoney(c.total, c.moneda)}</div>
                          </div>
                        </label>
                      ))}
                      {docsContacto.recibos.map(r => (
                        <label key={`r-${r.id}`} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          background: isDocSelected('recibo', r.id) ? '#faf5ff' : '#f8fafc',
                          border: `1px solid ${isDocSelected('recibo', r.id) ? '#7B2CBF' : '#e2e8f0'}`,
                          borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                        }}>
                          <input
                            type="checkbox"
                            checked={isDocSelected('recibo', r.id)}
                            onChange={() => toggleDoc('recibo', r.id)}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>Recibo {r.numero}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{formatMoney(r.total, r.moneda)}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Adjuntos externos */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#64748b', margin: 0 }}>
                      Otros adjuntos
                    </label>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      style={{ fontSize: 12 }}
                    >
                      {uploading ? 'Subiendo...' : '+ Subir archivo'}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      style={{ display: 'none' }}
                      onChange={handleFileUpload}
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                    />
                  </div>

                  {adjuntos.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {adjuntos.map(adj => (
                        <div key={adj.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6,
                          padding: '6px 10px', fontSize: 13,
                        }}>
                          <span style={{
                            background: '#7B2CBF', color: '#fff', fontSize: 9, fontWeight: 700,
                            padding: '2px 6px', borderRadius: 4, letterSpacing: '.5px',
                          }}>
                            {getFileIcon(adj.mimetype)}
                          </span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {adj.originalName}
                          </span>
                          <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
                            {formatSize(adj.size)}
                          </span>
                          <button
                            onClick={() => removeAdjunto(adj.id)}
                            style={{
                              background: 'none', border: 'none', color: '#ef4444',
                              cursor: 'pointer', padding: '0 4px', fontSize: 16, lineHeight: 1,
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <div style={{ background: '#dcfce7', padding: '12px 20px', borderRadius: 10, fontWeight: 700, fontSize: 16 }}>
                  {resultado.enviados} enviado(s)
                </div>
                {resultado.fallidos > 0 && (
                  <div style={{ background: '#fee2e2', padding: '12px 20px', borderRadius: 10, fontWeight: 700, fontSize: 16, color: '#991b1b' }}>
                    {resultado.fallidos} fallido(s)
                  </div>
                )}
              </div>

              <div style={{ fontSize: 13 }}>
                {resultado.detalle.map(r => (
                  <div key={`${r.origen}-${r.id}`} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 0', borderBottom: '1px solid #f1f5f9',
                  }}>
                    <div>
                      <span>{r.nombre} <span style={{ color: '#94a3b8' }}>({r.email})</span></span>
                      {r.estado_actualizado && (
                        <span style={{ marginLeft: 8, background: '#dbeafe', color: '#1d4ed8', padding: '1px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
                          → {r.estado_actualizado}
                        </span>
                      )}
                    </div>
                    <span style={{
                      background: r.estado === 'enviado' ? '#dcfce7' : '#fee2e2',
                      color: r.estado === 'enviado' ? '#065f46' : '#991b1b',
                      padding: '2px 10px', borderRadius: 8, fontWeight: 600, fontSize: 12,
                    }}>
                      {r.estado === 'enviado' ? 'Enviado' : 'Error'}
                    </span>
                  </div>
                ))}
              </div>

              {resultado.sin_email?.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
                  Omitidos (sin email): {resultado.sin_email.map(c => c.nombre).join(', ')}
                </div>
              )}
              {resultado.docs_fallidos?.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>
                  Documentos que no se pudieron adjuntar: {resultado.docs_fallidos.map(d => d.label).join(', ')}
                </div>
              )}
            </div>
          </>
        )}
        </div>

        {/* Footer fijo */}
        {!resultado ? (
          <div className="modal-footer" style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 8 }}>
            <div style={{ flex: 1, fontSize: 12, color: '#64748b' }}>
              {totalAdjuntos > 0 && (
                <span><strong>{totalAdjuntos}</strong> adjunto(s)</span>
              )}
            </div>
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button
              className="btn btn-primary"
              onClick={handleSend}
              disabled={sending || !conEmail.length || !asunto.trim() || !cuerpo.trim()}
            >
              {sending ? 'Enviando...' : `Enviar a ${conEmail.length}`}
            </button>
          </div>
        ) : (
          <div className="modal-footer" style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}
