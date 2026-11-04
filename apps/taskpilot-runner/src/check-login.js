// Prueba: el Agent SDK sin ANTHROPIC_API_KEY, usando el login de Claude Code de esta PC
// (suscripcion). Hace un turno minimo y muestra de donde salio la credencial.
//   node src/check-login.js

import { query } from '@anthropic-ai/claude-agent-sdk';

const env = { ...process.env };
delete env.ANTHROPIC_API_KEY;

(async () => {
  let text = '';
  try {
    const q = query({
      prompt: 'Respondé solo con la palabra OK.',
      options: { permissionMode: 'default', settingSources: [], allowedTools: [], maxTurns: 1, env, persistSession: false },
    });
    for await (const msg of q) {
      if (msg.type === 'system' && msg.subtype === 'init') {
        console.log('init -> modelo:', msg.model, '| apiKeySource:', msg.apiKeySource, '| claude_code_version:', msg.claude_code_version);
        try { const models = await q.supportedModels(); console.log('supportedModels ->', Array.isArray(models) ? models.length : typeof models, JSON.stringify(models).slice(0, 400)); } catch (e) { console.log('supportedModels error:', e.message); }
      }
      if (msg.type === 'assistant') for (const b of msg.message?.content || []) if (b.type === 'text') text += b.text;
      if (msg.type === 'result') console.log('result ->', msg.subtype, '| costo reportado US$', msg.total_cost_usd, '| respuesta:', text.trim().slice(0, 40));
    }
  } catch (e) {
    console.log('ERROR:', e.message);
  }
})();
