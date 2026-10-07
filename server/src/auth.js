import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';
import { HttpError, forbidden } from './errors.js';

export const COOKIE = 'jejak_session';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: MAX_AGE_MS / 1000 });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

export async function requireAuth(req, _res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) throw new HttpError(401, 'Silakan masuk terlebih dahulu.');
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new HttpError(401, 'Sesi berakhir. Silakan masuk lagi.');
    }
    const { rows } = await query('SELECT id, name, email, role, unit, active FROM users WHERE id = ?', [payload.sub]);
    if (!rows[0] || !rows[0].active) throw new HttpError(401, 'Akun tidak aktif.');
    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) return next(forbidden());
  next();
};

export const canEditAudit = (user) => user.role === 'admin' || user.role === 'auditor';
