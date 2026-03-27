'use strict';

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../ToastContext.jsx';
import { useAuth } from '../AuthContext.jsx';
import { getContacto, updateContacto, getTimeline } from '../api/contactos.js';
import ContactoInfoCard from '../components/contacto/ContactoInfoCard.jsx';
import ContactoTimeline from '../components/contacto/ContactoTimeline.jsx';
import ContactoNotas from '../components/contacto/ContactoNotas.jsx';
import ContactoTareas from '../components/contacto/ContactoTareas.jsx';
import ContactoOportunidades from '../components/contacto/ContactoOportunidades.jsx';
import ContactoConversaciones from '../components/contacto/ContactoConversaciones.jsx';
import ContactoDocumentos from '../components/contacto/ContactoDocumentos.jsx';
import ContactoMapa from '../components/contacto/ContactoMapa.jsx';

const ESTADOS = ['nuevo','contactado','calificado','cotizado','negociacion','ganado','perdido','dormido','cliente_recurrente'];
const ESTADO_COLORS = {
  nuevo:'#3b82f6', contactado:'#06b6d4', calificado:'#8b5cf6', cotizado:'#f59e0b',
  negociacion:'#d97706', ganado:'#10b981', perdido:'#ef4444', dormido:'#94a3b8', cliente_recurrente:'#065f46',
};

export default function ContactoDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [contacto, setContacto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('timeline');
  const [timeline, setTimeline] = useState([]);

  async function load() {
    try {
      const c = await getContacto(id);
      setContacto(c);
      const tl = await getTimeline(id);
      setTimeline(tl);
    } catch (e) {
      toast('Error cargando contacto', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleEstadoChange(newEstado) {
    try {
      const updated = await updateContacto(id, { estado: newEstado, _user: user?.username });
      setContacto(updated);
      toast('Estado actualizado', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function handleSaveInfo(data) {
    try {
      const updated = await updateContacto(id, { ...data, _user: user?.username });
      setContacto(updated);
      toast('Contacto actualizado', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  if (loading) return <div className="loading-msg">Cargando...</div>;
  if (!contacto) return <div className="error-msg">Contacto no encontrado</div>;

  const displayName = contacto.razon_social || [contacto.nombre, contacto.apellido].filter(Boolean).join(' ') || 'Sin nombre';
  const color = ESTADO_COLORS[contacto.estado] || '#64748b';

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/contactos')}>&larr; Volver</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{displayName}</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, fontSize: 13, color: '#64748b' }}>
            <span style={{ background: color, color: '#fff', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
              {contacto.estado}
            </span>
            <span>Rol: {contacto.rol_actual}</span>
            {contacto.vendedor_asignado && <span>Vendedor: {contacto.vendedor_asignado}</span>}
            {contacto.origen && <span>Origen: {contacto.origen}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <a href={`/?clientName=${encodeURIComponent(displayName)}&clientCUIT=${encodeURIComponent(contacto.cuit || contacto.dni || '')}&clientEmail=${encodeURIComponent(contacto.email || '')}&clientPhone=${encodeURIComponent(contacto.telefono || '')}`}
            className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }} target="_blank">
            Cotizar
          </a>
          <select value={contacto.estado} onChange={e => handleEstadoChange(e.target.value)}
            style={{ fontSize: 12, fontWeight: 600, background: color, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
            {ESTADOS.map(e => <option key={e} value={e} style={{ background: '#fff', color: '#333' }}>{e}</option>)}
          </select>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Left: Info card */}
        <ContactoInfoCard contacto={contacto} onSave={handleSaveInfo} />

        {/* Right: Tabs */}
        <div>
          <div className="tabs" style={{ marginBottom: 16 }}>
            {[
              ['timeline', 'Historial'],
              ['documentos', 'Documentos'],
              ['oportunidades', 'Oportunidades'],
              ['conversaciones', 'Conversaciones'],
              ['notas', 'Notas'],
              ['tareas', 'Tareas'],
              ['mapa', 'Mapa'],
            ].map(([key, label]) => (
              <button key={key} className={`tab-btn ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'timeline' && <ContactoTimeline timeline={timeline} onRefresh={load} />}
          {tab === 'documentos' && <ContactoDocumentos contactoId={id} />}
          {tab === 'oportunidades' && <ContactoOportunidades contactoId={id} user={user} />}
          {tab === 'conversaciones' && <ContactoConversaciones contactoId={id} user={user} />}
          {tab === 'notas' && <ContactoNotas contactoId={id} user={user} />}
          {tab === 'tareas' && <ContactoTareas contactoId={id} user={user} />}
          {tab === 'mapa' && <ContactoMapa contacto={contacto} />}
        </div>
      </div>
    </div>
  );
}
