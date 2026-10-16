import { N_ } from './i18n.jsx';
import { useSettings } from './settings.jsx';

// Menu aplikasi pengguna yang bisa dinyalakan atau dimatikan di System Admin → Pengaturan menu.
// Kuncinya sama dengan MENU_KEYS di server/src/constants.js. Menu yang dimatikan hanya disembunyikan:
// datanya tetap tersimpan dan muncul lagi saat menunya dinyalakan.
const STAFF = N_('Untuk Super User, auditor, dan manajemen');
export const MENUS = [
  { key: 'ringkasan', label: N_('Ringkasan'), icon: 'home' },
  { key: 'audit', label: N_('Audit'), icon: 'audit', note: N_('Halaman detail audit tetap bisa dibuka dari tautan di menu lain.') },
  { key: 'temuan', label: N_('Temuan'), icon: 'finding' },
  { key: 'tindak_lanjut', label: N_('Tindak Lanjut'), icon: 'board' },
  { key: 'perencanaan', label: N_('Perencanaan'), icon: 'plan', note: STAFF, children: [
    { key: 'perencanaan.rencana', label: N_('Rencana tahunan') },
    { key: 'perencanaan.risiko', label: N_('Penilaian risiko') },
    { key: 'perencanaan.universe', label: N_('Audit universe') },
  ] },
  { key: 'timesheet', label: N_('Timesheet'), icon: 'clock', note: STAFF, children: [
    { key: 'timesheet.jam', label: N_('Jam kerja') },
    { key: 'timesheet.realisasi', label: N_('Realisasi jam') },
  ] },
  { key: 'rekap', label: N_('Rekap'), icon: 'report', note: STAFF },
  { key: 'analitik', label: N_('Analitik'), icon: 'chart', note: STAFF },
  { key: 'asisten', label: N_('Asisten AI'), icon: 'ai', note: N_('Hanya lisensi Pro') },
  { key: 'ocr', label: N_('OCR'), icon: 'ocr', note: N_('Hanya lisensi Pro') },
  { key: 'aktivitas', label: N_('Aktivitas'), icon: 'activity', note: STAFF },
];

// Menu tampil bila menu itu dan menu induknya tidak disembunyikan.
// Menu yang punya sub-menu juga disembunyikan bila semua sub-menunya disembunyikan.
export function menuOn(hidden, key) {
  const off = new Set(hidden || []);
  const [parent] = key.split('.');
  if (off.has(parent) || off.has(key)) return false;
  const menu = MENUS.find((m) => m.key === key);
  return !menu?.children || menu.children.some((c) => !off.has(c.key));
}

export function useMenu() {
  const { settings } = useSettings();
  return (key) => menuOn(settings.hidden_menus, key);
}
