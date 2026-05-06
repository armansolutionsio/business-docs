// Tenant middleware: setea search_path por request en una conexión dedicada.
// Cada vertical lee/escribe en su schema. `public` queda como fallback común
// (templates AFIP, conversaciones legacy, etc.).

const db = require('./db');

const SCHEMA_BY_VERTICAL = {
  travel:    'public',
  tech:      'tech',
  paybridge: 'paybridge',
  admin:     'admin_core',
};

function tenantMiddleware(vertical) {
  const schema = SCHEMA_BY_VERTICAL[vertical];
  if (!schema) throw new Error(`Vertical desconocida: ${vertical}`);
  return async (req, res, next) => {
    req.vertical = vertical;
    req.schema = schema;
    req.tdb = {
      query: async (sql, params) => {
        // SET LOCAL solo persiste dentro de una transaccion. Sin BEGIN era no-op
        // y las queries caian al search_path por defecto (public) → leak de Travel.
        const client = await db.connect();
        try {
          await client.query('BEGIN');
          await client.query(`SET LOCAL search_path TO ${schema}`);
          const result = await client.query(sql, params);
          await client.query('COMMIT');
          return result;
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      },
      tx: async (fn) => {
        const client = await db.connect();
        try {
          await client.query('BEGIN');
          await client.query(`SET LOCAL search_path TO ${schema}`);
          const r = await fn(client);
          await client.query('COMMIT');
          return r;
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      },
    };
    next();
  };
}

module.exports = { tenantMiddleware, SCHEMA_BY_VERTICAL };
