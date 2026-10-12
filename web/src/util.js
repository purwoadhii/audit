import { N_, t, localeTag, currentLang } from './i18n.jsx';

// Nilai status dan risiko disimpan dalam bahasa Indonesia di database. Tampilkan dengan t(nilai).
export const AUDIT_STATUS = [N_('Perencanaan'), N_('Pelaksanaan'), N_('Pelaporan'), N_('Selesai')];
export const FINDING_STATUS = [N_('Terbuka'), N_('Dalam proses'), N_('Menunggu verifikasi'), N_('Selesai')];
export const AUDITEE_STATUS = ['Dalam proses', 'Menunggu verifikasi'];
export const RISKS = [N_('Tinggi'), N_('Sedang'), N_('Rendah')];
export const STEP_RESULTS = [N_('Belum diuji'), N_('Sesuai'), N_('Tidak sesuai'), N_('Tidak berlaku')];

// Label diterjemahkan saat dibaca, jadi ROLES[x] dan Object.entries(ROLES) selalu dalam bahasa pengguna.
const translated = (o) => new Proxy(o, { get: (obj, k) => (typeof obj[k] === 'string' ? t(obj[k]) : obj[k]) });
export const ROLES = translated({
  infraadmin: N_('Infra Admin'),
  admin: N_('System Admin'),
  auditor: N_('Auditor'),
  auditee: N_('Auditee'),
  manajemen: N_('Manajemen'),
});

export function fmtDate(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat(localeTag(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, d));
}

export function fmtDateTime(s) {
  if (!s) return '—';
  const d = new Date(s);
  const pad = (n) => String(n).padStart(2, '0');
  const sep = currentLang() === 'id' ? '.' : ':';
  return `${new Intl.DateTimeFormat(localeTag(), { day: 'numeric', month: 'short', year: 'numeric' }).format(d)}, ${pad(d.getHours())}${sep}${pad(d.getMinutes())}`;
}

// Anggota tim untuk ditampilkan: pengguna terdaftar lalu anggota eksternal.
export function teamText(a) {
  const names = [...(a.members || []).map((m) => m.name), ...(a.team ? [a.team] : [])];
  return names.length ? names.join(', ') : '—';
}

export function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const slug = (v) => String(v ?? '').replace(/\s+/g, '-');
export const isAdmin = (user) => user?.role === 'admin' || user?.role === 'infraadmin';
export const canEdit = (user) => isAdmin(user) || user?.role === 'auditor';

// Ringkas user agent menjadi "Chrome · Windows" untuk riwayat login dan sesi.
export function device(ua) {
  if (!ua) return '—';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : t('Lainnya');
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

export const LOGIN_REASON = translated({
  password_salah: N_('Password salah'),
  akun_tidak_ada: N_('Akun tidak ditemukan'),
  akun_nonaktif: N_('Akun nonaktif'),
  terlalu_banyak: N_('Terlalu banyak percobaan'),
  perbaikan: N_('Mode perbaikan'),
  pintu_salah: N_('Salah pintu masuk'),
  lisensi: N_('Lisensi tidak berlaku'),
});
