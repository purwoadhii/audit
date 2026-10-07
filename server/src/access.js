// Aturan siapa melihat apa.
// - admin, auditor, manajemen: semua audit dan temuan.
// - auditee: hanya audit untuk unitnya, dan temuan yang ditugaskan kepadanya atau ke unitnya.
// Setiap fungsi mengembalikan potongan SQL dengan placeholder ? dan nilainya, berurutan.

export function findingScope(user, f = 'f', a = 'a') {
  if (user.role !== 'auditee') return { sql: 'TRUE', params: [] };
  return {
    sql: `(${f}.owner_id = ? OR (? IS NOT NULL AND ${a}.unit = ?))`,
    params: [user.id, user.unit || null, user.unit || null],
  };
}

export function auditScope(user, a = 'a') {
  if (user.role !== 'auditee') return { sql: 'TRUE', params: [] };
  return {
    sql: `((? IS NOT NULL AND ${a}.unit = ?)
           OR EXISTS (SELECT 1 FROM findings fx WHERE fx.audit_id = ${a}.id AND fx.owner_id = ?))`,
    params: [user.unit || null, user.unit || null, user.id],
  };
}
