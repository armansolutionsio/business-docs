// Lista de modelos disponibles para el selector del tablero.
// - Con API key: se consulta la Models API de Anthropic (todo lo habilitado en la cuenta).
// - Con el login de Claude Code (suscripcion): se le pregunta al propio Claude Code que
//   modelos ofrece (supportedModels), sin gastar un turno.

import Anthropic from '@anthropic-ai/sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';

export async function listModelsViaApiKey(apiKey) {
  const client = new Anthropic({ apiKey });
  const models = [];
  for await (const m of client.models.list({ limit: 100 })) {
    if (String(m.id).startsWith('claude-')) models.push({ id: m.id, display_name: m.display_name || m.id });
  }
  return models;
}

export async function listModelsViaLogin(env) {
  let release;
  const gate = new Promise((r) => { release = r; });
  async function* sinMensajes() { await gate; }
  const ac = new AbortController();
  const q = query({
    prompt: sinMensajes(),
    options: { permissionMode: 'default', settingSources: [], allowedTools: [], maxTurns: 1, env, persistSession: false, abortController: ac },
  });
  const out = [];
  const timer = setTimeout(() => { release(); ac.abort(); }, 25000);
  try {
    const list = await q.supportedModels();
    const seen = new Set();
    for (const m of Array.isArray(list) ? list : []) {
      const id = m.resolvedModel || m.value;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const name = String(m.displayName || id).replace(/\s*\((recommended|recomendado)\)/i, '').trim();
      out.push({ id, display_name: name, alias: m.value });
    }
  } finally {
    clearTimeout(timer);
    release();
    ac.abort();
    try { await q.close?.(); } catch { /* ya cerrado */ }
  }
  return out;
}
