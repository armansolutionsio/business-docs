/**
 * Structured logger.
 *
 * - En produccion: JSON one-liner por linea (stdout INFO/WARN/DEBUG, stderr ERROR).
 * - En desarrollo: texto coloreado de una linea, con origen archivo:linea.
 * - Filtrado por LOG_LEVEL (debug < info < warn < error). Default: info.
 *
 * Uso:
 *   const log = require('./logger');
 *   log.info('server_started', { port: 3000 });
 *   log.error('db_query_failed', { error: err.message });
 *   log.info(req, 'http', { status: 200, ms: 12 });   // Express req como primer arg
 */

const path = require('path');

const SERVICE = 'business-docs';
const IS_PROD = process.env.NODE_ENV === 'production';
const USE_COLOR = !IS_PROD && process.stdout.isTTY;

const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };
const CONFIGURED_LEVEL = (process.env.LOG_LEVEL || (IS_PROD ? 'info' : 'debug')).toUpperCase();
const MIN_LEVEL = LEVELS[CONFIGURED_LEVEL] ?? LEVELS.INFO;

const COLORS = {
  DEBUG: '\x1b[90m',  // gris
  INFO:  '\x1b[36m',  // cyan
  WARN:  '\x1b[33m',  // amarillo
  ERROR: '\x1b[31m',  // rojo
  DIM:   '\x1b[2m',
  RESET: '\x1b[0m',
};

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

function _origin() {
  const stack = new Error().stack.split('\n');
  // 0: 'Error', 1: _origin, 2: _out, 3: log.x, 4: caller real
  for (let i = 4; i < stack.length; i++) {
    const line = stack[i];
    if (!line || line.includes('utils/logger.js') || line.includes('utils\\logger.js')) continue;
    const m = line.match(/\((.*):(\d+):(\d+)\)/) || line.match(/at\s+(.*):(\d+):(\d+)/);
    if (!m) continue;
    const file = m[1];
    if (file.includes('node_modules')) continue;
    const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
    return `${rel}:${m[2]}`;
  }
  return null;
}

function _formatPretty(entry) {
  const time = entry.time.slice(11, 19);
  const lvl = entry.level.padEnd(5);
  const lvlColor = USE_COLOR ? COLORS[entry.level] : '';
  const reset = USE_COLOR ? COLORS.RESET : '';
  const dim = USE_COLOR ? COLORS.DIM : '';

  const origin = entry.origin ? `${dim}[${entry.origin}]${reset} ` : '';
  const reqInfo = entry.method ? `${dim}${entry.method} ${entry.path}${reset} ` : '';

  const extras = Object.entries(entry)
    .filter(([k]) => !['time', 'level', 'service', 'msg', 'origin', 'method', 'path', 'req_id', 'ip', 'stack'].includes(k))
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');

  let line = `${dim}${time}${reset} ${lvlColor}${lvl}${reset} ${origin}${reqInfo}${entry.msg || ''}`;
  if (extras) line += ` ${dim}${extras}${reset}`;
  if (entry.stack) line += `\n${dim}${entry.stack}${reset}`;
  return line;
}

function _out(level, reqOrMsg, msgOrExtra, extra = {}) {
  if (LEVELS[level] < MIN_LEVEL) return;

  let req = null;
  let msg = reqOrMsg;
  let fields = msgOrExtra || {};

  if (reqOrMsg && typeof reqOrMsg === 'object' && reqOrMsg.method && reqOrMsg.url !== undefined) {
    req    = reqOrMsg;
    msg    = msgOrExtra;
    fields = extra;
  }

  const entry = {
    time:    new Date().toISOString(),
    level,
    service: SERVICE,
    msg,
    origin:  _origin(),
    ...fields,
  };

  if (req) {
    entry.method = req.method;
    entry.path   = req.path || req.url;
    entry.req_id = req.headers?.['x-request-id'] || req.id || undefined;
    entry.ip     = req.ip || req.socket?.remoteAddress || undefined;
  }

  const stream = level === 'ERROR' ? process.stderr : process.stdout;
  const out = IS_PROD ? JSON.stringify(entry) : _formatPretty(entry);
  stream.write(out + '\n');
}

const log = {
  debug: (a, b, c) => _out('DEBUG', a, b, c),
  info:  (a, b, c) => _out('INFO',  a, b, c),
  warn:  (a, b, c) => _out('WARN',  a, b, c),
  error: (a, b, c) => _out('ERROR', a, b, c),
};

module.exports = log;
