// Una sesion de TaskPilot = una conversacion persistente con Claude sobre una tarea de Redmine.
//
// Flujo:
//   start        -> fase "plan": Claude analiza (modo plan, solo lectura) y propone como resolver.
//   message      -> cada mensaje del usuario es un turno nuevo que retoma la misma sesion del SDK.
//   approve_plan -> fase "ejecucion": Claude trabaja; las operaciones sensibles se aprueban en el chat.
//                   Al terminar cada ejecucion se pide un informe estructurado (fase "informe").
//   cancel       -> aborta el turno en curso.
//
// Cada turno es una llamada a query() con `resume` (el SDK guarda la conversacion). Las decisiones
// de permisos pasan por canUseTool, que crea aprobaciones en el servidor y espera la respuesta
// del usuario; un hook PreToolUse aplica las reglas duras (ver policy.js) antes que todo.

import fs from 'node:fs';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { api } from './api.js';
import { config, claudeEnv, authMode } from './config.js';
import { gitStatus } from './git.js';
import { classify, hardBlock, summarize } from './policy.js';
import { SYSTEM_APPEND, REPORT_SCHEMA, startPrompt, execPrompt, reportPrompt } from './prompts.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (id, ...a) => console.log(`[sesion ${id}]`, ...a);

export class Session {
  constructor({ id, repo, model, alias, actividades, repos, contexto }) {
    this.id = id;
    this.repo = repo || null;        // { name, path, branch, description } o null
    this.model = model;
    this.alias = alias || null;
    this.actividades = actividades || [];
    this.repos = repos;
    this.contexto = contexto || { global: '', repo: '' }; // cargado por el equipo desde la pestaña Contexto
    this.fase = 'plan';
    this.sdkSessionId = null;
    this.abort = null;
    this.cancelled = false;
    this.chain = Promise.resolve();  // los jobs de una misma sesion se procesan en orden
  }

