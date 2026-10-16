// Tiga pintu masuk dengan halaman login dan sesi masing-masing:
//   user   /            super user, auditor, auditee, manajemen
//   sys    /sysAdmin    System Admin
//   infra  /infraAdmin  Infra Admin
// Pintu ditentukan dari alamat saat halaman dibuka. Pindah pintu selalu lewat tautan biasa (muat ulang halaman).
import { N_ } from './i18n.jsx';

const PORTALS = {
  user: { base: '', label: N_('Pengguna'), home: '/' },
  sys: { base: '/sysAdmin', label: N_('System Admin'), home: '/sysAdmin' },
  infra: { base: '/infraAdmin', label: N_('Infra Admin'), home: '/infraAdmin' },
};

function detect() {
  const p = window.location.pathname.toLowerCase();
  if (p === '/sysadmin' || p.startsWith('/sysadmin/')) return 'sys';
  if (p === '/infraadmin' || p.startsWith('/infraadmin/')) return 'infra';
  return 'user';
}

export const PORTAL = detect();
export const portalInfo = PORTALS[PORTAL];
