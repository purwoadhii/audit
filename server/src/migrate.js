import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { config } from './config.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrate() {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Migrasi diterapkan: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  await ensureAdmin();
}

// Membuat akun admin pertama dari ADMIN_EMAIL/ADMIN_PASSWORD bila belum ada pengguna sama sekali.
async function ensureAdmin() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n > 0) return;
  if (!config.admin.email || !config.admin.password) {
    console.warn('Belum ada pengguna. Isi ADMIN_EMAIL dan ADMIN_PASSWORD lalu jalankan ulang untuk membuat admin pertama.');
    return;
  }
  const hash = await bcrypt.hash(config.admin.password, 10);
  await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, lower($2), $3, 'admin')",
    [config.admin.name, config.admin.email, hash],
  );
  console.log(`Admin pertama dibuat: ${config.admin.email}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}
