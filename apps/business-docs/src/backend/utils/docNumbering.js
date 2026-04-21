'use strict';

const db = require('./db');

const DOC_TYPES = {
  cotizaciones: { prefix: 'COT', lockKey: 811001 },
  facturas:     { prefix: 'FAC', lockKey: 811002 },
  recibos:      { prefix: 'REC', lockKey: 811003 },
};

/**
 * Compute next correlative number without consuming it.
 * Race-safe lectures are the caller's responsibility — prefer allocateNextNumber for writes.
 */
async function peekNextNumber(table) {
  const cfg = DOC_TYPES[table];
  if (!cfg) throw new Error(`Unknown doc table: ${table}`);
  const { rows } = await db.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(numero FROM ${cfg.prefix.length + 2}) AS INTEGER)), 0) + 1 AS next
     FROM ${table} WHERE numero ~ $1`,
    [`^${cfg.prefix}-[0-9]+$`]
  );
  const seq = parseInt(rows[0].next, 10);
  return { seq, numero: `${cfg.prefix}-${String(seq).padStart(4, '0')}` };
}

/**
 * Allocate the next correlative number inside a transaction with an advisory lock so
 * concurrent requests don't collide. Runs `work(client, numero, seq)` inside the same tx.
 * Returns whatever `work` returns.
 */
async function allocateNextNumber(table, work) {
  const cfg = DOC_TYPES[table];
  if (!cfg) throw new Error(`Unknown doc table: ${table}`);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [cfg.lockKey]);
    const { rows } = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(numero FROM ${cfg.prefix.length + 2}) AS INTEGER)), 0) + 1 AS next
       FROM ${table} WHERE numero ~ $1`,
      [`^${cfg.prefix}-[0-9]+$`]
    );
    const seq = parseInt(rows[0].next, 10);
    const numero = `${cfg.prefix}-${String(seq).padStart(4, '0')}`;
    const result = await work(client, numero, seq);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { peekNextNumber, allocateNextNumber, DOC_TYPES };
