// Multi-entitas: perusahaan yang sedang dilihat, dipilih di bilah atas dan diingat per browser.
// Dikirim ke server sebagai header x-company; server hanya memakainya untuk menyaring tampilan.
const KEY = 'jejak_company';

export function getCompany() {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}

export function setCompany(name) {
  try {
    if (name) localStorage.setItem(KEY, name);
    else localStorage.removeItem(KEY);
  } catch { /* penyimpanan browser tidak tersedia */ }
}

// Keadaan multi-entitas untuk pengguna ini: aktif atau tidak, daftar perusahaan, dan perusahaan tetapnya
// (auditor, auditee, dan manajemen yang diberi perusahaan oleh System Admin).
export function companyMode(settings, user) {
  const on = Boolean(settings.multi_entity) && settings.companies.length > 0;
  const own = on && user && !['admin', 'infraadmin', 'superadmin'].includes(user.role) ? user.company || '' : '';
  const picked = on && !own && settings.companies.includes(getCompany()) ? getCompany() : '';
  return { on, list: settings.companies, own, view: own || picked };
}
