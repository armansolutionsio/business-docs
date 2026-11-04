// Prompts del runner: instrucciones de TaskPilot que se agregan al system prompt de Claude Code,
// el prompt inicial con el contexto de la tarea de Redmine, el de ejecucion y el del informe.

export const SYSTEM_APPEND = `
# TaskPilot (Arman Suite)

Trabajás dentro de TaskPilot, una herramienta que toma tareas de Redmine y las resuelve con vos en un chat.
Hablá siempre en español rioplatense, claro y concreto. El usuario es desarrollador.

Reglas obligatorias:
- Primero analizás, después proponés, y recién cuando el usuario aprueba el plan ejecutás. Hasta que el plan esté aprobado no modificás ningún archivo ni ejecutás comandos que cambien algo.
- NUNCA hacés commit, push, pull, merge, rebase, checkout, reset ni creás Pull Requests. Eso lo hace el usuario desde el panel Git de TaskPilot, con su propio usuario de git. Si necesitás que el repo esté en otra rama o actualizado, pedíselo al usuario.
- No borrás ni modificás nada en Redmine ni en sistemas externos. No tocás archivos .env ni secretos.
- Cualquier operación sensible (comandos que instalan, migran, borran, llaman a servicios) se pide; el usuario la aprueba o la rechaza desde el chat. Si la rechaza, buscás otra forma o explicás el bloqueo.
- Si la tarea es una consulta, un análisis o una gestión que no requiere código, respondela directamente en el chat y decilo de forma explícita: "Esta tarea no requiere cambios de código".
- Cuando terminás una ejecución, resumís qué hiciste, qué archivos tocaste, qué pruebas corriste y qué quedó pendiente, y proponés el mensaje de commit (el commit lo hace el usuario).
- Sé honesto con lo que no pudiste verificar.
`.trim();

const fmtDate = (d) => (d ? String(d).slice(0, 10) : '-');

export function startPrompt({ issue, repo, git, instrucciones, alias, actividades }) {
  const i = issue;
  const cfs = (i.custom_fields || []).filter((c) => c.value !== '' && c.value !== null && !(Array.isArray(c.value) && !c.value.length));
  const lines = [];
  lines.push(`# Tarea de Redmine #${i.id}: ${i.subject}`);
  lines.push('');
  lines.push(`- Proyecto: ${i.project_name || '-'}`);
  lines.push(`- Tipo: ${i.tracker || '-'} · Estado: ${i.status || '-'} · Prioridad: ${i.priority || '-'}`);
  lines.push(`- Autor (PM): ${i.author || '-'} · Asignada a: ${i.assigned_to || '-'}${alias ? ` (${alias})` : ''}`);
  lines.push(`- Inicio: ${fmtDate(i.start_date)} · Vencimiento: ${fmtDate(i.due_date)} · Estimadas: ${i.estimated_hours ?? '-'} h · Cargadas: ${i.spent_hours ?? '-'} h`);
  if (i.fixed_version) lines.push(`- Versión: ${i.fixed_version}`);
  if (i.url) lines.push(`- URL: ${i.url}`);
  if (cfs.length) {
    lines.push('');
    lines.push('## Campos de Redmine');
    for (const c of cfs) lines.push(`- ${c.name}: ${Array.isArray(c.value) ? c.value.join(', ') : c.value}`);
  }
  lines.push('');
  lines.push('## Descripción completa (tal cual la escribió el PM)');
  lines.push('');
  lines.push(i.description && i.description.trim() ? i.description.trim() : '(sin descripción)');
  if (Array.isArray(i.journals) && i.journals.length) {
    lines.push('');
    lines.push('## Notas del historial en Redmine');
    for (const j of i.journals) lines.push(`- [${fmtDate(j.created_on)}] ${j.user_name || '?'}: ${String(j.notes).trim()}`);
  }
  lines.push('');
  lines.push('## Entorno de trabajo');
  if (repo) {
    lines.push(`- Repositorio: ${repo.name} (${repo.path})${repo.description ? ' — ' + repo.description : ''}`);
    lines.push(`- Rama de trabajo esperada: ${repo.branch || '(no definida)'}`);
    if (git) {
      lines.push(`- Rama actual: ${git.branch || '?'}${git.lastCommit ? ' · último commit: ' + git.lastCommit : ''}`);
      if (git.dirty) lines.push(`- Atención: el working tree tiene ${git.dirty} archivo(s) con cambios sin commitear.`);
      if (git.error) lines.push(`- No se pudo leer el estado de git: ${git.error}`);
    }
  } else {
    lines.push('- Sin repositorio: es una consulta, análisis o gestión. Resolvela desde el chat.');
  }
  if (Array.isArray(actividades) && actividades.length) {
    lines.push(`- Tipos de actividad válidos para registrar horas: ${actividades.join(', ')}`);
  }
  if (instrucciones) {
    lines.push('');
    lines.push('## Instrucciones adicionales del usuario');
    lines.push(instrucciones);
  }
  lines.push('');
  lines.push('## Qué tenés que hacer ahora');
  lines.push('');
  lines.push('1. Leé la tarea y, si hay repositorio, explorá el código que haga falta (solo lectura).');
  lines.push('2. Explicá qué entendiste del requerimiento, con tus palabras, y marcá dudas o ambigüedades.');
  lines.push('3. Proponé cómo lo vas a resolver: pasos concretos, archivos que tocarías, pruebas que harías y riesgos.');
  lines.push('4. Si la tarea no requiere código (consulta, análisis, gestión), respondela directamente y decilo.');
  lines.push('');
  lines.push('No modifiques nada todavía: el usuario va a leer tu propuesta, conversar y aprobar el plan antes de que ejecutes.');
  return lines.join('\n');
}

