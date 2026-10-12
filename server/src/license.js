import crypto from 'node:crypto';
import { query } from './db.js';
import { getSettings } from './settings.js';
import { HttpError, badRequest } from './errors.js';

// Lisensi aplikasi. Kunci lisensi dibuat penyedia aplikasi dengan kunci privat (server/scripts/buat-lisensi.mjs)
// atau server/scripts/pembuat-lisensi.html) dan diperiksa di sini dengan kunci publik, jadi isi lisensi
// (pelanggan, paket, jumlah pengguna, masa berlaku) tidak bisa diubah tanpa kunci privat.
// Infra Admin memasang kunci lisensi di /infraAdmin/lisensi.
// Tanpa lisensi, aplikasi berjalan dalam masa uji coba TRIAL_DAYS hari sejak pertama dipasang, dengan fitur Pro.
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

// Paket lisensi dan fitur yang dibuka. Kunci lama tanpa paket dianggap Pro.
export const FEATURES = { ocr: 'OCR', ai: 'Asisten AI' };
export const EDITIONS = {
  standar: { label: 'Standar', features: [] },
  pro: { label: 'Pro', features: ['ocr', 'ai'] },
};
// Akun yang tidak dihitung dalam batas pengguna: semua Infra Admin dan satu System Admin.
export const FREE_ADMINS = 1;

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
  const edition = data.edition || 'pro';
  if (!EDITIONS[edition]) throw badRequest('Paket lisensi tidak dikenal.');
  return {
    id: data.id || null, customer: String(data.customer), edition, features: EDITIONS[edition].features,
    max_users: data.max_users, expires: data.expires || null, issued: data.issued || null,
  };
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

// Pengguna yang dihitung lisensi: akun aktif selain Infra Admin, dikurangi satu System Admin.
// Akun kembar admin (misalnya admin.user) dihitung karena dipakai sebagai pengguna biasa.
const counted = ({ work, admins }) => work + Math.max(0, admins - FREE_ADMINS);
async function userCounts() {
  const { rows } = await query("SELECT role, COUNT(*) AS n FROM users WHERE active AND role <> 'infraadmin' GROUP BY role");
  const c = { work: 0, admins: 0 };
  for (const x of rows) c[x.role === 'admin' ? 'admins' : 'work'] += Number(x.n);
  return c;
}
export async function countedUsers() {
  return counted(await userCounts());
}

// Status lisensi saat ini:
//   trial          masa uji coba, belum ada lisensi
//   trial_expired  masa uji coba habis
//   active         lisensi berlaku
//   expired        lisensi habis
//   invalid        kunci tersimpan tidak bisa dibaca
export async function licenseStatus({ withUsers = false } = {}) {
  const s = await getSettings();
  const out = { trial_days: TRIAL_DAYS, install_date: s.install_date || today(), free_admins: FREE_ADMINS };
  if (withUsers) {
    const c = await userCounts();
    Object.assign(out, { users_active: counted(c), users_work: c.work, users_admin: c.admins });
  }
  if (!s.license_key) {
    const end = new Date(Date.parse(`${out.install_date}T00:00:00Z`) + (TRIAL_DAYS - 1) * DAY).toISOString().slice(0, 10);
    const left = daysUntil(end);
    return { ...out, state: left > 0 ? 'trial' : 'trial_expired', expires: end, days_left: left, max_users: 0, customer: null, edition: 'pro', features: EDITIONS.pro.features };
  }
  try {
    const lic = parseLicense(s.license_key);
    const left = lic.expires ? daysUntil(lic.expires) : null;
    return { ...out, ...lic, state: left === 0 ? 'expired' : 'active', days_left: left };
  } catch (err) {
    return { ...out, state: 'invalid', error: err.message, max_users: 0, customer: null, expires: null, days_left: 0, edition: null, features: [] };
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

// Fitur paket Pro (OCR, Asisten AI). Masa uji coba membuka semua fitur.
export async function licenseFeatures() {
  const st = await cachedStatus();
  return licenseBlocks(st) ? [] : st.features || [];
}
export const hasFeature = async (f) => (await licenseFeatures()).includes(f);
export async function assertFeature(f) {
  if (await hasFeature(f)) return;
  throw new HttpError(403, '{feature} hanya tersedia di lisensi Pro. Hubungi Infra Admin untuk meningkatkan lisensi.', { feature: FEATURES[f] });
}

// Batas pengguna lisensi (0 berarti tanpa batas). Dipanggil sebelum akun menjadi aktif atau berganti peran:
// role = peran akun setelah perubahan, from = peran akun aktif sebelumnya (bila akun itu sudah aktif).
export async function assertUserSlot(role, from = null) {
  if (role === 'infraadmin') return;
  const st = await licenseStatus();
  if (!st.max_users) return;
  const c = await userCounts();
  const after = { ...c };
  const bump = (r, d) => { if (r && r !== 'infraadmin') after[r === 'admin' ? 'admins' : 'work'] += d; };
  bump(from, -1);
  bump(role, 1);
  // Perubahan yang tidak menambah hitungan selalu boleh, walaupun pemakaian sudah melewati batas.
  if (counted(after) <= st.max_users || counted(after) <= counted(c)) return;
  throw badRequest('Jumlah pengguna aktif sudah mencapai batas lisensi ({n} pengguna). Nonaktifkan pengguna lain atau minta Infra Admin memperbarui lisensi.', { n: st.max_users });
}
