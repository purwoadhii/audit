import { query } from './db.js';
import { badRequest } from './errors.js';
import { AUDIT_TYPES } from './constants.js';

// Tema warna yang bisa dipilih. Pasangan warna sudah diuji kontrasnya dengan teks putih.
export const THEMES = ['teal', 'biru', 'hijau', 'ungu', 'merah', 'oranye'];

// Setiap pengaturan: nilai bawaan, siapa yang boleh mengubah, dan cara memeriksanya.
const text = (max) => (v, label) => {
  if (typeof v !== 'string' || !v.trim()) throw badRequest(`${label} wajib diisi.`);
  if (v.trim().length > max) throw badRequest(`${label} maksimal ${max} karakter.`);
  return v.trim();
};
const optText = (max) => (v, label) => {
  const s = String(v ?? '').trim();
  if (s.length > max) throw badRequest(`${label} maksimal ${max} karakter.`);
  return s;
};
const list = (v, label) => {
  if (!Array.isArray(v)) throw badRequest(`${label} harus berupa daftar.`);
  const out = [...new Set(v.map((x) => String(x ?? '').trim()).filter(Boolean))];
  if (out.some((x) => x.length > 150)) throw badRequest(`Isi ${label} maksimal 150 karakter.`);
  if (out.length > 200) throw badRequest(`${label} maksimal 200 baris.`);
  return out;
};
const int = (min, max) => (v, label) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${label} harus angka ${min} sampai ${max}.`);
  return n;
};
const bool = (v) => Boolean(v);
const oneOf = (opts) => (v, label) => {
  if (!opts.includes(v)) throw badRequest(`${label} tidak valid.`);
  return v;
};

export const SETTINGS = {
  // Tampilan (System Admin)
  app_name: { def: 'Audit Management', who: 'admin', label: 'Nama aplikasi', check: text(60), pub: true },
  app_tagline: { def: 'Manajemen audit internal', who: 'admin', label: 'Keterangan aplikasi', check: optText(80), pub: true },
  theme: { def: 'teal', who: 'admin', label: 'Tema warna', check: oneOf(THEMES), pub: true },
  login_title: { def: 'Selamat datang', who: 'admin', label: 'Judul login', check: text(60), pub: true },
  login_subtitle: { def: 'Masukkan username dan password akun Anda.', who: 'admin', label: 'Keterangan login', check: optText(160), pub: true },
  login_hero_title: { def: 'Audit lebih rapi, temuan lebih terkendali', who: 'admin', label: 'Judul panel kiri', check: optText(80), pub: true },
  login_hero_text: { def: 'Rencanakan audit, kelola kertas kerja, catat temuan, dan pantau tindak lanjut dalam satu tempat.', who: 'admin', label: 'Teks panel kiri', check: optText(200), pub: true },
  forgot_password_text: { def: 'Hubungi admin aplikasi untuk mengatur ulang password Anda.', who: 'admin', label: 'Pesan lupa password', check: optText(200), pub: true },
  // Gambar latar login: nama file di folder branding. Diatur lewat endpoint unggah, bukan PATCH.
  login_background: { def: '', who: 'internal', label: 'Gambar latar login', check: optText(100) },
  // Data master (System Admin)
  units: { def: [], who: 'admin', label: 'Daftar unit', check: list },
  audit_types: { def: AUDIT_TYPES, who: 'admin', label: 'Jenis audit', check: list },
  // Keamanan login (System Admin)
  session_idle_minutes: { def: 120, who: 'admin', label: 'Batas tidak aktif', check: int(5, 1440) },
  remember_max_days: { def: 7, who: 'admin', label: 'Batas Ingat saya', check: int(1, 30) },
  // Teknis (Infra Admin)
  max_login_attempts: { def: 10, who: 'infraadmin', label: 'Batas percobaan login', check: int(3, 100) },
  maintenance: { def: false, who: 'infraadmin', label: 'Mode perbaikan', check: bool, pub: true },
  maintenance_message: { def: 'Aplikasi sedang dalam perbaikan. Silakan coba beberapa saat lagi.', who: 'infraadmin', label: 'Pesan perbaikan', check: optText(200), pub: true },
};

let cache = null;

export async function getSettings() {
  if (cache) return cache;
  const { rows } = await query('SELECT k, v FROM settings');
  const out = {};
  for (const [k, s] of Object.entries(SETTINGS)) out[k] = structuredClone(s.def);
  for (const r of rows) {
    if (!(r.k in SETTINGS)) continue;
    try { out[r.k] = JSON.parse(r.v); } catch { /* nilai rusak, pakai bawaan */ }
  }
  cache = out;
  return out;
}

export const clearSettingsCache = () => { cache = null; };

export async function publicSettings() {
  const all = await getSettings();
  const out = Object.fromEntries(Object.entries(SETTINGS).filter(([, s]) => s.pub).map(([k]) => [k, all[k]]));
  // Nama file berubah setiap unggah, jadi bisa dipakai sebagai penanda versi untuk cache browser.
  out.login_background_url = all.login_background ? `/api/auth/login-background?v=${encodeURIComponent(all.login_background)}` : '';
  return out;
}

// Menyimpan pengaturan internal tanpa pemeriksaan hak (dipanggil dari route yang sudah memeriksa).
export async function saveInternal(user, k, v) {
  await query(
    'INSERT INTO settings (k, v, updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE v = VALUES(v), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP(3)',
    [k, JSON.stringify(v), user.id],
  );
  clearSettingsCache();
}

// Memeriksa dan menyimpan perubahan. Kunci yang tidak dikenal atau di luar hak peran ditolak.
export async function saveSettings(user, body) {
  const changes = {};
  for (const [k, v] of Object.entries(body || {})) {
    const s = SETTINGS[k];
    if (!s || s.who === 'internal') throw badRequest(`Pengaturan ${k} tidak dikenal.`);
    if (s.who === 'infraadmin' && user.role !== 'infraadmin') throw badRequest(`${s.label} hanya bisa diubah Infra Admin.`);
    changes[k] = s.check(v, s.label);
  }
  if (!Object.keys(changes).length) throw badRequest('Tidak ada perubahan.');
  for (const [k, v] of Object.entries(changes)) {
    await query(
      'INSERT INTO settings (k, v, updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE v = VALUES(v), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP(3)',
      [k, JSON.stringify(v), user.id],
    );
  }
  clearSettingsCache();
  return changes;
}
