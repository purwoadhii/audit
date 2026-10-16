// Tanda tangan elektronik laporan audit.
// Saat ketua tim mereview (meneruskan) dan saat penyetuju menyetujui, aplikasi mencatat:
// - gambar tanda tangan penanda tangan saat itu,
// - sidik isi laporan (SHA-256 dari data audit dan temuannya), dan
// - kode verifikasi (HMAC dengan JWT_SECRET) yang bisa dicek siapa saja di /verifikasi/<kode>.
// Bila isi laporan berubah sesudah ditandatangani, halaman verifikasi menunjukkan bahwa isinya sudah berbeda.
import crypto from 'node:crypto';
import { config } from './config.js';
import { query } from './db.js';
import { badRequest } from './errors.js';

export const SIGNED_ACTIONS = ['teruskan', 'setujui'];
const MAX_SIGNATURE = 300 * 1024;

// Gambar tanda tangan: data URL PNG atau JPEG, paling besar 300 KB.
export function checkSignature(value) {
  if (value === null || value === '') return null;
  const s = String(value);
  if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s)) throw badRequest('Tanda tangan harus berupa gambar PNG atau JPEG.');
  if (s.length > MAX_SIGNATURE) throw badRequest('Gambar tanda tangan terlalu besar (maksimal 300 KB).');
  return s;
}

// Sidik isi laporan: hanya bagian yang tampil di laporan, dengan urutan tetap.
export async function reportHash(db, auditId) {
  const { rows: [a] } = await db.query(
    'SELECT code, title, unit, type, scope, start_date, end_date, lead_id, approver_id FROM audits WHERE id = ?', [auditId]);
  const { rows: steps } = await db.query('SELECT text, result, note FROM audit_steps WHERE audit_id = ? ORDER BY position, id', [auditId]);
  const { rows: findings } = await db.query(
    `SELECT code, kind, title, risk, category, root_cause, \`condition\`, criteria, cause, effect, recommendation, response, due_date, owner_id
     FROM findings WHERE audit_id = ? ORDER BY code`, [auditId]);
  const body = JSON.stringify({ a, steps, findings });
  return crypto.createHash('sha256').update(body).digest('hex');
}

// Kode verifikasi 12 karakter (huruf besar dan angka, tanpa huruf yang mirip angka), dikelompokkan per 4.
function signCode(parts) {
  const mac = crypto.createHmac('sha256', `esign:${config.jwtSecret}`).update(parts.join('|')).digest();
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += alphabet[mac[i] % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}

// Menandatangani satu baris riwayat persetujuan yang baru dibuat.
export async function signApproval(db, approvalId, auditId, user) {
  const hash = await reportHash(db, auditId);
  const { rows: [u] } = await db.query('SELECT signature FROM users WHERE id = ?', [user.id]);
  const code = signCode([approvalId, auditId, user.id, hash, Date.now()]);
  await db.query('UPDATE audit_approvals SET signature = ?, content_hash = ?, sign_code = ? WHERE id = ?', [u?.signature || null, hash, code, approvalId]);
  return code;
}

// Data untuk halaman verifikasi publik. Hanya identitas laporan dan penanda tangan, bukan isi temuan.
export async function verify(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c)) return { valid: false };
  const { rows: [p] } = await query(
    `SELECT p.id, p.action, p.created_at, p.content_hash, p.signature, p.audit_id, a.code, a.title, a.unit, a.approval,
            u.name AS signer, u.role AS signer_role, u.unit AS signer_unit
     FROM audit_approvals p JOIN audits a ON a.id = p.audit_id LEFT JOIN users u ON u.id = p.user_id
     WHERE p.sign_code = ?`, [c]);
  if (!p) return { valid: false };
  const current = await reportHash({ query }, p.audit_id);
  // Persetujuan yang dibatalkan: laporan dikembalikan atau ditarik sesudah ditandatangani.
  const { rows: [later] } = await query(
    "SELECT action, created_at FROM audit_approvals WHERE audit_id = ? AND id > ? AND action IN ('kembalikan', 'tarik') ORDER BY id LIMIT 1", [p.audit_id, p.id]);
  return {
    valid: true,
    code: c,
    action: p.action,
    signed_at: p.created_at,
    signer: p.signer,
    signer_role: p.signer_role,
    signer_unit: p.signer_unit,
    has_signature: Boolean(p.signature),
    audit: { code: p.code, title: p.title, unit: p.unit },
    content_hash: p.content_hash,
    unchanged: current === p.content_hash,
    revoked: later ? { action: later.action, at: later.created_at } : null,
  };
}