export function execPrompt(comentario) {
  return [
    'El usuario aprobó el plan. Ejecutalo ahora sobre el repositorio.',
    comentario ? `Comentario del usuario al aprobar: ${comentario}` : '',
    'Recordá: nada de commit ni push; las operaciones sensibles se piden y el usuario las aprueba desde el chat.',
    'Al terminar, resumí qué hiciste, qué archivos tocaste, qué pruebas corriste y qué quedó pendiente, y proponé el mensaje de commit.',
  ].filter(Boolean).join('\n');
}

export function reportPrompt(actividades) {
  return [
    'Generá el informe final de lo trabajado en esta sesión, en el formato estructurado pedido.',
    'Sé concreto y técnico. Si la tarea fue informativa o administrativa y no necesita testing, marcá requiere_testing en false y explicalo en testing_manual.',
    'minutos_estimados es tu estimación honesta de minutos de trabajo humano equivalente para lo realizado.',
    Array.isArray(actividades) && actividades.length ? `tipo_actividad tiene que ser exactamente uno de: ${actividades.join(', ')}.` : '',
    'comentario_propuesto es un comentario breve, técnico y descriptivo de lo realizado, apto para registrarlo en Redmine y en la planilla de horas.',
  ].filter(Boolean).join('\n');
}

export const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['resumen', 'resultado', 'archivos', 'pruebas_automaticas', 'testing_manual', 'errores_pendientes',
    'comentario_propuesto', 'minutos_estimados', 'requiere_testing', 'tipo_actividad', 'commit_message'],
  properties: {
    resumen: { type: 'string', description: 'Qué se hizo, en 2 a 6 oraciones' },
    resultado: { type: 'string', description: 'Qué resultado se obtuvo y cómo se verificó' },
    archivos: {
      type: 'array',
      description: 'Archivos o componentes modificados; vacío si no hubo cambios',
      items: { type: 'object', additionalProperties: false, required: ['ruta', 'cambio'], properties: { ruta: { type: 'string' }, cambio: { type: 'string' } } },
    },
    pruebas_automaticas: { type: 'string', description: 'Pruebas automáticas ejecutadas y su resultado; "ninguna" si no hubo' },
    testing_manual: { type: 'string', description: 'Instrucciones concretas de testing manual, o por qué no hace falta' },
    errores_pendientes: { type: 'string', description: 'Errores, limitaciones y pendientes; "ninguno" si no hay' },
    comentario_propuesto: { type: 'string', description: 'Comentario breve y técnico para registrar la actividad' },
    minutos_estimados: { type: 'integer', minimum: 0, description: 'Minutos de trabajo humano equivalente' },
    requiere_testing: { type: 'boolean' },
    tipo_actividad: { type: 'string', description: 'Tipo de actividad de Redmine que mejor describe el trabajo' },
    commit_message: { type: 'string', description: 'Mensaje de commit listo para copiar; vacío si no hubo cambios de código' },
  },
};
