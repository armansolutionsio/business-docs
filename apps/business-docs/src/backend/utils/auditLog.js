const db = require('./db');

async function logAudit({ tabla, registro_id, accion, campo, valor_anterior, valor_nuevo, usuario }) {
  try {
    await db.query(
      `INSERT INTO audit_log (tabla, registro_id, accion, campo, valor_anterior, valor_nuevo, usuario)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tabla, registro_id, accion, campo, valor_anterior, valor_nuevo, usuario || 'system']
    );
  } catch (e) {
    console.error('audit_log error:', e.message);
  }
}

module.exports = { logAudit };
