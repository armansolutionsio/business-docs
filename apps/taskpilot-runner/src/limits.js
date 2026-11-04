// Consulta los limites de uso del plan de Claude con un turno minimo (Haiku, una sola respuesta).
// El SDK los manda como mensajes rate_limit_event; accountInfo() da el tipo de suscripcion.

import { query } from '@anthropic-ai/claude-agent-sdk';
import { claudeEnv } from './config.js';

export async function probeLimits() {
  const q = query({
    prompt: 'Respondé solo con la palabra OK.',
    options: { permissionMode: 'default', settingSources: [], allowedTools: [], maxTurns: 1, model: 'claude-haiku-5-5', env: claudeEnv(), persistSession: false },
  });
  let info = null, account = null;
  for await (const msg of q) {
    if (msg.type === 'system' && msg.subtype === 'init') {
      try { account = await q.accountInfo(); } catch { account = null; }
    } else if (msg.type === 'rate_limit_event') {
      info = msg.rate_limit_info || info;
    }
  }
  return { info, account };
}