  get cwd() {
    if (this.repo) return this.repo.path;
    const dir = path.join(config.workdir, `sesion-${this.id}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  enqueue(fn) {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => {});
    return run;
  }

  async send(events) { await api.events(this.id, Array.isArray(events) ? events : [events]); }

  // System prompt: reglas de TaskPilot + el contexto que cargo el equipo (general y del repo).
  systemAppend() {
    const parts = [SYSTEM_APPEND];
    const g = String(this.contexto?.global || '').trim();
    const r = String(this.contexto?.repo || '').trim();
    if (g) parts.push(`# Contexto general cargado por el equipo\n\n${g}`);
    if (r) parts.push(`# Contexto del repositorio ${this.repo?.name || ''} cargado por el equipo\n\n${r}`);
    return parts.join('\n\n');
  }

  // ── permisos ───────────────────────────────────────────────────────
  guardHook = async (input) => {
    const why = hardBlock(input.tool_name, input.tool_input);
    if (!why) return {};
    log(this.id, 'bloqueado por regla dura:', input.tool_name, why);
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: why } };
  };

  canUseTool = async (toolName, input) => {
    const allow = () => ({ behavior: 'allow', updatedInput: input });
    const deny = (message) => ({ behavior: 'deny', message });

    if (toolName === 'ExitPlanMode') {
      const plan = typeof input?.plan === 'string' && input.plan.trim() ? input.plan : 'Claude propone pasar a la ejecución del plan descripto en el chat.';
      const decision = await this.askApproval({ tipo: 'plan', tool: toolName, input, descripcion: plan });
      if (decision.estado === 'aprobado') { this.fase = 'ejecucion'; return allow(); }
      return deny(`El usuario no aprobó el plan${decision.motivo ? ': ' + decision.motivo : ''}. Ajustá la propuesta según sus comentarios y volvé a presentarla.`);
    }

    const c = classify(toolName, input, { repoPath: this.repo?.path || null });
    if (this.fase === 'plan') {
      if (c.decision === 'allow') return allow();
      return deny('Todavía estás en la fase de análisis: no se modifica nada hasta que el usuario apruebe el plan. Proponé el plan y esperá la aprobación.');
    }
    if (c.decision === 'allow') return allow();
    if (c.decision === 'deny') return deny(c.reason || 'Operación no permitida por TaskPilot.');
    const decision = await this.askApproval({ tipo: 'tool', tool: toolName, input, descripcion: `${summarize(toolName, input)}${c.reason ? ' (' + c.reason + ')' : ''}` });
    if (decision.estado === 'aprobado') return allow();
    return deny(`El usuario rechazó la operación${decision.motivo ? ': ' + decision.motivo : ''}. Buscá otra forma o explicá el bloqueo.`);
  };

  async askApproval(data) {
    const { id } = await api.createApproval(this.id, data);
    log(this.id, `esperando aprobación #${id} (${data.tipo}: ${data.tool})`);
    for (;;) {
      if (this.cancelled) throw new Error('Sesión cancelada mientras esperaba una aprobación');
      let a = null;
      try { a = await api.waitApproval(id); } catch (e) { log(this.id, 'error consultando aprobación:', e.message); await sleep(3000); continue; }
      if (a && a.estado !== 'pendiente') {
        if (data.tipo === 'plan' && a.estado === 'aprobado') this.fase = 'ejecucion';
        // Claude sigue trabajando dentro del mismo turno: que la pantalla lo refleje.
        await this.send({ type: 'status', estado: 'trabajando', fase: this.fase }).catch(() => {});
        return a;
      }
    }
  }

  // Despues de cada turno en fase de ejecucion que termino bien, se pide el informe.
  async afterTurn(r) {
    if (this.fase === 'ejecucion' && r?.result?.subtype === 'success' && !this.cancelled) await this.report();
  }

  // ── un turno de Claude ─────────────────────────────────────────────
  async runTurn(prompt, { mode, outputFormat, maxTurns } = {}) {
    const ac = new AbortController();
    this.abort = ac;
    await this.send({ type: 'status', estado: 'trabajando', fase: this.fase });
    const options = {
      cwd: this.cwd,
      model: this.model,
      permissionMode: mode || (this.fase === 'plan' ? 'plan' : 'default'),
      systemPrompt: { type: 'preset', preset: 'claude_code', append: this.systemAppend() },
      settingSources: ['project'],
      canUseTool: this.canUseTool,
      hooks: { PreToolUse: [{ hooks: [this.guardHook] }] },
      disallowedTools: ['AskUserQuestion'],
      maxTurns: maxTurns || config.maxTurns,
      maxBudgetUsd: config.maxBudgetUsd,
      abortController: ac,
      env: claudeEnv(),
    };
    if (config.effort) options.effort = config.effort;
    if (this.sdkSessionId) options.resume = this.sdkSessionId;
    if (outputFormat) options.outputFormat = outputFormat;

    const texts = [];
    let result = null;
    let limits = null;
    try {
      for await (const msg of query({ prompt, options })) {
        if (msg.type === 'system' && msg.subtype === 'init') {
          this.sdkSessionId = msg.session_id;
          await this.send({ type: 'init', sdk_session_id: msg.session_id, model: msg.model, auth: msg.apiKeySource && msg.apiKeySource !== 'none' ? 'api_key' : 'suscripcion' });
        } else if (msg.type === 'rate_limit_event') {
          limits = msg.rate_limit_info || limits;
        } else if (msg.type === 'assistant') {
          for (const b of msg.message?.content || []) {
            if (b.type === 'text' && b.text && b.text.trim()) {
              texts.push(b.text);
              await this.send({ type: 'assistant', text: b.text, fase: this.fase });
            } else if (b.type === 'tool_use' && b.name !== 'StructuredOutput') {
              await this.send({ type: 'tool_use', tool: b.name, summary: summarize(b.name, b.input), input: compactInput(b.name, b.input) });
            }
          }
        } else if (msg.type === 'user') {
          for (const b of (Array.isArray(msg.message?.content) ? msg.message.content : [])) {
            if (b.type === 'tool_result' && b.is_error) {
              await this.send({ type: 'tool_result', tool: null, summary: textOf(b.content).slice(0, 1500), is_error: true });
            }
          }
        } else if (msg.type === 'result') {
          result = msg;
          const usage = msg.usage || {};
          await this.send({
            type: 'result', subtype: msg.subtype, costo_usd: msg.total_cost_usd, duracion_ms: msg.duration_ms, turnos: msg.num_turns,
            tokens_in: (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0),
            tokens_out: usage.output_tokens || 0,
            text: msg.subtype === 'success' ? null : `Turno terminado con ${msg.subtype}${msg.errors?.length ? ': ' + msg.errors.join(' | ') : ''}`,
          });
        }
      }
    } catch (e) {
      if (ac.signal.aborted || this.cancelled) {
        await this.send({ type: 'system', text: 'Turno interrumpido por el usuario.' });
      } else {
        log(this.id, 'error en el turno:', e.message);
        await this.send({ type: 'error', message: e.message });
        throw e;
      }
    } finally {
      this.abort = null;
    }
    // Limites del plan que vinieron con este turno (ventanas de 5 h y 7 dias): se reportan al servidor.
    if (limits) api.limits({ info: limits }).catch(() => {});
    await this.send({ type: 'status', estado: 'esperando_usuario', fase: this.fase });
    return { result, text: texts.join('\n\n') };
  }

  // ── jobs ───────────────────────────────────────────────────────────
  async start(payload) {
    const issue = payload.issue || {};
    await this.send({ type: 'system', text: authMode() === 'api_key'
      ? 'Autenticación: API key de Anthropic (el costo que se muestra se factura a la cuenta de la key).'
      : 'Autenticación: suscripción de Claude Code de esta PC. No se factura aparte; cuenta contra los límites de uso del plan.' });
    const ctxG = String(this.contexto?.global || '').trim(), ctxR = String(this.contexto?.repo || '').trim();
    if (ctxG || ctxR) await this.send({ type: 'system', text: `Contexto cargado: ${[ctxG ? `general (${ctxG.length} caracteres)` : '', ctxR ? `repo ${this.repo?.name || ''} (${ctxR.length} caracteres)` : ''].filter(Boolean).join(' y ')}.` });
    let git = null;
    if (this.repo) {
      git = await gitStatus(this.repo.path);
      const avisos = [`Repo ${this.repo.name} en ${this.repo.path}.`];
      if (git.error) avisos.push(`No se pudo leer git: ${git.error}.`);
      else {
        avisos.push(`Rama actual: ${git.branch}${this.repo.branch ? ` (esperada: ${this.repo.branch})` : ''}.`);
        if (this.repo.branch && git.branch !== this.repo.branch) avisos.push(`ATENCIÓN: el repo no está en la rama esperada. Cambiá de rama a mano si corresponde; el runner no lo hace.`);
        if (git.dirty) avisos.push(`Hay ${git.dirty} archivo(s) con cambios sin commitear.`);
        if (git.lastCommit) avisos.push(`Último commit: ${git.lastCommit}.`);
      }
      await this.send({ type: 'system', text: avisos.join(' ') });
    }
    const prompt = startPrompt({ issue, repo: this.repo, git, instrucciones: payload.instrucciones, alias: this.alias, actividades: this.actividades });
    const r = await this.runTurn(prompt, { mode: 'plan' });
    await this.afterTurn(r); // si el plan se aprobo dentro del turno (ExitPlanMode), Claude ya ejecuto
  }

  async message(text) {
    const r = await this.runTurn(text);
    await this.afterTurn(r);
  }

  async approvePlan(comentario) {
    this.fase = 'ejecucion';
    const r = await this.runTurn(execPrompt(comentario), { mode: 'default' });
    await this.afterTurn(r);
  }

  async report() {
    const r = await this.runTurn(reportPrompt(this.actividades), {
      mode: 'default', maxTurns: 8, outputFormat: { type: 'json_schema', schema: REPORT_SCHEMA },
    });
    let report = r.result?.structured_output || null;
    if (!report) {
      const m = (r.text || '').match(/\{[\s\S]*\}/);
      if (m) { try { report = JSON.parse(m[0]); } catch { report = null; } }
    }
    if (report) {
      this.fase = 'informe';
      await this.send({ type: 'report', report });
    } else {
      await this.send({ type: 'system', text: 'No se pudo generar el informe estructurado. Pedíselo de nuevo en el chat ("generá el informe").' });
    }
  }

  cancel() {
    this.cancelled = true;
    if (this.abort) this.abort.abort();
  }
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join('\n');
  return '';
}

// Lo que se guarda del input de una herramienta para mostrarlo en el chat (sin contenidos enormes).
function compactInput(tool, input) {
  if (!input || typeof input !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string') out[k] = v.length > 1200 ? v.slice(0, 1200) + '...' : v;
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) out[k] = v;
    else out[k] = JSON.stringify(v).slice(0, 600);
  }
  return out;
}
