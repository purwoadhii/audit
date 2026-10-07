// Aturan siapa melihat apa.
// - admin, auditor, manajemen: semua audit dan temuan.
// - auditee: hanya audit untuk unitnya, dan temuan yang ditugaskan kepadanya atau ke unitnya.

export function findingScope(user, alias = 'f', auditAlias = 'a', startIndex = 1) {
  if (user.role !== 'auditee') return { sql: 'TRUE', params: [] };
  return {
    sql: `(${alias}.owner_id = $${startIndex} OR ($${startIndex + 1}::text IS NOT NULL AND ${auditAlias}.unit = $${startIndex + 1}))`,
    params: [user.id, user.unit || null],
  };
}

export function auditScope(user, alias = 'a', startIndex = 1) {
  if (user.role !== 'auditee') return { sql: 'TRUE', params: [] };
  return {
    sql: `(($${startIndex + 1}::text IS NOT NULL AND ${alias}.unit = $${startIndex + 1})
           OR EXISTS (SELECT 1 FROM findings fx WHERE fx.audit_id = ${alias}.id AND fx.owner_id = $${startIndex}))`,
    params: [user.id, user.unit || null],
  };
}
