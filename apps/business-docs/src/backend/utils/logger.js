/**
 * Structured logger for business-docs.
 *
 * Every log line is a JSON object with:
 *   time, level, service, req_id (if available), msg, ...extra fields
 *
 * Usage:
 *   const log = require('./logger');
 *   log.info('document generated', { doc_type: 'quote', party_id: '...' });
 *   log.info(req, 'request received');   // pass Express req as first arg
 */

const SERVICE = 'business-docs';

function _out(level, reqOrMsg, msgOrExtra, extra = {}) {
  let req = null;
  let msg = reqOrMsg;
  let fields = msgOrExtra || {};

  // If first arg looks like an Express request object
  if (reqOrMsg && typeof reqOrMsg === 'object' && reqOrMsg.method) {
    req    = reqOrMsg;
    msg    = msgOrExtra;
    fields = extra;
  }

  const entry = {
    time:    new Date().toISOString(),
    level,
    service: SERVICE,
    msg,
    ...fields,
  };

  if (req) {
    entry.method   = req.method;
    entry.path     = req.path || req.url;
    entry.req_id   = req.headers?.['x-request-id'] || req.id || undefined;
    entry.ip       = req.ip || req.socket?.remoteAddress || undefined;
  }

  // Use stderr for errors, stdout for everything else
  const stream = level === 'ERROR' ? process.stderr : process.stdout;
  stream.write(JSON.stringify(entry) + '\n');
}

const log = {
  info:  (a, b, c) => _out('INFO',  a, b, c),
  warn:  (a, b, c) => _out('WARN',  a, b, c),
  error: (a, b, c) => _out('ERROR', a, b, c),
  debug: (a, b, c) => _out('DEBUG', a, b, c),
};

module.exports = log;
