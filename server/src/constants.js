import { N_ } from './errors.js';

export const ROLES = ['infraadmin', 'admin', 'superadmin', 'auditor', 'auditee', 'manajemen'];
export const AUDIT_STATUS = ['Perencanaan', 'Pelaksanaan', 'Pelaporan', 'Selesai'];
export const FINDING_STATUS = ['Terbuka', 'Dalam proses', 'Menunggu verifikasi', 'Selesai'];
// Jenis catatan audit: temuan atau isu.
export const FINDING_KINDS = ['temuan', 'isu'];
export const RISKS = ['Tinggi', 'Sedang', 'Rendah'];
export const STEP_RESULTS = ['Belum diuji', 'Sesuai', 'Tidak sesuai', 'Tidak berlaku'];
// Jenis audit bawaan; ditandai N_ supaya ikut diterjemahkan selama admin belum mengubahnya.
export const AUDIT_TYPES = [N_('Keuangan'), N_('Operasional'), N_('Kepatuhan'), N_('Teknologi Informasi'), N_('Pengadaan'), N_('Investigasi')];
// Status yang boleh dipilih auditee saat menindaklanjuti temuan.
export const AUDITEE_STATUS = ['Dalam proses', 'Menunggu verifikasi'];
// Pilihan bawaan kategori temuan dan kategori akar masalah; admin bisa mengubahnya.
export const FINDING_CATEGORIES = [N_('Kepatuhan'), N_('Pengendalian internal'), N_('Keuangan'), N_('Operasional'), N_('Teknologi Informasi'), N_('Tata kelola')];
export const ROOT_CAUSES = [N_('Manusia'), N_('Proses atau prosedur'), N_('Sistem atau teknologi'), N_('Kebijakan'), N_('Pihak eksternal')];

// Perencanaan berbasis risiko. Jenis area di audit universe bisa diubah admin di Data master.
export const UNIVERSE_KINDS = [N_('Proses bisnis'), N_('Sistem informasi'), N_('Vendor'), N_('Lokasi'), N_('Unit organisasi')];
// Matriks risiko 5×5: skor = kemungkinan × dampak.
// Tingkat: 1-4 Rendah, 5-9 Sedang, 10-16 Tinggi, 20-25 Sangat tinggi.
// Siklus audit yang disarankan: Sangat tinggi dan Tinggi setiap tahun, Sedang setiap 2 tahun, Rendah setiap 3 tahun.
export function riskLevel(score) {
  if (score >= 20) return 'Sangat tinggi';
  if (score >= 10) return 'Tinggi';
  if (score >= 5) return 'Sedang';
  return 'Rendah';
}
export const AUDIT_CYCLE = { 'Sangat tinggi': 1, Tinggi: 1, Sedang: 2, Rendah: 3 };
