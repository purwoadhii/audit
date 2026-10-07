import { Router } from 'express';
import path from 'node:path';
import { brandingDir, mimeFor } from '../branding.js';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { issueSession, clearSession, requireAuth, readToken, endSession, clientAgent } from '../auth.js';
import { HttpError, badRequest, requireText } from '../errors.js';
import { getSettings, publicSettings } from '../settings.js';

const r = Router();

// Batas percobaan login per username+IP agar password tidak bisa ditebak berulang-ulang.
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;

async function recordLogin(req, login, user, success, reason) {
  await query(
    'INSERT INTO login_history (user_id, login, success, reason, ip, user_agent) VALUES (?,?,?,?,?,?)',
    [user?.id ?? null, login.slice(0, 190), success, reason, req.ip || null, clientAgent(req)],
  );
}

// Nama aplikasi, teks login, tema, dan status perbaikan untuk halaman login (tanpa perlu masuk).
r.get('/settings', async (_req, res) => {
  res.json(await publicSettings());
});

// Gambar latar login dibuka tanpa login karena tampil di halaman login.
r.get('/login-background', async (_req, res) => {
  const name = (await getSettings()).login_background;
  if (!name) throw new HttpError(404, 'Belum ada gambar latar.');
  res.setHeader('Content-Type', mimeFor(name));
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.join(brandingDir, name), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Gambar tidak ditemukan.' });
  });
});

r.post('/login', async (req, res) => {
  // Pengguna boleh masuk dengan username atau email.
  const login = requireText(req.body?.username ?? req.body?.email, 'Username').toLowerCase();
  const password = requireText(req.body?.password, 'Password');
  const settings = await getSettings();
  const key = `${login}|${req.ip}`;
  const now = Date.now();
  const rec = attempts.get(key);
  if (rec && now - rec.first < WINDOW_MS && rec.count >= settings.max_login_attempts) {
    await recordLogin(req, login, null, false, 'terlalu_banyak');
    throw new HttpError(429, 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.');
  }
  const { rows } = await query('SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1', [login, login]);
  const user = rows[0];
  const passOk = user && (await bcrypt.compare(password, user.password_hash));
  if (!passOk || !user.active) {
    const cur = rec && now - rec.first < WINDOW_MS ? rec : { first: now, count: 0 };
    cur.count += 1;
    attempts.set(key, cur);
    await recordLogin(req, login, user, false, !user ? 'akun_tidak_ada' : !passOk ? 'password_salah' : 'akun_nonaktif');
    throw new HttpError(401, 'Username atau password salah.');
  }
  if (settings.maintenance && user.role !== 'infraadmin') {
    await recordLogin(req, login, user, false, 'perbaikan');
    throw new HttpError(503, settings.maintenance_message);
  }
  attempts.delete(key);
  await issueSession(req, res, user, Boolean(req.body?.remember));
  await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [user.id]);
  await recordLogin(req, login, user, true, null);
  res.json({ id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, unit: user.unit });
});

r.post('/logout', async (req, res) => {
  const payload = readToken(req);
  if (payload?.sid) await endSession(payload.sid, 'keluar');
  clearSession(res);
  res.json({ ok: true });
});

r.get('/me', requireAuth, (req, res) => {
  const { id, name, username, email, role, unit } = req.user;
  res.json({ id, name, username, email, role, unit });
});

// Riwayat login dan sesi aktif milik pengguna sendiri.
r.get('/my-logins', requireAuth, async (req, res) => {
  const { rows } = await query(
    'SELECT id, success, reason, ip, user_agent, created_at FROM login_history WHERE user_id = ? ORDER BY id DESC LIMIT 20',
    [req.user.id],
  );
  res.json(rows.map((x) => ({ ...x, success: Boolean(Number(x.success)) })));
});

r.post('/password', requireAuth, async (req, res) => {
  const current = requireText(req.body?.current, 'Kata sandi lama');
  const next = requireText(req.body?.next, 'Kata sandi baru');
  if (next.length < 8) throw badRequest('Kata sandi baru minimal 8 karakter.');
  const { rows } = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(current, rows[0].password_hash))) throw badRequest('Kata sandi lama salah.');
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(next, 10), req.user.id]);
  // Perangkat lain harus masuk ulang dengan kata sandi baru.
  await query(
    "UPDATE sessions SET ended_at = CURRENT_TIMESTAMP(3), ended_reason = 'ganti_password' WHERE user_id = ? AND id <> ? AND ended_at IS NULL",
    [req.user.id, req.sessionId],
  );
  res.json({ ok: true });
});

export default r;
