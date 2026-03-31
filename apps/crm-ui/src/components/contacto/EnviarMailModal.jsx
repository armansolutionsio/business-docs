'use strict';

import { useState, useRef } from 'react';
import { sendMail } from '../../api/contactos.js';
import { useToast } from '../../ToastContext.jsx';

const TEMPLATES = [
  {
    id: 'bienvenida',
    nombre: 'Bienvenida - Nuevo Lead',
    estado: 'nuevo',
    asunto: 'Bienvenido/a a Arman Travel - Tu próximo viaje empieza acá',
    cuerpo: `Hola,

Gracias por tu interés en Arman Travel. Nos encanta que nos hayas elegido para planificar tu próximo viaje.

Somos una agencia especializada en crear experiencias de viaje únicas y personalizadas. Nuestro equipo está listo para ayudarte a encontrar el destino perfecto.

¿Tenés algún destino en mente o querés que te asesoremos? Respondé este mail y con gusto te ayudamos.

Saludos cordiales,
Equipo Arman Travel`,
  },
  {
    id: 'seguimiento',
    nombre: 'Seguimiento - Contactado',
    estado: 'contactado',
    asunto: 'Seguimos pensando en tu viaje ideal',
    cuerpo: `Hola,

Te escribimos porque hace un tiempo nos contactaste interesado/a en un viaje y queríamos saber si seguís con la idea.

Tenemos nuevas opciones y promociones que podrían interesarte. Estamos para responder cualquier duda que tengas sobre destinos, fechas o presupuesto.

¿Te gustaría que armemos una cotización sin compromiso? Solo respondé este mail con tus preferencias.

Quedamos a tu disposición,
Equipo Arman Travel`,
  },
  {
    id: 'cotizacion',
    nombre: 'Envío de Cotización',
    estado: 'cotizado',
    asunto: 'Tu cotización de viaje está lista - Arman Travel',
    cuerpo: `Hola,

Te enviamos la cotización que preparamos especialmente para vos. Incluye todo lo que conversamos y algunas opciones adicionales que creemos te van a gustar.

Recordá que esta cotización tiene una validez limitada, así que te recomendamos revisarla pronto.

Si tenés alguna pregunta, querés ajustar algo o necesitás más opciones, no dudes en respondernos.

Esperamos que te guste la propuesta,
Equipo Arman Travel`,
  },
  {
    id: 'negociacion',
    nombre: 'Oferta Especial - Negociación',
    estado: 'negociacion',
    asunto: 'Oferta especial para tu viaje - No te la pierdas',
    cuerpo: `Hola,

Queremos contarte que conseguimos condiciones especiales para el viaje que estás evaluando.

Sabemos que estás en proceso de decisión y queremos ayudarte a concretarlo. Tenemos flexibilidad en formas de pago y podemos ajustar el itinerario según tus necesidades.

¿Podemos coordinar una llamada esta semana para cerrar los detalles? Respondé este mail y agendamos.

Saludos,
Equipo Arman Travel`,
  },
  {
    id: 'reactivacion',
    nombre: 'Reactivación - Contacto Dormido',
    estado: 'dormido',
    asunto: '¡Te extrañamos! Nuevos destinos para vos - Arman Travel',
    cuerpo: `Hola,

¡Hace un tiempo que no hablamos y queríamos saber cómo estás!

En Arman Travel seguimos sumando destinos y experiencias increíbles. Tenemos novedades que seguro te van a interesar.

Si en algún momento volvés a pensar en un viaje, acordate que estamos acá para ayudarte. Solo respondé este mail y retomamos la conversación donde la dejamos.

Te mandamos un saludo grande,
Equipo Arman Travel`,
  },
];

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function EnviarMailModal({ selectedContacts, onClose, onSent, user }) {
  const { toast } = useToast();
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [sending, setSending] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [showTemplates, setShowTemplates] = useState(true);
  const [adjuntos, setAdjuntos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const sinEmail = selectedContacts.filter(c => !c.email);
  const conEmail = selectedContacts.filter(c => c.email);

  function applyTemplate(tpl) {
    setAsunto(tpl.asunto);
    setCuerpo(tpl.cuerpo);
    setShowTemplates(false);
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
      const res = await sendMail({
        contacto_ids: selectedContacts.map(c => c.id),
        asunto,
        cuerpo,
        enviado_por: user?.username,
        adjuntos: adjuntos.map(a => ({ id: a.id, originalName: a.originalName, mimetype: a.mimetype })),
      });
      setResultado(res);
      toast(`${res.enviados} mail(s) enviado(s)`, 'success');
      if (onSent) onSent();
    } catch (e) {
      toast(e.message || 'Error enviando mails', 'error');
    } finally {
      setSending(false);
    }
  }

  const estadoColors = {
    nuevo: '#3b82f6', contactado: '#06b6d4', cotizado: '#f59e0b',
    negociacion: '#d97706', dormido: '#94a3b8',
  };

  const mimeIcons = {
    'application/pdf': '📄',
    'image/': '🖼️',
    default: '📎',
  };
  function getFileIcon(mimetype) {
    for (const [key, icon] of Object.entries(mimeIcons)) {
      if (key !== 'default' && mimetype?.startsWith(key)) return icon;
    }
    return mimeIcons.default;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Enviar Mail</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
          </button>
        </div>

        {!resultado ? (
          <>
            {/* Recipients */}
            <div style={{ marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                Destinatarios ({conEmail.length} con email):
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 80, overflow: 'auto' }}>
                {conEmail.map(c => (
                  <span key={c.id} style={{
                    background: '#e0f2fe', padding: '3px 10px', borderRadius: 12, fontSize: 12,
                  }}>
                    {c.nombre || c.razon_social || 'Sin nombre'} &lt;{c.email}&gt;
                  </span>
                ))}
              </div>
              {sinEmail.length > 0 && (
                <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>
                  {sinEmail.length} contacto(s) sin email omitidos
                </div>
              )}
            </div>

            {/* Templates */}
            {showTemplates && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Elegí un template o escribí desde cero:</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowTemplates(false)} style={{ fontSize: 12 }}>
                    Escribir desde cero
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {TEMPLATES.map(tpl => (
                    <button
                      key={tpl.id}
                      onClick={() => applyTemplate(tpl)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
                        padding: '10px 14px', cursor: 'pointer', textAlign: 'left',
                        transition: 'all .15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#7B2CBF'; e.currentTarget.style.background = '#faf5ff'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
                    >
                      <span style={{
                        background: estadoColors[tpl.estado] || '#64748b',
                        color: '#fff', padding: '2px 8px', borderRadius: 8,
                        fontSize: 10, fontWeight: 700, minWidth: 70, textAlign: 'center',
                        textTransform: 'uppercase', flexShrink: 0,
                      }}>
                        {tpl.estado}
                      </span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{tpl.nombre}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{tpl.asunto}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Compose form */}
            {!showTemplates && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowTemplates(true)} style={{ marginBottom: 10, fontSize: 12 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 4 }}><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                  Ver templates
                </button>

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
                    placeholder="Escribí el mensaje..."
                    rows={10}
                    style={{ resize: 'vertical' }}
                  />
                </div>

                {/* Attachments */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#64748b', margin: 0 }}>
                      Adjuntos
                    </label>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      style={{ fontSize: 12 }}
                    >
                      {uploading ? 'Subiendo...' : '+ Agregar archivo'}
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
                          <span style={{ fontSize: 16 }}>{getFileIcon(adj.mimetype)}</span>
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

                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                  <button className="btn btn-primary" onClick={handleSend} disabled={sending || !conEmail.length}>
                    {sending ? 'Enviando...' : `Enviar a ${conEmail.length} contacto(s)`}
                  </button>
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
                  <div key={r.contacto_id} style={{
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
            </div>

            <div className="modal-footer">
              <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
