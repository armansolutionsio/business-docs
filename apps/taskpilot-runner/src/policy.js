// Politica de permisos del runner.
//
// - classify(): que hace el runner con cada herramienta que Claude quiere usar en la fase de
//   ejecucion: allow (automatico), deny (nunca) o ask (pedir aprobacion al usuario en el chat).
// - hardBlock(): reglas duras que se aplican en un hook PreToolUse, antes que cualquier regla de
//   permisos del repo: git de escritura (commit, push, etc. los hace el usuario a mano), borrados
//   recursivos, comandos destructivos y escrituras en .env.
// - summarize(): descripcion corta de la operacion para mostrar en el chat.

import path from 'node:path';

const READ_ONLY_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'LS', 'WebFetch', 'WebSearch', 'TodoWrite', 'TodoRead', 'NotebookRead',
  'Task', 'ListMcpResourcesTool', 'ReadMcpResourceTool', 'BashOutput', 'KillShell', 'StructuredOutput',
]);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

const FORBIDDEN = [
  { re: /\bgit\s+(commit|push|pull|fetch|merge|rebase|reset|checkout|switch|restore|stash|cherry-pick|revert|tag|am|apply|clean|rm|mv|init|remote\s+(add|remove|set-url)|branch\s+(-d|-D|-m|-M))\b/i, why: 'Las operaciones de git que modifican el repo (commit, push, checkout, reset...) las hace el usuario a mano.' },
  { re: /\bgh\s+(pr|repo|release)\s+(create|merge|delete|close)\b/i, why: 'Los Pull Requests los crea el usuario a mano.' },
  { re: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*|--recursive)\b/i, why: 'Borrado recursivo.' },
  { re: /\b(rmdir|rd)\b.*\/s/i, why: 'Borrado recursivo de carpetas.' },
  { re: /\bdel\b.*\/[sq]/i, why: 'Borrado masivo.' },
  { re: /\bRemove-Item\b.*-Recurse/i, why: 'Borrado recursivo.' },
  { re: /\b(drop|truncate)\s+(table|database|schema)\b/i, why: 'Operacion destructiva sobre la base de datos.' },
  { re: /\b(shutdown|reboot|mkfs|diskpart|format\s+[a-z]:)/i, why: 'Comando de sistema destructivo.' },
  { re: /\bdd\s+if=/i, why: 'Comando de sistema destructivo.' },
  { re: /(curl|wget|Invoke-WebRequest)[^|]*\|\s*(ba|z|power)?sh\b/i, why: 'Ejecucion de scripts remotos.' },
  { re: /\bnpm\s+publish\b/i, why: 'Publicacion de paquetes.' },
  { re: /\bdocker\s+(rm|rmi|system\s+prune|volume\s+rm|compose\s+down\s+(-v|--volumes))\b/i, why: 'Operacion destructiva de Docker.' },
];

