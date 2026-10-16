import { query } from './db.js';
import { removeStored } from './storage.js';

// Kolom daftar file bukti (alias t untuk attachments, u untuk pengunggah). Hanya versi terbaru yang ditampilkan;
// versions adalah jumlah versi file itu.
export const ATTACHMENT_COLS = `t.id, t.filename, t.mime, t.size, t.text_status, t.created_at, t.uploaded_by, u.name AS uploaded_by_name,
  t.version, (SELECT COUNT(*) FROM attachments v WHERE COALESCE(v.root_id, v.id) = COALESCE(t.root_id, t.id)) AS versions`;

// Menghapus file bukti yang tersimpan (lokal atau S3) sebelum barisnya ikut terhapus dari database.
// where memakai alias t untuk tabel attachments.
export async function removeFilesOf(where, params) {
  const { rows } = await query(`SELECT t.storage_name, t.storage, t.storage_dir FROM attachments t WHERE ${where}`, params);
  for (const f of rows) {
    if (f.storage_name) await removeStored(f.storage, f.storage_name, f.storage_dir).catch(() => {});
  }
}
