// Aturan siapa melihat apa.
// - System Admin, Infra Admin dan Super User: semua audit dan temuan.
// - Auditor dan manajemen: semua audit dan temuan, kecuali System Admin mengaktifkan "Batasi audit per unit".
//   Saat aktif, yang punya unit hanya melihat audit untuk unitnya, audit yang ia pimpin atau ikuti sebagai anggota tim,
//   dan temuan di audit itu atau yang ditugaskan kepadanya. Yang tanpa unit tetap melihat semua.
// - auditee: hanya audit untuk unitnya, dan temuan yang ditugaskan kepadanya atau ke unitnya.
// - Penyetuju laporan selalu melihat audit yang harus ia setujui.
// Setiap fungsi mengembalikan potongan SQL dengan placeholder ? dan nilainya, berurutan.
// Unit dibandingkan tanpa spasi di awal dan akhir.

const unitOf = (user) => String(user.unit || '').trim() || null;

// Multi-entitas (bila diaktifkan System Admin):
// - Auditor, auditee, dan manajemen yang terikat perusahaan hanya melihat audit perusahaannya, kecuali audit yang
//   ia pimpin, ikuti, setujui, atau berisi temuan yang ditugaskan kepadanya.
// - Yang lain (termasuk admin dan Super User) melihat semua perusahaan, dan bisa memilih satu perusahaan di bilah atas.
//   Pilihan itu hanya menyaring tampilan.
export const ownCompany = (user) => (user.multi_entity && !['admin', 'infraadmin', 'superadmin'].includes(user.role)
  ? String(user.company || '').trim() || null : null);
export const viewCompany = (user) => (user.multi_entity ? ownCompany(user) || user.view_company || null : null);

function withCompany(scope, user, a) {
  const parts = [scope.sql];
  const params = [...scope.params];
  const own = ownCompany(user);
  if (own) {
    parts.push(`(${a}.company = ? OR ${a}.lead_id = ? OR ${a}.approver_id = ?
      OR EXISTS (SELECT 1 FROM audit_members cm WHERE cm.audit_id = ${a}.id AND cm.user_id = ?)
      OR EXISTS (SELECT 1 FROM findings cf WHERE cf.audit_id = ${a}.id AND cf.owner_id = ?))`);
    params.push(own, user.id, user.id, user.id, user.id);
  } else if (user.multi_entity && user.view_company) {
    parts.push(`${a}.company = ?`);
    params.push(user.view_company);
  }
  return parts.length === 1 ? scope : { sql: `(${parts.join(' AND ')})`, params };
}

// Saringan perusahaan untuk data tanpa audit (area audit, rencana tahunan).
export function companyFilter(user, col) {
  const c = viewCompany(user);
  return c ? { sql: `${col} = ?`, params: [c] } : { sql: 'TRUE', params: [] };
}

export const seesAllUnits = (user) => ['admin', 'infraadmin', 'superadmin'].includes(user.role)
  || (user.role !== 'auditee' && (!user.unit_scope || !unitOf(user)));

export const sameUnit = (user, unit) => String(unit || '').trim().toLowerCase() === String(unitOf(user) || '').toLowerCase();

export const auditScope = (user, a = 'a') => withCompany(unitAuditScope(user, a), user, a);

function unitAuditScope(user, a) {
  if (seesAllUnits(user)) return { sql: 'TRUE', params: [] };
  if (user.role === 'auditee') {
    return {
      sql: `((? IS NOT NULL AND TRIM(${a}.unit) = ?)
             OR EXISTS (SELECT 1 FROM findings fx WHERE fx.audit_id = ${a}.id AND fx.owner_id = ?)
             OR ${a}.approver_id = ?)`,
      params: [unitOf(user), unitOf(user), user.id, user.id],
    };
  }
  return {
    sql: `(TRIM(${a}.unit) = ? OR ${a}.lead_id = ? OR ${a}.approver_id = ?
           OR EXISTS (SELECT 1 FROM audit_members mx WHERE mx.audit_id = ${a}.id AND mx.user_id = ?))`,
    params: [unitOf(user), user.id, user.id, user.id],
  };
}

export const findingScope = (user, f = 'f', a = 'a') => withCompany(unitFindingScope(user, f, a), user, a);

function unitFindingScope(user, f, a) {
  if (seesAllUnits(user)) return { sql: 'TRUE', params: [] };
  if (user.role === 'auditee') {
    return {
      sql: `(${f}.owner_id = ? OR (? IS NOT NULL AND TRIM(${a}.unit) = ?))`,
      params: [user.id, unitOf(user), unitOf(user)],
    };
  }
  const s = unitAuditScope(user, a);
  return { sql: `(${f}.owner_id = ? OR ${s.sql})`, params: [user.id, ...s.params] };
}

// Penyetuju laporan: akun Manajemen (Manager), atau auditee di unit yang diaudit (Kepala unit).
// Dengan multi-entitas, penyetuju yang terikat perusahaan harus dari perusahaan audit itu.
export const canApproveFor = (user, unit, company = null) => (user.role === 'manajemen' || (user.role === 'auditee' && sameUnit(user, unit)))
  && (!company || !user.company || String(user.company).trim() === company);
