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
