// Bus de eventos en memoria de TaskPilot (un solo proceso):
// - SSE: el navegador se suscribe a una sesion y recibe mensajes, aprobaciones, informe y
//   cambios de estado a medida que el runner los manda.
// - Long polling: el runner espera trabajos nuevos (jobs:<runnerId>) y decisiones de
//   aprobacion (approval:<id>) sin consultar en loop.

const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(0);

const sseClients = new Map(); // sessionId -> Set<res>

function emit(key, payload) { bus.emit(key, payload); }

// Resuelve con el payload del primer evento `key`, o null si pasan `ms` milisegundos.
function waitFor(key, ms) {
  return new Promise((resolve) => {
    let timer = null;
    const handler = (payload) => { clearTimeout(timer); resolve(payload ?? true); };
    timer = setTimeout(() => { bus.off(key, handler); resolve(null); }, ms);
    bus.once(key, handler);
  });
}

// ── SSE ─────────────────────────────────────────────────────────────
function subscribe(sessionId, req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': conectado\n\n');
  if (!sseClients.has(sessionId)) sseClients.set(sessionId, new Set());
  sseClients.get(sessionId).add(res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* cerrado */ } }, 25000);
  req.on('close', () => {
    clearInterval(ping);
    const set = sseClients.get(sessionId);
    if (set) { set.delete(res); if (!set.size) sseClients.delete(sessionId); }
  });
}

function publish(sessionId, event) {
  const set = sseClients.get(Number(sessionId));
  if (!set || !set.size) return;
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of set) { try { res.write(line); } catch { set.delete(res); } }
}

module.exports = { emit, waitFor, subscribe, publish };
