// Runner de TaskPilot. Se registra en el servidor, espera trabajos (long polling) y los ejecuta
// con el Agent SDK sobre los repos locales. Todo el trafico lo inicia el runner.

import os from 'node:os';
import { createRequire } from 'node:module';
import { api } from './api.js';
import { config, loadRepos, claudeEnv, authMode } from './config.js';
import { listModelsViaApiKey, listModelsViaLogin } from './models.js';
import { gitInfo, gitOp } from './git.js';
import { probeLimits } from './limits.js';
import { Session } from './session.js';

const require = createRequire(import.meta.url);
const version = require('../package.json').version;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sessions = new Map(); // id -> Session
let repos = [];

async function listModels() {
  try {
    return config.apiKey ? await listModelsViaApiKey(config.apiKey) : await listModelsViaLogin(claudeEnv());
  } catch (e) {
    console.warn('[runner] No se pudo leer la lista de modelos:', e.message);
    return [];
  }
}

async function register() {
  repos = loadRepos();
  const models = await listModels();
  const r = await api.register({
    nombre: config.name, host: os.hostname(), version,
    repos: repos.map(({ name, path, branch, description }) => ({ name, path, branch, description })),
    models,
  });
  console.log(`[runner] Registrado como "${r.nombre}" (id ${r.id}) en ${config.serverUrl} · autenticación: ${authMode() === 'api_key' ? 'API key de Anthropic' : 'login de Claude Code (suscripción)'}`);
  console.log(`[runner] Repos: ${repos.length ? repos.map((x) => `${x.name}${x.branch ? '@' + x.branch : ''}`).join(', ') : 'ninguno'} · Modelos: ${models.length || 'sin datos'}`);
  return r;
}

async function handle(job) {
  const payload = job.payload || {};
  if (job.tipo === 'cancel') {
    const s = sessions.get(job.session_id);
    if (s) { s.cancel(); sessions.delete(job.session_id); }
    await api.jobDone(job.id);
    return;
  }
  // Limites de uso del plan (boton "Actualizar límites" del tablero).
  if (job.tipo === 'limits') {
    try {
      const { info, account } = await probeLimits();
      await api.limits({ info, account });
      console.log('[runner] límites del plan actualizados', info?.unifiedWindows ? JSON.stringify(info.unifiedWindows) : '(sin datos)');
      await api.jobDone(job.id);
    } catch (e) {
      console.error('[runner] no se pudieron leer los límites:', e.message);
      await api.jobError(job.id, e.message).catch(() => {});
    }
    return;
  }
  // Operaciones git pedidas por el usuario desde el panel Git (no pasan por Claude).
  if (job.tipo === 'git') {
    const repo = payload.repo ? repos.find((r) => r.name === payload.repo) : null;
    const op = String(payload.op || 'status');
    if (!repo) {
      await api.events(job.session_id, [{ type: 'git_result', op, ok: false, output: `El runner no tiene configurado el repo "${payload.repo || ''}".`, status: null, usuario: payload.usuario }]);
      await api.jobError(job.id, 'repo no configurado');
      return;
    }
    const active = sessions.get(job.session_id);
    if (active?.abort) {
      await api.events(job.session_id, [{ type: 'git_result', op, ok: false, output: 'Claude está trabajando en este repo; esperá a que termine el paso actual.', status: await gitInfo(repo.path), usuario: payload.usuario }]);
      await api.jobDone(job.id);
      return;
    }
    console.log(`[runner] git ${op} en ${repo.name} (pedido por ${payload.usuario || '?'})`);
    const result = await gitOp(repo.path, op, { message: payload.message });
    const status = await gitInfo(repo.path);
    status.expectedBranch = repo.branch || null;
    await api.events(job.session_id, [{ type: 'git_result', op, ok: result.ok, output: result.output, status, usuario: payload.usuario }]);
    await api.jobDone(job.id);
    return;
  }
  let s = sessions.get(job.session_id);
  if (!s) {
    if (job.tipo !== 'start') {
      // El runner se reinicio: se reconstruye la sesion con lo que manda el servidor en el job.
      const repo = payload.repo ? repos.find((r) => r.name === payload.repo) || null : null;
      s = new Session({ id: job.session_id, repo, model: payload.model, alias: payload.alias, actividades: payload.actividades, repos, contexto: payload.contexto });
      s.fase = payload.fase || 'plan';
      s.sdkSessionId = payload.sdk_session_id || null;
      if (!s.sdkSessionId) {
        await api.jobError(job.id, 'El runner no tiene esta sesión en memoria y el servidor no mandó sdk_session_id; iniciá una sesión nueva.');
        await api.events(job.session_id, [{ type: 'error', message: 'El runner se reinició y perdió esta sesión. Iniciá una sesión nueva desde la tarea.' }]);
        return;
      }
    } else {
      const repo = payload.repo ? repos.find((r) => r.name === payload.repo) : null;
      if (payload.repo && !repo) {
        await api.jobError(job.id, `Repo "${payload.repo}" no configurado en este runner`);
        await api.events(job.session_id, [{ type: 'error', message: `El runner no tiene configurado el repo "${payload.repo}". Revisá repos.json y reiniciá el runner.` }]);
        return;
      }
      s = new Session({ id: job.session_id, repo, model: payload.model, alias: payload.alias, actividades: payload.actividades, repos, contexto: payload.contexto });
    }
    sessions.set(job.session_id, s);
  }
  s.enqueue(async () => {
    try {
      if (job.tipo === 'start') await s.start(payload);
      else if (job.tipo === 'message') await s.message(payload.text || '');
      else if (job.tipo === 'approve_plan') await s.approvePlan(payload.comentario || '');
      else throw new Error(`Tipo de job desconocido: ${job.tipo}`);
      await api.jobDone(job.id);
    } catch (e) {
      console.error(`[runner] job ${job.id} (${job.tipo}) falló:`, e.message);
      await api.jobError(job.id, e.message).catch(() => {});
    }
  });
}

async function main() {
  console.log(`[runner] TaskPilot runner v${version} · Node ${process.version} · ${process.platform}`);
  for (;;) {
    try { await register(); break; }
    catch (e) { console.error('[runner] No se pudo registrar:', e.message, '· reintento en 15 s'); await sleep(15000); }
  }
  setInterval(() => api.heartbeat().catch(() => {}), 45000);
  console.log('[runner] Esperando trabajos...');
  for (;;) {
    try {
      const job = await api.nextJob();
      if (job) { console.log(`[runner] job ${job.id}: ${job.tipo} (sesión ${job.session_id})`); await handle(job); }
    } catch (e) {
      console.error('[runner] error esperando trabajos:', e.message, '· reintento en 5 s');
      await sleep(5000);
    }
  }
}

process.on('SIGINT', () => { console.log('\n[runner] Cerrando...'); for (const s of sessions.values()) s.cancel(); process.exit(0); });
main().catch((e) => { console.error('[runner] fatal:', e); process.exit(1); });
