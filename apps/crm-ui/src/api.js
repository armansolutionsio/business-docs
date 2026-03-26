'use strict';

// In dev, Vite proxies /api/core → Core API and /api/docs → Business Docs.
// In production set VITE_CORE_API_URL and VITE_BUSINESS_DOCS_URL directly.
const CORE = import.meta.env.VITE_CORE_API_URL
  ? import.meta.env.VITE_CORE_API_URL.replace(/\/$/, '')
  : '/api/core';

const DOCS = import.meta.env.VITE_BUSINESS_DOCS_URL
  ? import.meta.env.VITE_BUSINESS_DOCS_URL.replace(/\/$/, '')
  : '/api/docs';

async function req(method, url, body, headers = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body != null) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw Object.assign(new Error(err.detail || err.message || 'API error'), { status: res.status, data: err });
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Leads ─────────────────────────────────────────────────────────────────────

export const listLeads = (params = {}) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && q.append(k, v));
  return req('GET', `${CORE}/v1/leads?${q}&limit=200`);
};

export const getLead = (id) => req('GET', `${CORE}/v1/leads/${id}`);

export const updateLead = (id, body) => req('PATCH', `${CORE}/v1/leads/${id}`, body);

export const createLead = (body) => req('POST', `${CORE}/v1/leads`, body);

// ── Parties ───────────────────────────────────────────────────────────────────

export const getParty = (id) => req('GET', `${CORE}/v1/parties/${id}`);

export const upsertParty = (body) => req('POST', `${CORE}/v1/parties`, body);

// ── Document Refs ─────────────────────────────────────────────────────────────

export const listDocRefs = (params = {}) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && q.append(k, v));
  return req('GET', `${CORE}/v1/documents/refs?${q}`);
};

// ── Activity Log ──────────────────────────────────────────────────────────────

export const listActivityLogs = (params = {}) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && q.append(k, v));
  return req('GET', `${CORE}/v1/activity-logs?${q}&limit=100`);
};

// ── Tasks ─────────────────────────────────────────────────────────────────────

export const listTasks = (leadId) => req('GET', `${CORE}/v1/leads/${leadId}/tasks`);

export const createTask = (leadId, body) => req('POST', `${CORE}/v1/leads/${leadId}/tasks`, body);

export const updateTask = (leadId, taskId, body) =>
  req('PATCH', `${CORE}/v1/leads/${leadId}/tasks/${taskId}`, body);

// ── Sales ─────────────────────────────────────────────────────────────────────

export const createSale = (body) => req('POST', `${CORE}/v1/sales`, body);

export const getSale = (id) => req('GET', `${CORE}/v1/sales/${id}`);

export const createSaleItem = (body) => req('POST', `${CORE}/v1/sale-items`, body);

// ── Business Docs — Quote / Invoice generation ────────────────────────────────

export async function generateQuotePdf(payload, idempotencyKey) {
  const headers = {};
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(`${DOCS}/documents/generate-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Error generando PDF');
  }
  const blob = await res.blob();
  return {
    blob,
    docRefId: res.headers.get('X-Core-Doc-Ref-Id'),
    partyId:  res.headers.get('X-Core-Party-Id'),
    leadId:   res.headers.get('X-Core-Lead-Id'),
    saleId:   res.headers.get('X-Core-Sale-Id'),
  };
}
