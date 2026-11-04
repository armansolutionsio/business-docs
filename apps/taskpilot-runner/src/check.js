// Chequeo minimo del entorno del runner: .env, repos.json, conexion al servidor, API key de
// Anthropic y un turno corto con el Agent SDK (solo lectura, sin tocar nada).
//   npm run check   (desde apps/taskpilot-runner)

import { query } from '@anthropic-ai/claude-agent-sdk';
import { api } from './api.js';
import { config, loadRepos, claudeEnv, authMode } from './config.js';

const ok = (m) => console.log('  OK ', m);
const bad = (m) => console.log('  ERROR ', m);

(async () => {
  console.log(`Node ${process.version} en ${process.platform}`);
  ok(`autenticación: ${authMode() === 'api_key' ? 'API key de Anthropic' : 'login de Claude Code de esta PC (suscripción)'}`);
  const repos = loadRepos();
  ok(`repos.json: ${repos.length} repo(s)${repos.length ? ': ' + repos.map((r) => r.name).join(', ') : ''}`);
  try { const h = await api.heartbeat(); ok(`servidor ${config.serverUrl} responde (runner id ${h.runner_id})`); }
  catch (e) { bad(`servidor: ${e.message}`); }
  try {
    let text = '';
    for await (const msg of query({
      prompt: 'Respondé solo con la palabra OK.',
      options: {
        cwd: config.workdir, permissionMode: 'default', settingSources: [], allowedTools: [], maxTurns: 1,
        env: claudeEnv(), persistSession: false,
      },
    })) {
      if (msg.type === 'system' && msg.subtype === 'init') ok(`Claude Code ${msg.claude_code_version || ''}, modelo por defecto ${msg.model}, credencial: ${msg.apiKeySource === 'none' ? 'login de Claude Code' : msg.apiKeySource}`);
      if (msg.type === 'assistant') for (const b of msg.message?.content || []) if (b.type === 'text') text += b.text;
      if (msg.type === 'result') ok(`Agent SDK: ${msg.subtype}, costo ${authMode() === 'api_key' ? 'facturado' : 'estimado (no se factura)'} US$ ${(msg.total_cost_usd || 0).toFixed(4)}, respuesta: ${text.trim().slice(0, 40)}`);
    }
  } catch (e) { bad(`Agent SDK: ${e.message}`); }
})();
