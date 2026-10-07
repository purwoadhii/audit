import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';
import { getSettings } from './settings.js';
import { HttpError, forbidden } from './errors.js';

export const COOKIE = 'jejak_session';

// Sesi disimpan di tabel sessions; cookie hanya membawa id sesi yang ditandatangani.
// Cookie tidak punya Max-Age, jadi selalu hilang saat browser ditutup.
// - Tanpa "Ingat saya": sesi berakhir setelah tidak aktif selama session_idle_minutes.
// - Dengan "Ingat saya": sesi bertahan selama browser terbuka, paling lama remember_max_days.
export async function issueSession(req, res, user, remember = false) {
  const s = await getSettings();
  const id = crypto.randomBytes(16).toString('hex');
  const ttlMs = remember ? s.remember_max_days * 86400000 : s.session_idle_minutes * 60000;
  await query(
    'INSERT INTO sessions (id, user_id, remember, ip, user_agent, expires_at) VALUES (?,?,?,?,?,?)',
    [id, user.id, Boolean(remember), req.ip || null, clientAgent(req), new Date(Date.now() + ttlMs)],
  );
  const token = jwt.sign({ sub: user.id, sid: id }, config.jwtSecret, { expiresIn: '30d' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, path: '/' });
}

export const clientAgent = (req) => String(req.headers['user-agent'] || '').slice(0, 255) || null;

export async function endSession(sid, reason) {
  await query('UPDATE sessions SET ended_at = CURRENT_TIMESTAMP(3), ended_reason = ? WHERE id = ? AND ended_at IS NULL', [reason, sid]);
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

export function readToken(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try { return jwt.verify(token, config.jwtSecret); } catch { return null; }
}

export async function requireAuth(req, _res, next) {
  try {
    const payload = readToken(req);
    if (!payload?.sid) throw new HttpError(401, req.cookies?.[COOKIE] ? 'Sesi berakhir. Silakan masuk lagi.' : 'Silakan masuk terlebih dahulu.');
    const { rows } = await query(
      `SELECT u.id, u.name, u.username, u.email, u.role, u.unit, u.active, u.work_role,
              s.id AS sid, s.remember, s.work_mode, s.expires_at, s.ended_at, s.last_seen_at
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND u.id = ?`,
      [payload.sid, payload.sub],
    );
    const row = rows[0];
    if (!row || row.ended_at || new Date(row.expires_at) < new Date()) throw new HttpError(401, 'Sesi berakhir. Silakan masuk lagi.');
    if (!row.active) {
      await endSession(row.sid, 'nonaktif');
      throw new HttpError(401, 'Akun tidak aktif.');
    }
    const s = await getSettings();
    if (s.maintenance && row.role !== 'infraadmin') throw new HttpError(503, s.maintenance_message);
    // Catat aktivitas paling sering sekali per menit. Sesi tanpa "Ingat saya" diperpanjang selama dipakai.
    if (Date.now() - new Date(row.last_seen_at).getTime() > 60000) {
      const extend = row.remember ? '' : ', expires_at = ?';
      const params = row.remember ? [row.sid] : [new Date(Date.now() + s.session_idle_minutes * 60000), row.sid];
      await query(`UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP(3)${extend} WHERE id = ?`, params);
    }
    const { sid, remember, work_mode, expires_at: _e, ended_at: _x, last_seen_at: _l, ...user } = row;
    // Mode kerja: akun admin bertindak sepenuhnya dengan peran kerjanya, tanpa hak admin.
    user.admin_role = isAdmin(user) ? user.role : null;
    if (!user.admin_role) user.work_role = null;
    user.mode = user.admin_role && user.work_role && Number(work_mode) ? 'kerja' : user.admin_role ? 'admin' : null;
    if (user.mode === 'kerja') user.role = user.work_role;
    req.user = user;
    req.sessionId = sid;
    next();
  } catch (err) {
    next(err);
  }
}

// Infra Admin berada di atas System Admin: setiap izin untuk admin juga berlaku untuknya.
export const requireRole = (...roles) => (req, _res, next) => {
  const ok = roles.includes(req.user.role) || (req.user.role === 'infraadmin' && roles.includes('admin'));
  if (!ok) return next(forbidden());
  next();
};

export const isAdmin = (user) => user.role === 'admin' || user.role === 'infraadmin';
export const canEditAudit = (user) => isAdmin(user) || user.role === 'auditor';
