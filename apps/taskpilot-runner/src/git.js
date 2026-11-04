// Git en el repo de la tarea. Dos usos:
// - gitInfo(): estado (rama, upstream, ahead/behind, archivos cambiados, autor configurado) para
//   mostrar en el chat y en el panel Git. Solo lectura.
// - gitOp(): operaciones que el USUARIO pide desde el panel Git de TaskPilot (pull, commit, push,
//   diff). Corren con el git y las credenciales de esta PC, asi el commit sale con el usuario
//   configurado en el repo. Claude nunca las ejecuta: su politica las bloquea.

import { execFile } from 'node:child_process';

function run(args, cwd, { timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, windowsHide: true, timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      const output = [String(stdout || '').trim(), String(stderr || '').trim()].filter(Boolean).join('\n');
      if (err) return reject(new Error(output || err.message));
      resolve(output);
    });
  });
}

export async function gitInfo(cwd) {
  try {
    const [branch, porcelain, last, name, email] = await Promise.all([
      run(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
      run(['status', '--porcelain'], cwd),
      run(['log', '-1', '--format=%h %s'], cwd).catch(() => ''),
      run(['config', 'user.name'], cwd).catch(() => ''),
      run(['config', 'user.email'], cwd).catch(() => ''),
    ]);
    let upstream = null, ahead = 0, behind = 0;
    try {
      upstream = await run(['rev-parse', '--abbrev-ref', '@{upstream}'], cwd);
      const ab = await run(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], cwd);
      [ahead, behind] = ab.split(/\s+/).map((n) => Number(n) || 0);
    } catch { /* sin upstream */ }
    const changes = porcelain ? porcelain.split(/\r?\n/).filter(Boolean).map((l) => ({ status: l.slice(0, 2).trim() || '?', path: l.slice(3) })) : [];
    return {
      branch, upstream, ahead, behind, changes, dirty: changes.length, lastCommit: last || null,
      authorName: name || null, authorEmail: email || null, author: name ? `${name}${email ? ' <' + email + '>' : ''}` : null, error: null,
    };
  } catch (e) {
    return { branch: null, upstream: null, ahead: 0, behind: 0, changes: [], dirty: 0, lastCommit: null, authorName: null, authorEmail: null, author: null, error: e.message };
  }
}

// Compatibilidad con session.js (resumen corto al iniciar una tarea).
export const gitStatus = gitInfo;

export async function gitOp(cwd, op, { message } = {}) {
  const attempt = async (args, opts) => {
    try { return { ok: true, output: await run(args, cwd, opts) }; }
    catch (e) { return { ok: false, output: e.message }; }
  };
  switch (op) {
    case 'status':
      return { ok: true, output: await run(['status', '--short', '--branch'], cwd).catch((e) => e.message) };
    case 'diff':
      return attempt(['diff', '--stat']);
    case 'pull':
      return attempt(['pull', '--ff-only'], { timeout: 300000 });
    case 'commit': {
      const msg = String(message || '').trim();
      if (!msg) return { ok: false, output: 'Falta el mensaje de commit.' };
      const info = await gitInfo(cwd);
      if (!info.authorName || !info.authorEmail) return { ok: false, output: 'El repo no tiene user.name / user.email configurados: el commit no tendría autor. Configuralos con git config.' };
      if (!info.dirty) return { ok: false, output: 'No hay cambios para commitear.' };
      const add = await attempt(['add', '-A']);
      if (!add.ok) return add;
      const c = await attempt(['commit', '-m', msg]);
      if (c.ok) c.output = `${c.output}\nAutor: ${info.author}`;
      return c;
    }
    case 'push': {
      const info = await gitInfo(cwd);
      if (!info.branch) return { ok: false, output: info.error || 'No se pudo leer la rama actual.' };
      return info.upstream
        ? attempt(['push'], { timeout: 300000 })
        : attempt(['push', '-u', 'origin', info.branch], { timeout: 300000 });
    }
    default:
      return { ok: false, output: `Operación git no permitida: ${op}` };
  }
}
