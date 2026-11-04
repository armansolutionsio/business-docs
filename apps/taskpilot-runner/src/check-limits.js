// Sondeo: que informacion de limites de uso del plan entrega el SDK (mensajes rate_limit, accountInfo).
//   node src/check-limits.js
import { query } from '@anthropic-ai/claude-agent-sdk';
import { claudeEnv } from './config.js';

(async () => {
  const q = query({
    prompt: 'Respondé solo con la palabra OK.',
    options: { permissionMode: 'default', settingSources: [], allowedTools: [], maxTurns: 1, env: claudeEnv(), persistSession: false },
  });
  const seen = {};
  for await (const msg of q) {
    seen[msg.type] = (seen[msg.type] || 0) + 1;
    if (msg.type === 'system' && msg.subtype === 'init') {
      console.log('init keys:', Object.keys(msg).join(', '));
      try { const a = await q.accountInfo(); console.log('accountInfo ->', JSON.stringify(a).slice(0, 600)); } catch (e) { console.log('accountInfo error:', e.message); }
    } else if (msg.type !== 'assistant' && msg.type !== 'result') {
      console.log('msg', msg.type, JSON.stringify(msg).slice(0, 500));
    } else if (msg.type === 'result') {
      console.log('result keys:', Object.keys(msg).join(', '));
      for (const k of Object.keys(msg)) if (/limit|rate|usage|plan/i.test(k)) console.log('  ', k, JSON.stringify(msg[k]).slice(0, 400));
    }
  }
  console.log('tipos vistos:', seen);
})().catch((e) => console.error('ERROR', e.message));
