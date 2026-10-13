// Aturan siapa melihat apa.
// - System Admin, Infra Admin dan Super Admin: semua audit dan temuan. Unit Super Admin tidak membatasi apa pun.
// - Auditor dan manajemen tanpa unit: semua audit dan temuan (misalnya tim audit internal pusat).
// - Auditor dan manajemen dengan unit: audit untuk unitnya, audit yang ia pimpin atau ikuti sebagai anggota tim,
//   dan temuan di audit itu atau yang ditugaskan kepadanya.
// - auditee: hanya audit untuk unitnya, dan temuan yang ditugaskan kepadanya atau ke unitnya.
// Setiap fungsi mengembalikan potongan SQL dengan placeholder ? dan nilainya, berurutan.
// Unit dibandingkan tanpa spasi di awal dan akhir.

const unitOf = (user) => String(user.unit || '').trim() || null;

export const seesAllUnits = (user) => ['admin', 'infraadmin', 'superadmin'].includes(user.role) || (user.role !== 'auditee' && !unitOf(user));

export const sameUnit = (user, unit) => String(unit || '').trim().toLowerCase() === String(unitOf(user) || '').toLowerCase();

export function auditScope(user, a = 'a') {
  if (seesAllUnits(user)) return { sql: 'TRUE', params: [] };
  if (user.role === 'auditee') {
    return {
      sql: `((? IS NOT NULL AND TRIM(${a}.unit) = ?)
             OR EXISTS (SELECT 1 FROM findings fx WHERE fx.audit_id = ${a}.id AND fx.owner_id = ?))`,
      params: [unitOf(user), unitOf(user), user.id],
    };
  }
  return {
    sql: `(TRIM(${a}.unit) = ? OR ${a}.lead_id = ?
           OR EXISTS (SELECT 1 FROM audit_members mx WHERE mx.audit_id = ${a}.id AND mx.user_id = ?))`,
    params: [unitOf(user), user.id, user.id],
  };
}

export function findingScope(user, f = 'f', a = 'a') {
  if (seesAllUnits(user)) return { sql: 'TRUE', params: [] };
  if (user.role === 'auditee') {
    return {
      sql: `(${f}.owner_id = ? OR (? IS NOT NULL AND TRIM(${a}.unit) = ?))`,
      params: [user.id, unitOf(user), unitOf(user)],
    };
  }
  const s = auditScope(user, a);
  return { sql: `(${f}.owner_id = ? OR ${s.sql})`, params: [user.id, ...s.params] };
}
