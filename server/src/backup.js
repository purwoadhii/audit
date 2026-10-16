import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { pool } from './db.js';
import { config } from './config.js';
import { badRequest, notFound } from './errors.js';
import { getSettings, saveInternal } from './settings.js';

// Backup database ke file .sql.gz di BACKUP_DIR. Isinya perintah SQL biasa (DROP, CREATE, INSERT),
// jadi bisa dipulihkan lewat phpMyAdmin → Import, atau `gunzip -c file | mysql nama_db`.
// File bukti di folder upload tidak ikut; folder itu perlu disalin terpisah.

const NAME = /^backup-[A-Za-z0-9_]+-\d{4}-\d{2}-\d{2}_\d{6}\.sql\.gz$/;
const ROWS_PER_INSERT = 200;
let running = false;

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Menghasilkan isi file SQL baris demi baris supaya tabel besar tidak dimuat sekaligus ke memori.
async function* dumpLines(conn, dbName) {
  yield `-- Backup database ${dbName} dari Audit Management\n-- Dibuat ${new Date().toISOString()}\n\n`;
  yield 'SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\nSET SQL_MODE = \'NO_AUTO_VALUE_ON_ZERO\';\nSET time_zone = \'+00:00\';\n\n';
  const [tables] = await conn.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
  for (const t of tables) {
    const name = Object.values(t)[0];
    const q = `\`${name.replace(/`/g, '``')}\``;
    const [[create]] = await conn.query(`SHOW CREATE TABLE ${q}`);
    yield `DROP TABLE IF EXISTS ${q};\n${create['Create Table']};\n\n`;
    let offset = 0;
    for (;;) {
      const [rows] = await conn.query(`SELECT * FROM ${q} LIMIT ${ROWS_PER_INSERT} OFFSET ${offset}`);
      if (!rows.length) break;
      const cols = Object.keys(rows[0]).map((c) => `\`${c.replace(/`/g, '``')}\``).join(', ');
      const values = rows.map((row) => `(${Object.values(row).map((v) => pool.escape(v)).join(', ')})`).join(',\n');
      yield `INSERT INTO ${q} (${cols}) VALUES\n${values};\n`;
      offset += rows.length;
      if (rows.length < ROWS_PER_INSERT) break;
    }
    yield '\n';
  }
  yield 'SET FOREIGN_KEY_CHECKS = 1;\n';
}

export async function listBackups() {
  const files = await fsp.readdir(config.backupDir).catch(() => []);
  const out = [];
  for (const name of files.filter((f) => NAME.test(f))) {
    const st = await fsp.stat(path.join(config.backupDir, name));
    out.push({ name, size: st.size, created_at: st.mtime.toISOString() });
  }
  return out.sort((a, b) => b.name.localeCompare(a.name));
}

// Menyimpan hanya sejumlah backup terbaru; yang lebih lama dihapus.
async function prune(keep) {
  const files = await listBackups();
  for (const f of files.slice(keep)) await fsp.rm(path.join(config.backupDir, f.name), { force: true });
}

export async function runBackup(user, reason = 'manual') {
  if (running) throw badRequest('Backup sedang berjalan. Tunggu sampai selesai.');
  running = true;
  const started = new Date();
  const conn = await pool.getConnection();
  let file = '';
  try {
    const [[{ db }]] = await conn.query('SELECT DATABASE() AS db');
    await fsp.mkdir(config.backupDir, { recursive: true });
    file = path.join(config.backupDir, `backup-${String(db).replace(/[^A-Za-z0-9_]/g, '_')}-${stamp(started)}.sql.gz`);
    // Isi file ditulis ke nama sementara dulu, supaya backup yang gagal di tengah jalan tidak terlihat utuh.
    await pipeline(Readable.from(dumpLines(conn, db)), zlib.createGzip(), fs.createWriteStream(`${file}.part`));
    await fsp.rename(`${file}.part`, file);
    const size = (await fsp.stat(file)).size;
    const last = { at: started.toISOString(), file: path.basename(file), size, ok: true, reason, ms: Date.now() - started.getTime() };
    await saveInternal(user, 'backup_last', last);
    await prune((await getSettings()).backup_keep);
    return last;
  } catch (err) {
    if (file) await fsp.rm(`${file}.part`, { force: true });
    await saveInternal(user, 'backup_last', { at: started.toISOString(), ok: false, reason, error: err.message });
    throw err;
  } finally {
    conn.release();
    running = false;
  }
}

export function backupPath(name) {
  if (!NAME.test(String(name))) throw notFound('File backup tidak ditemukan.');
  const p = path.join(config.backupDir, name);
  if (!fs.existsSync(p)) throw notFound('File backup tidak ditemukan.');
  return p;
}

export async function backupStatus() {
  const s = await getSettings();
  return { dir: config.backupDir, running, last: s.backup_last, files: await listBackups() };
}

// Backup otomatis sekali sehari pada jam yang diatur Infra Admin (jam server).
export function scheduleBackups() {
  setInterval(async () => {
    try {
      const s = await getSettings();
      const now = new Date();
      if (!s.backup_enabled || now.getHours() !== s.backup_hour || running) return;
      if (s.backup_last?.ok && localDay(new Date(s.backup_last.at)) === localDay(now)) return;
      const r = await runBackup({ id: null }, 'otomatis');
      console.log(`Backup database tersimpan: ${r.file}`);
    } catch (err) {
      console.error('Backup otomatis gagal:', err.message);
    }
  }, 5 * 60 * 1000).unref();
}