const SAFE_BASH = [
  /^git\s+(status|diff|log|show|branch(\s+(-a|-r|-v|--list|--show-current))?|rev-parse|blame|ls-files|remote(\s+-v)?|describe|shortlog|stash\s+list)\b/,
  /^(ls|dir|pwd|cat|type|head|tail|wc|echo|which|where|tree|find|grep|rg|stat|file|du|df|date|whoami|hostname)\b/,
  /^(npm|pnpm|yarn)\s+(test|t|run\s+(test|tests|lint|build|check|typecheck|test:[\w-]+|lint:[\w-]+)|ls|view|outdated|--version|-v)\b/,
  /^node\s+(--check|-c|-v|--version|-e\s+"console\.log)/,
  /^(npx\s+)?(eslint|prettier\s+--check|tsc\s+(--noEmit|-p)|jest|vitest(\s+run)?|mocha|ava|pytest|python\s+-m\s+(pytest|py_compile|unittest)|ruff|flake8|mypy)\b/,
  /^(python|python3|node|npm|java|dotnet|go|php|ruby)\s+(--version|-v|-V|version)\b/,
  /^(go\s+(test|vet|build)|cargo\s+(test|check|build)|dotnet\s+(test|build)|mvn\s+(test|compile)|gradle\s+(test|build))\b/,
  /^(curl|wget)\s+(-s\s+)?(-I\s+|--head\s+)?https?:\/\/(localhost|127\.0\.0\.1)/,
];

function insideRepo(filePath, repoPath) {
  if (!repoPath || !filePath) return false;
  const abs = path.resolve(repoPath, String(filePath));
  const rel = path.relative(repoPath, abs);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function splitCommands(command) {
  return String(command).split(/\s*(?:&&|\|\||;|\|)\s*|\r?\n/).map((s) => s.trim()).filter(Boolean);
}

export function hardBlock(toolName, input) {
  if (toolName === 'Bash') {
    const cmd = String(input?.command || '');
    for (const f of FORBIDDEN) if (f.re.test(cmd)) return f.why;
    return null;
  }
  if (EDIT_TOOLS.has(toolName)) {
    const fp = String(input?.file_path || input?.notebook_path || '');
    if (/(^|[\\/])\.env(\.|$)/i.test(fp) && !/\.env\.example$/i.test(fp)) return 'No se escriben archivos .env (contienen secretos).';
  }
  return null;
}

// Decision para la fase de ejecucion: { decision: 'allow' | 'deny' | 'ask', reason }
export function classify(toolName, input, { repoPath }) {
  if (READ_ONLY_TOOLS.has(toolName)) return { decision: 'allow' };
  const blocked = hardBlock(toolName, input);
  if (blocked) return { decision: 'deny', reason: blocked };
  if (EDIT_TOOLS.has(toolName)) {
    const fp = input?.file_path || input?.notebook_path;
    if (repoPath && insideRepo(fp, repoPath)) return { decision: 'allow' };
    return { decision: 'ask', reason: repoPath ? 'Escritura fuera del repositorio de la tarea' : 'Escritura de archivo sin repositorio asignado' };
  }
  if (toolName === 'Bash') {
    const parts = splitCommands(input?.command || '');
    const hasRedirect = /(^|[^>])>(?!>)|>>/.test(String(input?.command || ''));
    if (parts.length && !hasRedirect && parts.every((p) => SAFE_BASH.some((re) => re.test(p)))) return { decision: 'allow' };
    return { decision: 'ask', reason: 'Comando que modifica el entorno o no esta en la lista segura' };
  }
  return { decision: 'ask', reason: `Herramienta ${toolName}` };
}

const short = (s, n = 160) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 3) + '...' : t; };

export function summarize(toolName, input) {
  const i = input || {};
  switch (toolName) {
    case 'Read': return `Lee ${short(i.file_path)}`;
    case 'Edit': case 'MultiEdit': return `Edita ${short(i.file_path)}`;
    case 'Write': return `Escribe ${short(i.file_path)}`;
    case 'NotebookEdit': return `Edita notebook ${short(i.notebook_path)}`;
    case 'Bash': return `Ejecuta: ${short(i.command, 300)}`;
    case 'Grep': return `Busca "${short(i.pattern, 80)}"${i.path ? ' en ' + short(i.path, 80) : ''}`;
    case 'Glob': return `Lista archivos ${short(i.pattern, 80)}`;
    case 'LS': return `Lista ${short(i.path)}`;
    case 'WebFetch': return `Consulta ${short(i.url)}`;
    case 'WebSearch': return `Busca en la web "${short(i.query, 80)}"`;
    case 'Task': return `Subagente: ${short(i.description || i.prompt, 120)}`;
    case 'TodoWrite': return 'Actualiza su lista de pasos';
    case 'ExitPlanMode': return 'Propone el plan';
    default: return `${toolName} ${short(JSON.stringify(i), 160)}`;
  }
}
