import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';
import { getSettings } from './settings.js';
import { HttpError, forbidden } from './errors.js';
import { assertLicensed } from './license.js';

// Tiga pintu masuk dengan sesi terpisah, jadi user, System Admin, dan Infra Admin bisa masuk
// bersamaan di browser yang sama tanpa saling menimpa:
//   user   alamat /            auditor, auditee, manajemen
//   sys    alamat /sysAdmin    System Admin: mengatur pengguna dan pengaturan aplikasi
//   infra  alamat /infraAdmin  Infra Admin: mengatur lisensi, akun admin, dan keamanan
// Browser mengirim pintu yang sedang dipakai lewat header x-portal.
export const PORTALS = {
  user: { cookie: 'jejak_session', roles: ['auditor', 'auditee', 'manajemen'], path: '/', label: 'halaman pengguna' },
  sys: { cookie: 'jejak_sys', roles: ['admin'], path: '/sysAdmin', label: 'System Admin' },
  infra: { cookie: 'jejak_infra', roles: ['infraadmin'], path: '/infraAdmin', label: 'Infra Admin' },
};
export const COOKIE = PORTALS.user.cookie;

export function portalOf(req) {
  const p = String(req.headers['x-portal'] || req.query?.portal || 'user');
  return PORTALS[p] ? p : 'user';
}

export const portalForRole = (role) => Object.keys(PORTALS).find((p) => PORTALS[p].roles.includes(role));

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
  res.cookie(PORTALS[portalOf(req)].cookie, token, { httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, path: '/' });
}

export const clientAgent = (req) => String(req.headers['user-agent'] || '').slice(0, 255) || null;

export async function endSession(sid, reason) {
  await query('UPDATE sessions SET ended_at = CURRENT_TIMESTAMP(3), ended_reason = ? WHERE id = ? AND ended_at IS NULL', [reason, sid]);
}

export function clearSession(req, res) {
  res.clearCookie(PORTALS[portalOf(req)].cookie, { path: '/' });
}

export function readToken(req) {
  const token = req.cookies?.[PORTALS[portalOf(req)].cookie];
  if (!token) return null;
  try { return jwt.verify(token, config.jwtSecret); } catch { return null; }
}

export async function requireAuth(req, _res, next) {
  try {
    const payload = readToken(req);
    const portal = portalOf(req);
    if (!payload?.sid) throw new HttpError(401, req.cookies?.[PORTALS[portal].cookie] ? 'Sesi berakhir. Silakan masuk lagi.' : 'Silakan masuk terlebih dahulu.');
    const { rows } = await query(
      `SELECT u.id, u.name, u.username, u.email, u.role, u.unit, u.active, u.language,
              s.id AS sid, s.remember, s.expires_at, s.ended_at, s.last_seen_at
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND u.id = ?`,
      [payload.sid, payload.sub],
    );
    const row = rows[0];
    if (!row || row.ended_at || new Date(row.expires_at) < new Date()) throw new HttpError(401, 'Sesi berakhir. Silakan masuk lagi.');
    // Sesi hanya berlaku di pintu masuk tempat ia dibuat, misalnya peran yang diubah tidak membawa hak lama.
    if (!PORTALS[portal].roles.includes(row.role)) throw new HttpError(401, 'Silakan masuk terlebih dahulu.');
    if (!row.active) {
      await endSession(row.sid, 'nonaktif');
      throw new HttpError(401, 'Akun tidak aktif.');
    }
    const s = await getSettings();
    if (s.maintenance && row.role !== 'infraadmin') throw Object.assign(new HttpError(503, s.maintenance_message), { maintenance: true });
    await assertLicensed(row.role);
    // Catat aktivitas paling sering sekali per menit. Sesi tanpa "Ingat saya" diperpanjang selama dipakai.
    if (Date.now() - new Date(row.last_seen_at).getTime() > 60000) {
      const extend = row.remember ? '' : ', expires_at = ?';
      const params = row.remember ? [row.sid] : [new Date(Date.now() + s.session_idle_minutes * 60000), row.sid];
      await query(`UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP(3)${extend} WHERE id = ?`, params);
    }
    const { sid, remember, expires_at: _e, ended_at: _x, last_seen_at: _l, ...user } = row;
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

// Akun yang diawasi (riwayat login, sesi, log aktivitas): System Admin mengawasi pengguna dan sesama admin,
// Infra Admin mengawasi admin dan sesama Infra Admin.
export const watchedRoles = (me) => (me.role === 'infraadmin' ? ['admin', 'infraadmin'] : ['admin', 'auditor', 'auditee', 'manajemen']);

export const isAdmin = (user) => user.role === 'admin' || user.role === 'infraadmin';
export const canEditAudit = (user) => isAdmin(user) || user.role === 'auditor';
