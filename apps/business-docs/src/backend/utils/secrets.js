// Cifrado simetrico (AES-256-GCM) para secretos guardados en la base, como las
// API keys de Redmine de TaskPilot. La clave sale de TASKPILOT_SECRET; si falta,
// se usa JWT_SECRET como respaldo con una advertencia en el log.
//
// Formato guardado: "v1:" + base64(iv[12] + tag[16] + cifrado).

const crypto = require('crypto');
const log = require('./logger');

const RAW = process.env.TASKPILOT_SECRET || process.env.JWT_SECRET || '';
if (!process.env.TASKPILOT_SECRET) {
  log.warn('taskpilot_secret_missing', { hint: 'configurar TASKPILOT_SECRET (32 bytes hex); se usa JWT_SECRET como respaldo' });
}
const KEY = crypto.createHash('sha256').update(RAW || 'dev-only-insecure-taskpilot-secret').digest();

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return 'v1:' + Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

function decrypt(stored) {
  if (!stored) return null;
  if (!String(stored).startsWith('v1:')) throw new Error('Formato de secreto desconocido');
  const buf = Buffer.from(String(stored).slice(3), 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
