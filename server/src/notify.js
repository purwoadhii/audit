// Notifikasi di dalam aplikasi (ikon lonceng di halaman pengguna).
// text adalah kalimat bahasa Indonesia dengan {nama} sebagai isian; browser menerjemahkannya.
import { query } from './db.js';

// Mengirim satu notifikasi ke beberapa pengguna. Pelaku sendiri dan id kosong dilewati.
export async function notify(db, userIds, text, vars = {}, link = null, actorId = null) {
  const ids = [...new Set(userIds.filter((id) => id && id !== actorId))];
  for (const id of ids) {
    await db.query('INSERT INTO notifications (user_id, text, vars, link) VALUES (?,?,?,?)', [id, text, JSON.stringify(vars), link]);
  }
}

// Tim audit: ketua tim, anggota terdaftar, dan pembuat audit.
export async function auditTeam(db, auditId) {
  const { rows } = await db.query(
    `SELECT lead_id AS id FROM audits WHERE id = ? UNION SELECT created_by FROM audits WHERE id = ?
     UNION SELECT user_id FROM audit_members WHERE audit_id = ?`, [auditId, auditId, auditId]);
  return rows.map((r) => r.id).filter(Boolean);
}

export async function listNotifications(userId, limit = 30) {
  const { rows } = await query(
    `SELECT id, text, vars, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ${Number(limit)}`, [userId]);
  const { rows: [{ n }] } = await query('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [userId]);
  return {
    unread: Number(n),
    items: rows.map((r) => ({ ...r, vars: r.vars ? JSON.parse(r.vars) : {} })),
  };
}
