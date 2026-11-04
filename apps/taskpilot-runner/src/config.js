// Configuracion del runner: .env (TASKPILOT_SERVER_URL, TASKPILOT_RUNNER_TOKEN, ANTHROPIC_API_KEY)
// y repos.json con los repositorios locales disponibles en esta PC.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function required(name) {
  const v = (process.env[name] || '').trim();
  if (!v) {
    console.error(`[runner] Falta ${name} en el archivo .env (ver .env.example)`);
    process.exit(1);
  }
  return v;
}

// ANTHROPIC_API_KEY es opcional: si esta vacia, el runner usa el login de Claude Code de esta PC
// (la suscripcion del usuario), que es la autenticacion normal del binario de Claude Code.
export const config = {
  serverUrl: required('TASKPILOT_SERVER_URL').replace(/\/$/, ''),
  token: required('TASKPILOT_RUNNER_TOKEN'),
  apiKey: (process.env.ANTHROPIC_API_KEY || '').trim() || null,
  name: (process.env.RUNNER_NAME || '').trim() || os.hostname(),
  reposFile: path.resolve(process.env.RUNNER_REPOS_FILE || 'repos.json'),
  workdir: path.resolve(process.env.RUNNER_WORKDIR || 'workspace'),
  maxBudgetUsd: Number(process.env.RUNNER_MAX_BUDGET_USD) || 10,
  maxTurns: Number(process.env.RUNNER_MAX_TURNS) || 80,
  effort: (process.env.RUNNER_EFFORT || '').trim() || undefined,
  pollWait: 25,
};

// Entorno para el subproceso de Claude Code: con API key se inyecta; sin ella se saca cualquier
// ANTHROPIC_API_KEY del entorno para que use el login de Claude Code (suscripcion).
export function claudeEnv() {
  const env = { ...process.env };
  if (config.apiKey) env.ANTHROPIC_API_KEY = config.apiKey;
  else delete env.ANTHROPIC_API_KEY;
  return env;
}

export const authMode = () => (config.apiKey ? 'api_key' : 'suscripcion');

// Lee y valida repos.json. Un repo invalido se descarta con aviso; no frena el runner.
export function loadRepos() {
  if (!fs.existsSync(config.reposFile)) {
    console.warn(`[runner] No existe ${config.reposFile}: el runner solo va a poder atender tareas sin repositorio.`);
    return [];
  }
  let list;
  try { list = JSON.parse(fs.readFileSync(config.reposFile, 'utf8')); }
  catch (e) { console.error(`[runner] repos.json invalido: ${e.message}`); process.exit(1); }
  if (!Array.isArray(list)) { console.error('[runner] repos.json debe ser una lista'); process.exit(1); }
  const repos = [];
  for (const r of list) {
    if (!r || !r.name || !r.path) { console.warn('[runner] repo sin name/path ignorado:', JSON.stringify(r)); continue; }
    const abs = path.resolve(String(r.path));
    if (!fs.existsSync(abs)) { console.warn(`[runner] repo "${r.name}": la ruta no existe (${abs}), ignorado`); continue; }
    repos.push({ name: String(r.name), path: abs, branch: r.branch ? String(r.branch) : null, description: r.description ? String(r.description) : null });
  }
  return repos;
}
