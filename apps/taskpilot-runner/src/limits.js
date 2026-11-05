// Limites de uso del plan de Claude.
// readUsage: lectura completa sin hablar con el modelo, asi que no consume el plan. Usa la API de uso
// del SDK, que todavia es experimental: si cambia o falla, tira error y quien llama decide.
// probeLimits: si esa lectura falla, hace un turno minimo (Haiku, una respuesta) y toma el rate_limit_event.

import { query } from '@anthropic-ai/claude-agent-sdk';
import { claudeEnv } from './config.js';

const READ_TIMEOUT_MS = 45000;
const epoch = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? Math.round(t / 1000) : null; };

function usageWindow(w, entry) {
  if (!w || w.utilization == null) return undefined;
  const utilization = Number(w.utilization) / 100;
  const warned = entry?.severity && entry.severity !== 'normal';
  return { utilization, resetsAt: epoch(w.resets_at), status: utilization >= 1 ? 'rejected' : warned ? 'allowed_warning' : 'allowed' };
}

const money = (m) => (m && m.amount_minor != null ? m.amount_minor / 10 ** (m.exponent ?? 2) : null);

// Pasa la respuesta del SDK (porcentajes 0-100, fechas ISO) a la forma de rate_limit_info (0-1, epoch).
function normalize(usage) {
  const r = usage.rate_limits || {};
  const limits = Array.isArray(r.limits) ? r.limits : [];
  // Cuanto del limite semanal consumio cada modelo con limite propio (weeklyShare) y que parte tiene asignada (allowance).
  const shareOf = (name) => (r.weekly_scoped_shares || []).find((s) => limits[s.limit_index]?.scope?.model?.display_name === name);
  const info = {
    source: 'usage',
    unifiedWindows: {
      five_hour: usageWindow(r.five_hour, limits.find((l) => l.kind === 'session')),
      seven_day: usageWindow(r.seven_day, limits.find((l) => l.kind === 'weekly_all')),
    },
    models: (r.model_scoped || []).filter((m) => m.utilization != null)
      .map((m) => {
        const share = shareOf(m.display_name);
        return { name: m.display_name, utilization: Number(m.utilization) / 100, resetsAt: epoch(m.resets_at), weeklyShare: share?.used_percent_of_weekly ?? null, allowance: share?.allowance_percent_of_weekly ?? null };
      }),
  };
  const b = r.seven_day_breakdown;
  if (b) {
    info.weekStartedAt = epoch(b.window_started_at);
    info.breakdown = (b.rows || []).filter((x) => x.percent > 0).map((x) => ({ name: x.display_name, percent: x.percent }));
  }
  if (r.spend) info.extra = { enabled: Boolean(r.spend.enabled), used: money(r.spend.used), limit: money(r.spend.limit), currency: r.spend.used?.currency || null };
  return info;
}

export async function readUsage() {
  let release;
  const hold = new Promise((resolve) => { release = resolve; });
  async function* noPrompt() { await hold; } // nunca manda un mensaje: no hay turno ni consumo
  const q = query({ prompt: noPrompt(), options: { settingSources: [], allowedTools: [], persistSession: false, env: claudeEnv() } });
  let timer;
  try {
    const read = (async () => {
      const usage = await q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true });
      let account = null;
      try { account = await q.accountInfo(); } catch { account = null; }
      return { usage, account };
    })();
    const expired = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('tiempo de espera agotado')), READ_TIMEOUT_MS); });
    const { usage, account } = await Promise.race([read, expired]);
    if (!usage?.rate_limits_available || !usage.rate_limits) throw new Error('el plan no informa límites');
    return { info: normalize(usage), account };
  } finally {
    clearTimeout(timer);
    release();
    q.close();
  }
}

async function probeWithTurn() {
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

export async function probeLimits() {
  try {
    return await readUsage();
  } catch (e) {
    console.warn('[runner] lectura de uso sin consumo no disponible, se usa un turno mínimo:', e.message);
    return probeWithTurn();
  }
}
