// Cliente HTTP hacia el servidor de TaskPilot (/api/taskpilot-runner). Todo el trafico es saliente.

import { config } from './config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, body, { timeoutMs = 40000 } = {}) {
  const res = await fetch(`${config.serverUrl}/api/taskpilot-runner${path}`, {
    method,
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* texto plano */ }
  if (!res.ok) throw new Error(`Servidor respondio ${res.status} en ${path}: ${json?.error || text.slice(0, 200)}`);
  return json;
}

// Reintenta llamadas que no pueden perderse (eventos, aprobaciones).
async function withRetry(fn, { attempts = 4, baseMs = 1500 } = {}) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) { last = e; if (i < attempts - 1) await sleep(baseMs * (i + 1)); }
  }
  throw last;
}

const longWait = { timeoutMs: (config.pollWait + 20) * 1000 };

export const api = {
  register: (data) => call('POST', '/register', data),
  heartbeat: () => call('POST', '/heartbeat', {}),
  limits: (data) => withRetry(() => call('POST', '/limits', data)),
  nextJob: () => call('GET', `/jobs?wait=${config.pollWait}`, undefined, longWait),
  jobDone: (id) => withRetry(() => call('POST', `/jobs/${id}/done`, {})),
  jobError: (id, error) => withRetry(() => call('POST', `/jobs/${id}/error`, { error: String(error).slice(0, 2000) })),
  events: (sessionId, events) => withRetry(() => call('POST', `/sessions/${sessionId}/events`, { events })),
  createApproval: (sessionId, data) => withRetry(() => call('POST', `/sessions/${sessionId}/approvals`, data)),
  waitApproval: (id) => call('GET', `/approvals/${id}?wait=${config.pollWait}`, undefined, longWait),
};
