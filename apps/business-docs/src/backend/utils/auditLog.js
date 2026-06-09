const db = require('./db');
const log = require('./logger');

async function logAudit({ tabla, registro_id, accion, campo, valor_anterior, valor_nuevo, usuario }) {
  try {
    await db.query(
      `INSERT INTO audit_log (tabla, registro_id, accion, campo, valor_anterior, valor_nuevo, usuario)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tabla, registro_id, accion, campo, valor_anterior, valor_nuevo, usuario || 'system']
    );
  } catch (e) {
    log.error('audit_log_insert_failed', { tabla, registro_id, accion, error: e.message });
  }
}

module.exports = { logAudit };
