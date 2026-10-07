import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { issueSession, clearSession, requireAuth } from '../auth.js';
import { HttpError, badRequest, requireText } from '../errors.js';

const r = Router();

// Batas percobaan login sederhana per email+IP agar tidak bisa ditebak berulang-ulang.
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

r.post('/login', async (req, res) => {
  // Pengguna boleh masuk dengan username atau email.
  const login = requireText(req.body?.username ?? req.body?.email, 'Username').toLowerCase();
  const password = requireText(req.body?.password, 'Password');
  const key = `${login}|${req.ip}`;
  const now = Date.now();
  const rec = attempts.get(key);
  if (rec && now - rec.first < WINDOW_MS && rec.count >= MAX_ATTEMPTS) {
    throw new HttpError(429, 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.');
  }
  const { rows } = await query('SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1', [login, login]);
  const user = rows[0];
  const ok = user && user.active && (await bcrypt.compare(password, user.password_hash));
  if (!ok) {
    const cur = rec && now - rec.first < WINDOW_MS ? rec : { first: now, count: 0 };
    cur.count += 1;
    attempts.set(key, cur);
    throw new HttpError(401, 'Username atau password salah.');
  }
  attempts.delete(key);
  issueSession(res, user, Boolean(req.body?.remember));
  res.json({ id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, unit: user.unit });
});

r.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

r.get('/me', requireAuth, (req, res) => {
  const { id, name, username, email, role, unit } = req.user;
  res.json({ id, name, username, email, role, unit });
});

r.post('/password', requireAuth, async (req, res) => {
  const current = requireText(req.body?.current, 'Kata sandi lama');
  const next = requireText(req.body?.next, 'Kata sandi baru');
  if (next.length < 8) throw badRequest('Kata sandi baru minimal 8 karakter.');
  const { rows } = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(current, rows[0].password_hash))) throw badRequest('Kata sandi lama salah.');
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(next, 10), req.user.id]);
  res.json({ ok: true });
});

export default r;
