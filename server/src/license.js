import crypto from 'node:crypto';
import { query } from './db.js';
import { getSettings } from './settings.js';
import { HttpError, badRequest } from './errors.js';

// Lisensi aplikasi. Kunci lisensi dibuat penyedia aplikasi dengan kunci privat (server/scripts/buat-lisensi.mjs)
// dan diperiksa di sini dengan kunci publik, jadi isi lisensi (pelanggan, jumlah pengguna, masa berlaku)
// tidak bisa diubah tanpa kunci privat. Infra Admin memasang kunci lisensi di /infraAdmin/lisensi.
// Tanpa lisensi, aplikasi berjalan dalam masa uji coba TRIAL_DAYS hari sejak pertama dipasang.
let PUBLIC_KEY = crypto.createPublicKey(`-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAGrQWhC4N7+E7JffGUu18eEKiR1FmBgGdBa81kITUMcg=
-----END PUBLIC KEY-----`);
export const TRIAL_DAYS = 30;

// Hanya untuk tes otomatis (dipanggil dari dalam proses tes, tidak bisa lewat pengaturan atau env).
export function usePublicKeyForTests(key) {
  PUBLIC_KEY = key;
  cached = null;
}
const PREFIX = 'AM1';
let cached = null;
export const WORK_ROLES = ['auditor', 'auditee', 'manajemen'];

const b64 = (s) => Buffer.from(s, 'base64url');

// Membaca dan memeriksa tanda tangan kunci lisensi. Tidak memeriksa masa berlaku.
export function parseLicense(key) {
  const parts = String(key || '').trim().replace(/\s+/g, '').split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) throw badRequest('Format kunci lisensi tidak dikenal.');
  const body = b64(parts[1]);
  if (!crypto.verify(null, Buffer.from(`${PREFIX}.${parts[1]}`), PUBLIC_KEY, b64(parts[2]))) {
    throw badRequest('Kunci lisensi tidak sah atau sudah diubah.');
  }
  let data;
  try { data = JSON.parse(body.toString('utf8')); } catch { throw badRequest('Isi kunci lisensi rusak.'); }
  if (!data.customer || !Number.isInteger(data.max_users) || data.max_users < 0) throw badRequest('Isi kunci lisensi tidak lengkap.');
  if (data.expires && !/^\d{4}-\d{2}-\d{2}$/.test(data.expires)) throw badRequest('Tanggal berakhir lisensi tidak valid.');
  return { id: data.id || null, customer: String(data.customer), max_users: data.max_users, expires: data.expires || null, issued: data.issued || null };
}

// Dipakai skrip pembuat lisensi.
export function signLicense(data, privateKey) {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = crypto.sign(null, Buffer.from(`${PREFIX}.${body}`), privateKey).toString('base64url');
  return `${PREFIX}.${body}.${sig}`;
}

const DAY = 86400000;
const today = () => new Date().toISOString().slice(0, 10);
// Sisa hari termasuk hari ini; 0 berarti sudah lewat.
const daysUntil = (date) => Math.max(0, Math.floor((Date.parse(`${date}T23:59:59.999Z`) - Date.now()) / DAY) + 1);

export async function activeWorkUsers() {
  const { rows } = await query(`SELECT COUNT(*) AS n FROM users WHERE active AND role IN (${WORK_ROLES.map(() => '?').join(',')})`, WORK_ROLES);
  return Number(rows[0].n);
}

// Status lisensi saat ini:
//   trial          masa uji coba, belum ada lisensi
//   trial_expired  masa uji coba habis
//   active         lisensi berlaku
//   expired        lisensi habis
//   invalid        kunci tersimpan tidak bisa dibaca
export async function licenseStatus({ withUsers = false } = {}) {
  const s = await getSettings();
  const out = { trial_days: TRIAL_DAYS, install_date: s.install_date || today() };
  if (withUsers) out.users_active = await activeWorkUsers();
  if (!s.license_key) {
    const end = new Date(Date.parse(`${out.install_date}T00:00:00Z`) + (TRIAL_DAYS - 1) * DAY).toISOString().slice(0, 10);
    const left = daysUntil(end);
    return { ...out, state: left > 0 ? 'trial' : 'trial_expired', expires: end, days_left: left, max_users: 0, customer: null };
  }
  try {
    const lic = parseLicense(s.license_key);
    const left = lic.expires ? daysUntil(lic.expires) : null;
    return { ...out, ...lic, state: left === 0 ? 'expired' : 'active', days_left: left };
  } catch (err) {
    return { ...out, state: 'invalid', error: err.message, max_users: 0, customer: null, expires: null, days_left: 0 };
  }
}

export const licenseBlocks = (st) => ['trial_expired', 'expired', 'invalid'].includes(st.state);

// Status disimpan sebentar supaya setiap permintaan tidak membaca ulang lisensi.
export const clearLicenseCache = () => { cached = null; };
async function cachedStatus() {
  if (!cached || Date.now() - cached.at > 60000) cached = { at: Date.now(), st: await licenseStatus() };
  return cached.st;
}

// Infra Admin selalu bisa masuk supaya bisa memasang lisensi baru.
export async function assertLicensed(role) {
  if (role === 'infraadmin') return;
  const st = await cachedStatus();
  if (!licenseBlocks(st)) return;
  const msg = st.state === 'trial_expired'
    ? 'Masa uji coba aplikasi sudah habis. Hubungi Infra Admin untuk memasang lisensi.'
    : 'Lisensi aplikasi sudah tidak berlaku. Hubungi Infra Admin untuk memperbarui lisensi.';
  throw Object.assign(new HttpError(403, msg), { license: true });
}

// Pengguna aktif (auditor, auditee, manajemen) tidak boleh melebihi batas lisensi. 0 berarti tanpa batas.
export async function assertUserSlot() {
  const st = await licenseStatus();
  if (!st.max_users) return;
  const n = await activeWorkUsers();
  if (n >= st.max_users) throw badRequest(`Jumlah pengguna aktif sudah mencapai batas lisensi (${st.max_users} pengguna). Nonaktifkan pengguna lain atau minta Infra Admin memperbarui lisensi.`);
}
