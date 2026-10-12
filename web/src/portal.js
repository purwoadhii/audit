// Tiga pintu masuk dengan halaman login dan sesi masing-masing:
//   user   /            auditor, auditee, manajemen
//   sys    /sysAdmin    System Admin
//   infra  /infraAdmin  Infra Admin
// Pintu ditentukan dari alamat saat halaman dibuka. Pindah pintu selalu lewat tautan biasa (muat ulang halaman).
const PORTALS = {
  user: { base: '', label: 'Pengguna', home: '/' },
  sys: { base: '/sysAdmin', label: 'System Admin', home: '/sysAdmin' },
  infra: { base: '/infraAdmin', label: 'Infra Admin', home: '/infraAdmin' },
};

function detect() {
  const p = window.location.pathname.toLowerCase();
  if (p === '/sysadmin' || p.startsWith('/sysadmin/')) return 'sys';
  if (p === '/infraadmin' || p.startsWith('/infraadmin/')) return 'infra';
  return 'user';
}

export const PORTAL = detect();
export const portalInfo = PORTALS[PORTAL];
