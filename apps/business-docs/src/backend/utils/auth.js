// JWT + bcrypt helpers + middlewares de autenticacion / autorizacion.
// El secreto vive en JWT_SECRET (env). Si no esta seteado, falla en boot.

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

if (!SECRET || SECRET === 'change-me-in-production-please-use-a-long-random-string') {
  console.warn('[auth] ATENCION: JWT_SECRET no seteado o usa valor por defecto. Configurar antes de exponer a produccion.');
}

const EFFECTIVE_SECRET = SECRET || 'dev-only-insecure-secret-change-me';

function signToken(user) {
  // user: { id, email, rol, verticales }
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      rol: user.rol,
      verticales: user.verticales || [],
    },
    EFFECTIVE_SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

function verifyToken(token) {
  return jwt.verify(token, EFFECTIVE_SECRET);
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

// ── Middleware: requiere JWT valido ─────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    const payload = verifyToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      rol: payload.rol,
      verticales: payload.verticales || [],
    };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalido o expirado' });
  }
}

// ── Middleware: requiere rol admin ──────────────────────────────────────
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  next();
}

// ── Factory: requiere acceso a una vertical ─────────────────────────────
// Uso: app.use('/api/tech', requireVertical('tech'), techRoutes)
function requireVertical(vertical) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (req.user.rol === 'admin') return next();
    const allowed = Array.isArray(req.user.verticales) ? req.user.verticales : [];
    if (!allowed.includes(vertical)) {
      return res.status(403).json({ error: `Sin acceso a vertical ${vertical}` });
    }
    next();
  };
}

module.exports = {
  signToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  requireAuth,
  requireAdmin,
  requireVertical,
};
