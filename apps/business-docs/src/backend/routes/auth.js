// Auth endpoints: login, me, change-password.
// Schema: admin_core.users. Hash con bcrypt. Token JWT.

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../utils/db');
const {
  signToken,
  verifyPassword,
  hashPassword,
  requireAuth,
} = require('../utils/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos, intenta en 15 minutos' },
});

// POST /api/auth/login { email, password }
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email y password son requeridos' });
    }
    const { rows } = await db.query(
      `SELECT id, email, nombre, password_hash, rol, verticales, activo
         FROM admin_core.users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );
    const user = rows[0];
    if (!user || !user.activo) {
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales invalidas' });

    await db.query(`UPDATE admin_core.users SET last_login = NOW() WHERE id = $1`, [user.id]);

    const token = signToken({
      id: user.id,
      email: user.email,
      rol: user.rol,
      verticales: user.verticales || [],
    });
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
        verticales: user.verticales || [],
      },
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, email, nombre, rol, verticales, activo, last_login, created_at
         FROM admin_core.users WHERE id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// POST /api/auth/change-password { currentPassword, newPassword }
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword y newPassword son requeridos' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'La nueva password debe tener al menos 8 caracteres' });
    }
    const { rows } = await db.query(
      `SELECT password_hash FROM admin_core.users WHERE id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const ok = await verifyPassword(currentPassword, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Password actual incorrecta' });

    const hash = await hashPassword(newPassword);
    await db.query(`UPDATE admin_core.users SET password_hash = $1 WHERE id = $2`, [hash, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
