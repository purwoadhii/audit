import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { query } from './db.js';
import { config } from './config.js';
import { badRequest } from './errors.js';

// Tempat menyimpan file bukti:
// - local: folder di server aplikasi. Bawaannya UPLOAD_DIR, dan System Admin bisa mengarahkannya ke folder lain
//   (misalnya drive lain atau folder NAS yang di-mount ke server).
// - s3: object storage yang kompatibel S3, baik cloud (AWS S3, Google Cloud Storage, Cloudflare R2,
//   Wasabi, penyedia lokal) maupun server sendiri (MinIO on-premise).

const KEY = 'storage';
const DEFAULT = { driver: 'local', local_dir: '', s3: { endpoint: '', region: 'us-east-1', bucket: '', access_key: '', prefix: 'audit/', path_style: true }, secret: '' };

// Secret key S3 disimpan terenkripsi di database dengan kunci turunan JWT_SECRET.
const cipherKey = () => crypto.createHash('sha256').update(`storage:${config.jwtSecret}`).digest();
function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cipherKey(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function decrypt(blob) {
  if (!blob) return '';
  try {
    const [iv, tag, enc] = blob.split('.').map((x) => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', cipherKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch {
    return null; // JWT_SECRET berubah: secret harus diisi ulang
  }
}

let cache = null;
const health = { last_check: null, ok: null, message: '', last_error: null };

export async function loadStorageConfig() {
  if (cache) return cache;
  const { rows } = await query('SELECT v FROM settings WHERE k = ?', [KEY]);
  let saved = {};
  try { saved = rows[0] ? JSON.parse(rows[0].v) : {}; } catch { /* pakai bawaan */ }
  cache = { ...DEFAULT, ...saved, s3: { ...DEFAULT.s3, ...(saved.s3 || {}) } };
  return cache;
}

// Bentuk yang aman dikirim ke browser: secret tidak pernah ikut.
export async function publicStorageConfig() {
  const c = await loadStorageConfig();
  const secret = decrypt(c.secret);
  return { driver: c.driver, local_dir: c.local_dir, default_dir: config.uploadDir, s3: c.s3, secret_set: Boolean(c.secret), secret_unreadable: Boolean(c.secret) && secret === null };
}

function cleanS3(input, prev) {
  const s = { ...prev.s3, ...(input || {}) };
  const out = {
    endpoint: String(s.endpoint || '').trim(),
    region: String(s.region || '').trim() || 'us-east-1',
    bucket: String(s.bucket || '').trim(),
    access_key: String(s.access_key || '').trim(),
    prefix: String(s.prefix ?? '').trim().replace(/^\/+/, ''),
    path_style: Boolean(s.path_style),
  };
  if (out.endpoint && !/^https?:\/\/[^\s/]+/.test(out.endpoint)) throw badRequest('Endpoint harus diawali http:// atau https://');
  if (out.prefix && !/^[\w./-]{1,100}$/.test(out.prefix)) throw badRequest('Folder awalan hanya boleh huruf, angka, titik, garis miring, minus, dan garis bawah.');
  if (out.prefix && !out.prefix.endsWith('/')) out.prefix += '/';
  return out;
}

// Folder lokal harus berupa alamat lengkap (misalnya D:/AuditFiles atau /srv/audit-files).
function cleanLocalDir(input, prev) {
  const raw = String(input ?? prev ?? '').trim();
  if (!raw) return '';
  if (raw.length > 400 || raw.includes('\0')) throw badRequest('Alamat folder tidak valid.');
  if (!path.isAbsolute(raw)) throw badRequest('Tulis alamat folder lengkap, misalnya D:/AuditFiles atau /srv/audit-files.');
  const dir = path.resolve(raw);
  return dir === config.uploadDir ? '' : dir;
}

// Gabungkan perubahan dari form dengan pengaturan lama; secret kosong berarti tidak diubah.
export async function buildStorageConfig(body) {
  const prev = await loadStorageConfig();
  const driver = body?.driver ?? prev.driver;
  if (!['local', 's3'].includes(driver)) throw badRequest('Jenis penyimpanan tidak valid.');
  const s3 = cleanS3(body?.s3, prev);
  const local_dir = cleanLocalDir(body?.local_dir, prev.local_dir);
  const secret = body?.secret_key ? encrypt(String(body.secret_key)) : prev.secret;
  if (driver === 's3') {
    if (!s3.bucket) throw badRequest('Nama bucket wajib diisi.');
    if (!s3.access_key) throw badRequest('Access key wajib diisi.');
    if (!secret || decrypt(secret) === null) throw badRequest('Secret key wajib diisi.');
  }
  return { driver, local_dir, s3, secret };
}

export async function saveStorageConfig(user, cfg) {
  await query(
    'INSERT INTO settings (k, v, updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE v = VALUES(v), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP(3)',
    [KEY, JSON.stringify(cfg), user.id],
  );
  cache = null;
  clients.clear();
}

const clients = new Map();
function s3Client(cfg) {
  const id = JSON.stringify([cfg.s3, cfg.secret]);
  if (!clients.has(id)) {
    clients.set(id, new S3Client({
      region: cfg.s3.region,
      endpoint: cfg.s3.endpoint || undefined,
      forcePathStyle: cfg.s3.path_style,
      credentials: { accessKeyId: cfg.s3.access_key, secretAccessKey: decrypt(cfg.secret) || '' },
    }));
  }
  return clients.get(id);
}

const localDir = (cfg) => cfg.local_dir || config.uploadDir;
// storage_dir kosong berarti file ada di UPLOAD_DIR.
const localPath = (name, dir) => path.join(dir || config.uploadDir, name);

async function moveFile(from, to) {
  try {
    await fs.promises.rename(from, to);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err; // beda drive: salin lalu hapus
    await fs.promises.copyFile(from, to);
    await fs.promises.unlink(from);
  }
}

function noteError(err) {
  health.last_error = { at: new Date().toISOString(), message: String(err?.message || err).slice(0, 300) };
}

// multer menaruh file sementara di UPLOAD_DIR. Untuk folder lokal lain file dipindahkan ke sana;
// untuk S3 file dikirim lalu salinan lokal dihapus. Mengembalikan { storage, dir }.
export async function storeUpload(file) {
  const cfg = await loadStorageConfig();
  if (cfg.driver !== 's3') {
    if (!cfg.local_dir) return { storage: 'local', dir: null };
    try {
      await fs.promises.mkdir(cfg.local_dir, { recursive: true });
      await moveFile(file.path, localPath(file.filename, cfg.local_dir));
    } catch (err) {
      noteError(err);
      await fs.promises.unlink(file.path).catch(() => {});
      throw badRequest('File tidak bisa disimpan ke folder penyimpanan. Hubungi admin untuk memeriksa pengaturan penyimpanan.');
    }
    return { storage: 'local', dir: cfg.local_dir };
  }
  try {
    await s3Client(cfg).send(new PutObjectCommand({
      Bucket: cfg.s3.bucket, Key: cfg.s3.prefix + file.filename,
      Body: fs.createReadStream(file.path), ContentLength: file.size, ContentType: file.mimetype,
    }));
  } catch (err) {
    noteError(err);
    throw badRequest('File tidak bisa disimpan ke penyimpanan cloud. Hubungi admin untuk memeriksa pengaturan penyimpanan.');
  }
  await fs.promises.unlink(file.path).catch(() => {});
  return { storage: 's3', dir: null };
}

export async function openStored(att) {
  if (att.storage !== 's3') {
    const file = localPath(att.storage_name, att.storage_dir);
    if (!fs.existsSync(file)) return null;
    return fs.createReadStream(file);
  }
  const cfg = await loadStorageConfig();
  try {
    const out = await s3Client(cfg).send(new GetObjectCommand({ Bucket: cfg.s3.bucket, Key: cfg.s3.prefix + att.storage_name }));
    return out.Body;
  } catch (err) {
    noteError(err);
    return null;
  }
}

export async function removeStored(storage, name, dir) {
  if (storage !== 's3') return fs.promises.unlink(localPath(name, dir)).catch(() => {});
  const cfg = await loadStorageConfig();
  try {
    await s3Client(cfg).send(new DeleteObjectCommand({ Bucket: cfg.s3.bucket, Key: cfg.s3.prefix + name }));
  } catch (err) {
    noteError(err);
  }
}

// Uji koneksi: tulis, baca, dan hapus file kecil. Dipakai tombol "Tes koneksi" dan halaman Infra Admin.
export async function testStorage(cfg) {
  const started = Date.now();
  try {
    if (cfg.driver === 's3') {
      const client = new S3Client({
        region: cfg.s3.region, endpoint: cfg.s3.endpoint || undefined, forcePathStyle: cfg.s3.path_style,
        credentials: { accessKeyId: cfg.s3.access_key, secretAccessKey: decrypt(cfg.secret) || '' },
      });
      await client.send(new HeadBucketCommand({ Bucket: cfg.s3.bucket }));
      const Key = `${cfg.s3.prefix}.tes-koneksi-${crypto.randomUUID()}`;
      await client.send(new PutObjectCommand({ Bucket: cfg.s3.bucket, Key, Body: 'ok' }));
      await client.send(new DeleteObjectCommand({ Bucket: cfg.s3.bucket, Key }));
    } else {
      fs.mkdirSync(localDir(cfg), { recursive: true });
      const f = localPath(`.tes-koneksi-${crypto.randomUUID()}`, localDir(cfg));
      await fs.promises.writeFile(f, 'ok');
      await fs.promises.unlink(f);
    }
    return { ok: true, ms: Date.now() - started, message: 'Berhasil menulis dan menghapus file uji.' };
  } catch (err) {
    const msg = /EACCES|EPERM/.test(err?.code || '') ? 'Aplikasi tidak punya izin menulis ke folder ini.'
      : /ENOENT|ENOTDIR/.test(err?.code || '') ? 'Folder tidak ditemukan dan tidak bisa dibuat. Periksa alamat dan drive-nya.'
      : err?.name === 'NoSuchBucket' || err?.$metadata?.httpStatusCode === 404 ? 'Bucket tidak ditemukan.'
      : err?.$metadata?.httpStatusCode === 403 || /InvalidAccessKeyId|SignatureDoesNotMatch|AccessDenied/.test(err?.name || '') ? 'Akses ditolak. Periksa access key, secret key, dan izin bucket.'
        : /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/.test(err?.code || err?.message || '') ? 'Server penyimpanan tidak bisa dihubungi. Periksa endpoint dan jaringan.'
          : String(err?.message || err).slice(0, 200);
    return { ok: false, ms: Date.now() - started, message: msg };
  }
}

export async function checkHealth() {
  const result = await testStorage(await loadStorageConfig());
  Object.assign(health, { last_check: new Date().toISOString(), ok: result.ok, message: result.message });
  return result;
}

export const storageHealth = () => health;
export const activeLocalDir = localDir;
