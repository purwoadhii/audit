import { Router } from 'express';
import path from 'node:path';
import { BACKGROUNDS, brandingDir, mimeFor } from '../branding.js';
import bcrypt from 'bcryptjs';
import { checkSignature } from '../esign.js';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { loginSso, loadSso, startLogin, finishLogin } from '../sso.js';
import { assertUserSlot } from '../license.js';
import { query, logActivity } from '../db.js';
import { issueSession, clearSession, requireAuth, readToken, endSession, clientAgent, PORTALS, portalOf, portalForRole } from '../auth.js';
import { assertLicensed, licenseFeatures } from '../license.js';
import { APP_VERSION } from '../version.js';
import { HttpError, badRequest, oneOf, requireText } from '../errors.js';
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
  res.json({ ...(await publicSettings()), version: APP_VERSION });
});

// Gambar latar dibuka tanpa login: gambar login tampil di halaman login, dan keduanya hanya gambar hiasan.
for (const [kind, bg] of Object.entries(BACKGROUNDS)) {
  r.get(`/${kind}-background`, async (_req, res) => {
    const name = (await getSettings())[bg.key];
    if (!name) throw new HttpError(404, 'Belum ada gambar latar.');
    res.setHeader('Content-Type', mimeFor(name));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.join(brandingDir, name), (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Gambar tidak ditemukan.' });
    });
  });
}

// ---- Login SSO (OpenID Connect) untuk pintu pengguna ----
const SSO_COOKIE = 'jejak_sso';
const baseUrl = (req) => (process.env.APP_URL ? config.appUrl.replace(/\/+$/, '') : `${req.protocol}://${req.get('host')}`);
export const ssoRedirectUri = (req) => `${baseUrl(req)}/api/auth/sso/callback`;

r.get('/sso', async (_req, res) => res.json(await loginSso()));

