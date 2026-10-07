export const AUDIT_STATUS = ['Perencanaan', 'Pelaksanaan', 'Pelaporan', 'Selesai'];
export const FINDING_STATUS = ['Terbuka', 'Dalam proses', 'Menunggu verifikasi', 'Selesai'];
export const AUDITEE_STATUS = ['Dalam proses', 'Menunggu verifikasi'];
export const RISKS = ['Tinggi', 'Sedang', 'Rendah'];
export const STEP_RESULTS = ['Belum diuji', 'Sesuai', 'Tidak sesuai', 'Tidak berlaku'];
export const AUDIT_TYPES = ['Keuangan', 'Operasional', 'Kepatuhan', 'Teknologi Informasi', 'Pengadaan', 'Investigasi'];
export const ROLES = {
  admin: 'Admin',
  auditor: 'Auditor',
  auditee: 'Auditee',
  manajemen: 'Manajemen',
};

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function fmtDate(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return `${Number(d)} ${BULAN[Number(m) - 1]} ${y}`;
}

export function fmtDateTime(s) {
  if (!s) return '—';
  const d = new Date(s);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

export function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const slug = (v) => String(v ?? '').replace(/\s+/g, '-');
export const canEdit = (user) => user?.role === 'admin' || user?.role === 'auditor';
