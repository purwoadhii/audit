import { query } from './db.js';
import { removeStored } from './storage.js';

// Menghapus file bukti yang tersimpan (lokal atau S3) sebelum barisnya ikut terhapus dari database.
// where memakai alias t untuk tabel attachments.
export async function removeFilesOf(where, params) {
  const { rows } = await query(`SELECT t.storage_name, t.storage, t.storage_dir FROM attachments t WHERE ${where}`, params);
  for (const f of rows) {
    if (f.storage_name) await removeStored(f.storage, f.storage_name, f.storage_dir).catch(() => {});
  }
}
