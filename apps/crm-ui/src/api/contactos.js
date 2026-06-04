'use strict';

const BASE = '/api/contactos';

async function req(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Error');
  }
  if (res.status === 204) return null;
  return res.json();
}

// Contactos CRUD
export const listContactos = (params = {}) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== '' && v != null && q.append(k, v));
  return req('GET', `${BASE}?${q}`);
};
export const getContacto = (id) => req('GET', `${BASE}/${id}`);
export const createContacto = (body) => req('POST', BASE, body);
export const updateContacto = (id, body) => req('PATCH', `${BASE}/${id}`, body);
export const checkDuplicates = (params) => {
  const q = new URLSearchParams(params);
  return req('GET', `${BASE}/dedup-check?${q}`);
};
export const getStats = () => req('GET', `${BASE}/stats`);
export const getProvincias = () => req('GET', `${BASE}/provincias`);
export const getLocalidades = (provincia) => {
  const q = provincia ? `?provincia=${encodeURIComponent(provincia)}` : '';
  return req('GET', `${BASE}/localidades${q}`);
};

// Sub-resources
export const getTimeline = (id) => req('GET', `${BASE}/${id}/timeline`);
export const listNotas = (id) => req('GET', `${BASE}/${id}/notas`);
export const createNota = (id, body) => req('POST', `${BASE}/${id}/notas`, body);
export const listTareas = (id) => req('GET', `${BASE}/${id}/tareas`);
export const createTarea = (id, body) => req('POST', `${BASE}/${id}/tareas`, body);
export const updateTarea = (id, tareaId, body) => req('PATCH', `${BASE}/${id}/tareas/${tareaId}`, body);
export const listConversaciones = (id) => req('GET', `${BASE}/${id}/conversaciones`);
export const createConversacion = (id, body) => req('POST', `${BASE}/${id}/conversaciones`, body);
export const listOportunidades = (id) => req('GET', `${BASE}/${id}/oportunidades`);
export const createOportunidad = (id, body) => req('POST', `${BASE}/${id}/oportunidades`, body);
export const updateOportunidad = (id, oppId, body) => req('PATCH', `${BASE}/${id}/oportunidades/${oppId}`, body);
export const listCotizaciones = (id) => req('GET', `${BASE}/${id}/cotizaciones`);
export const listVentas = (id) => req('GET', `${BASE}/${id}/ventas`);
export const listFacturas = (id) => req('GET', `${BASE}/${id}/facturas`);
export const listPagos = (id) => req('GET', `${BASE}/${id}/pagos`);
export const listRecibos = (id) => req('GET', `${BASE}/${id}/recibos`);

// Anulación
export const anularCotizacion = (cotId, body) => req('PATCH', `/api/cotizaciones/${cotId}/anular`, body);
export const anularRecibo = (recId, body) => req('PATCH', `/api/recibos/${recId}/anular`, body);

// Borrado por error (soft-delete con historial — preserva correlatividad)
export const borrarCotizacion = (cotId, body) => req('POST', `/api/cotizaciones/${cotId}/borrar`, body);
export const borrarRecibo = (recId, body) => req('POST', `/api/recibos/${recId}/borrar`, body);

// Campañas de mail
export const listCampanias = (id) => req('GET', `${BASE}/${id}/campanias`);
export const updateCampania = (id, campId, body) => req('PATCH', `${BASE}/${id}/campanias/${campId}`, body);
export const sendMail = (body) => req('POST', '/api/mail/send', body);

// Documentos adjuntables (cotizaciones, recibos) del contacto
export const listAttachableDocs = (contactoId) => req('GET', `/api/mail/attachable-docs/${contactoId}`);

// Templates de mail
export const listMailTemplates = (params = {}) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== '' && v != null && q.append(k, v));
  return req('GET', `/api/mail/templates?${q}`);
};
export const getMailTemplate = (id) => req('GET', `/api/mail/templates/${id}`);
export const createMailTemplate = (body) => req('POST', '/api/mail/templates', body);
export const updateMailTemplate = (id, body) => req('PATCH', `/api/mail/templates/${id}`, body);
export const deleteMailTemplate = (id) => req('DELETE', `/api/mail/templates/${id}`);

// Proveedores
const PROV = '/api/proveedores';
export const listProveedores = (params = {}) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== '' && v != null && q.append(k, v));
  return req('GET', `${PROV}?${q}`);
};
export const getProveedor = (id) => req('GET', `${PROV}/${id}`);
export const createProveedor = (body) => req('POST', PROV, body);
export const updateProveedor = (id, body) => req('PATCH', `${PROV}/${id}`, body);
