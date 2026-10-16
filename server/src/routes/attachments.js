import { Router } from 'express';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import { query, logActivity } from '../db.js';
import { config } from '../config.js';
import { canEditAudit } from '../auth.js';
import { badRequest, notFound, forbidden, intId } from '../errors.js';
import { loadFinding } from './findings.js';
import { loadAudit } from './audits.js';
import { storeUpload, openStored, removeStored } from '../storage.js';
import { ATTACHMENT_COLS, removeFilesOf } from '../files.js';
import { queueExtraction } from '../extract.js';

fs.mkdirSync(config.uploadDir, { recursive: true });

const ALLOWED = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain|text\/csv|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel|vnd\.ms-powerpoint|zip))$/;

const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (_req, _file, cb) => cb(null, crypto.randomUUID()),
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.test(file.mimetype)) return cb(badRequest('Jenis file tidak didukung. Gunakan PDF, gambar, Word, Excel, PowerPoint, CSV, atau ZIP.'));
    cb(null, true);
  },
});

function runUpload(req, res) {
  return new Promise((resolve, reject) => {
    upload.single('file')(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') return reject(badRequest('Ukuran file maksimal {n} MB.', { n: config.maxUploadMb }));
      if (err) return reject(err);
      if (!req.file) return reject(badRequest('Pilih file yang akan diunggah.'));
      resolve(req.file);
    });
  });
}

// prev: versi sebelumnya bila file ini diunggah sebagai versi baru.
async function saveRecord(req, file, auditId, findingId, prev = null) {
  // multer membaca nama asli sebagai latin1; ubah ke UTF-8 agar nama berbahasa apa pun tampil benar.
  const filename = Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 200);
  const { storage, dir } = await storeUpload(file);
  file.storage = storage;
  file.storageDir = dir;
  const { insertId } = await query(
    `INSERT INTO attachments (audit_id, finding_id, filename, mime, size, storage_name, storage, storage_dir, uploaded_by, version, root_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [auditId, findingId, filename, file.mimetype, file.size, file.filename, storage, dir, req.user.id,
      prev ? prev.version + 1 : 1, prev ? prev.root_id || prev.id : null]);
  if (prev) await query('UPDATE attachments SET superseded_by = ? WHERE id = ?', [insertId, prev.id]);
  const { rows } = await query(`SELECT ${ATTACHMENT_COLS} FROM attachments t LEFT JOIN users u ON u.id = t.uploaded_by WHERE t.id = ?`, [insertId]);
  // Teks dan OCR dibaca di belakang layar supaya isi file bisa dicari.
  queueExtraction(insertId);
  await logActivity({ query }, req.user.id, 'upload', 'attachment', insertId, { filename, auditId, findingId, ...(prev && { version: prev.version + 1, previous: prev.filename }) });
  return rows[0];
}

const removeFile = (name, storage = 'local', dir = null) => removeStored(storage, name, dir);

export const findingUploads = Router({ mergeParams: true });
findingUploads.post('/', async (req, res) => {
  const finding = await loadFinding(req.user, intId(req.params.id));
  if (req.user.role === 'manajemen') throw forbidden();
  const file = await runUpload(req, res);
  try {
    res.status(201).json(await saveRecord(req, file, finding.audit_id, finding.id));
  } catch (err) {
    await removeFile(file.filename, file.storage, file.storageDir);
    throw err;
  }
});

export const auditUploads = Router({ mergeParams: true });
auditUploads.post('/', async (req, res) => {
  if (!canEditAudit(req.user)) throw forbidden();
  const audit = await loadAudit(req.user, intId(req.params.id));
  const file = await runUpload(req, res);
  try {
    res.status(201).json(await saveRecord(req, file, audit.id, null));
  } catch (err) {
    await removeFile(file.filename, file.storage, file.storageDir);
    throw err;
  }
});

const r = Router();

async function loadAttachment(user, id) {
  const { rows } = await query('SELECT * FROM attachments WHERE id = ?', [id]);
  const att = rows[0];
  if (!att) throw notFound('File tidak ditemukan.');
  // Periksa hak akses melalui temuan atau audit induknya.
  if (att.finding_id) await loadFinding(user, att.finding_id);
  else if (user.role === 'auditee') throw notFound('File tidak ditemukan.');
  else await loadAudit(user, att.audit_id);
  return att;
}

// Yang boleh mengunggah ke tempat file ini berada: tim audit untuk kertas kerja, atau siapa pun selain manajemen untuk bukti temuan.
function assertCanUpload(user, att) {
  if (att.finding_id ? user.role === 'manajemen' : !canEditAudit(user)) throw forbidden();
}

const chainOf = (att) => att.root_id || att.id;

// Semua versi satu file, terbaru dulu.
r.get('/:id/versions', async (req, res) => {
  const att = await loadAttachment(req.user, intId(req.params.id));
  const { rows } = await query(
    `SELECT ${ATTACHMENT_COLS} FROM attachments t LEFT JOIN users u ON u.id = t.uploaded_by
     WHERE COALESCE(t.root_id, t.id) = ? ORDER BY t.version DESC`, [chainOf(att)]);
  res.json(rows);
});

// Mengunggah versi baru. Versi lama tetap tersimpan dan bisa diunduh dari riwayat versi.
r.post('/:id/versions', async (req, res) => {
  const att = await loadAttachment(req.user, intId(req.params.id));
  assertCanUpload(req.user, att);
  if (att.superseded_by) throw badRequest('Versi baru hanya bisa diunggah dari versi terbaru.');
  const file = await runUpload(req, res);
  try {
    res.status(201).json(await saveRecord(req, file, att.audit_id, att.finding_id, att));
  } catch (err) {
    await removeFile(file.filename, file.storage, file.storageDir);
    throw err;
  }
});

// Teks hasil pembacaan file (termasuk OCR).
r.get('/:id/text', async (req, res) => {
  const att = await loadAttachment(req.user, intId(req.params.id));
  const { rows } = await query('SELECT text_status, text_content FROM attachments WHERE id = ?', [att.id]);
  res.json({ id: att.id, filename: att.filename, status: rows[0].text_status, text: rows[0].text_content || '' });
});

r.get('/:id', async (req, res) => {
  const att = await loadAttachment(req.user, intId(req.params.id));
  const stream = await openStored(att);
  if (!stream) throw notFound('File sudah tidak tersedia di penyimpanan.');
  const inline = /^(image\/|application\/pdf$)/.test(att.mime) && req.query.download !== '1';
  res.setHeader('Content-Type', att.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(att.filename)}`);
  stream.pipe(res);
});

r.delete('/:id', async (req, res) => {
  const att = await loadAttachment(req.user, intId(req.params.id));
  if (!canEditAudit(req.user) && att.uploaded_by !== req.user.id) throw forbidden();
  // Menghapus file berarti menghapus semua versinya.
  const root = chainOf(att);
  await removeFilesOf('COALESCE(t.root_id, t.id) = ?', [root]);
  const { rowCount } = await query('DELETE FROM attachments WHERE COALESCE(root_id, id) = ?', [root]);
  await logActivity({ query }, req.user.id, 'delete', 'attachment', att.id, { filename: att.filename, versions: rowCount });
  res.json({ ok: true });
});

export default r;