r.get('/sso/start', async (req, res) => {
  try {
    const { url, flow } = await startLogin(ssoRedirectUri(req));
    const token = jwt.sign({ flow, remember: req.query.remember === '1' }, config.jwtSecret, { expiresIn: '10m' });
    // SameSite=Lax supaya cookie ikut saat penyedia SSO mengarahkan kembali ke aplikasi.
    res.cookie(SSO_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/api/auth/sso', maxAge: 10 * 60000 });
    res.redirect(url);
  } catch (err) {
    const q = new URLSearchParams({ sso_error: err.key || err.message });
    if (err.vars) q.set('sso_vars', JSON.stringify(err.vars));
    res.redirect(`/?${q}`);
  }
});

r.get('/sso/callback', async (req, res) => {
  let email = '';
  try {
    let saved = null;
    try { saved = jwt.verify(req.cookies?.[SSO_COOKIE] || '', config.jwtSecret); } catch { /* kedaluwarsa */ }
    res.clearCookie(SSO_COOKIE, { path: '/api/auth/sso' });
    if (req.query.error) throw new HttpError(400, 'Login SSO dibatalkan: {error}', { error: String(req.query.error_description || req.query.error).slice(0, 200) });
    const who = await finishLogin({ code: String(req.query.code || ''), state: String(req.query.state || ''), flow: saved?.flow, redirectUri: ssoRedirectUri(req) });
    email = who.email;
    let { rows: [user] } = await query('SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1', [email]);
    if (!user && who.config.auto_create) {
      // Akun baru dari SSO: peran bawaan dari pengaturan, kata sandi acak yang tidak dipakai.
      await assertUserSlot(who.config.default_role);
      const base = email.split('@')[0].replace(/[^a-z0-9._-]/g, '').slice(0, 40) || 'pengguna';
      let username = base;
      for (let i = 2; (await query('SELECT 1 FROM users WHERE username = ?', [username])).rowCount; i++) username = `${base}${i}`;
      const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
      const { insertId } = await query('INSERT INTO users (name, username, email, password_hash, role) VALUES (?,?,?,?,?)',
        [who.name, username, email, hash, who.config.default_role]);
      await logActivity({ query }, insertId, 'create', 'user', insertId, { title: who.name, email, via: 'sso' });
      ({ rows: [user] } = await query('SELECT * FROM users WHERE id = ?', [insertId]));
    }
    if (!user) {
      await recordLogin(req, email, null, false, 'akun_tidak_ada');
      throw new HttpError(401, 'Email {email} belum terdaftar di aplikasi. Minta System Admin membuatkan akun.', { email });
    }
    if (!user.active) {
      await recordLogin(req, email, user, false, 'akun_nonaktif');
      throw new HttpError(401, 'Akun {email} tidak aktif.', { email });
    }
    if (!PORTALS.user.roles.includes(user.role)) {
      await recordLogin(req, email, user, false, 'pintu_salah');
      throw new HttpError(403, 'Login SSO hanya untuk akun pengguna. Admin masuk dengan kata sandi.');
    }
    const settings = await getSettings();
    if (settings.maintenance) {
      await recordLogin(req, email, user, false, 'perbaikan');
      throw new HttpError(503, settings.maintenance_message);
    }
    await assertLicensed(user.role);
    await issueSession(req, res, user, Boolean(saved?.remember));
    await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [user.id]);
    await recordLogin(req, email, user, true, 'sso');
    res.redirect('/');
  } catch (err) {
    // Kunci pesan dan variabelnya dikirim terpisah supaya halaman login bisa menerjemahkannya.
    const known = err instanceof HttpError;
    if (!known) console.error('SSO:', err);
    const q = new URLSearchParams({ sso_error: known ? err.key : 'Login SSO gagal.' });
    if (known && err.vars) q.set('sso_vars', JSON.stringify(err.vars));
    res.redirect(`/?${q}`);
  }
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
  // Setiap akun hanya bisa masuk lewat pintunya sendiri.
  const portal = portalOf(req);
  if (portal === 'user' && (await loadSso()).enabled && (await loadSso()).password_login === false) {
    await recordLogin(req, login, user, false, 'sso_wajib');
    throw new HttpError(403, 'Masuk dengan tombol SSO perusahaan. Login dengan kata sandi dimatikan.');
  }
  if (!PORTALS[portal].roles.includes(user.role)) {
    await recordLogin(req, login, user, false, 'pintu_salah');
    const right = PORTALS[portalForRole(user.role)];
    throw right ? new HttpError(403, 'Akun ini masuk lewat {portal} di alamat {path}.', { portal: right.label, path: right.path }) : new HttpError(403, 'Akun ini tidak bisa masuk di sini.');
  }
  if (settings.maintenance && user.role !== 'infraadmin') {
    await recordLogin(req, login, user, false, 'perbaikan');
    throw new HttpError(503, settings.maintenance_message);
  }
  try {
    await assertLicensed(user.role);
  } catch (err) {
    await recordLogin(req, login, user, false, 'lisensi');
    throw err;
  }
  attempts.delete(key);
  await issueSession(req, res, user, Boolean(req.body?.remember));
  await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [user.id]);
  await recordLogin(req, login, user, true, null);
  res.json({ id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, unit: user.unit, language: user.language, features: await licenseFeatures() });
});

r.post('/logout', async (req, res) => {
  const payload = readToken(req);
  if (payload?.sid) await endSession(payload.sid, 'keluar');
  clearSession(req, res);
  res.json({ ok: true });
});

r.get('/me', requireAuth, async (req, res) => {
  const { id, name, username, email, role, unit, company, language } = req.user;
  res.json({ id, name, username, email, role, unit, company, language, features: await licenseFeatures() });
});

// Bahasa tampilan, disimpan per pengguna.
export const LANGUAGES = ['en', 'id', 'ms', 'zh', 'ja', 'ko'];
r.put('/language', requireAuth, async (req, res) => {
  const language = oneOf(req.body?.language, LANGUAGES, 'Bahasa');
  await query('UPDATE users SET language = ? WHERE id = ?', [language, req.user.id]);
  res.json({ language });
});

// Tanda tangan elektronik milik pengguna sendiri (gambar PNG/JPEG sebagai data URL).
r.get('/signature', requireAuth, async (req, res) => {
  const { rows: [u] } = await query('SELECT signature FROM users WHERE id = ?', [req.user.id]);
  res.json({ signature: u?.signature || null });
});
r.put('/signature', requireAuth, async (req, res) => {
  const signature = checkSignature(req.body?.signature);
  await query('UPDATE users SET signature = ? WHERE id = ?', [signature, req.user.id]);
  await logActivity({ query }, req.user.id, signature ? 'update' : 'delete', 'signature', req.user.id, { title: req.user.name });
  res.json({ signature });
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
