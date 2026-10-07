import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { config } from './config.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrate() {
  // Koneksi khusus agar satu file migrasi bisa berisi banyak perintah SQL.
  const conn = await mysql.createConnection({ uri: config.databaseUrl, multipleStatements: true, charset: 'utf8mb4' });
  try {
    await conn.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(190) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
    const [done] = await conn.query('SELECT name FROM schema_migrations');
    const applied = new Set(done.map((r) => r.name));
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      await conn.query(await fs.readFile(path.join(dir, file), 'utf8'));
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      console.log(`Migrasi diterapkan: ${file}`);
    }
  } finally {
    await conn.end();
  }
  await ensureAdmin();
}

// Membuat akun admin pertama dari ADMIN_EMAIL/ADMIN_PASSWORD bila belum ada pengguna sama sekali.
async function ensureAdmin() {
  const [rows] = await pool.query('SELECT COUNT(*) AS n FROM users');
  if (rows[0].n > 0) return;
  if (!config.admin.email || !config.admin.password) {
    console.warn('Belum ada pengguna. Isi ADMIN_EMAIL dan ADMIN_PASSWORD lalu jalankan ulang untuk membuat admin pertama.');
    return;
  }
  const hash = await bcrypt.hash(config.admin.password, 10);
  await pool.query(
    "INSERT INTO users (name, username, email, password_hash, role) VALUES (?, LOWER(?), LOWER(?), ?, 'admin')",
    [config.admin.name, config.admin.username, config.admin.email, hash],
  );
  console.log(`Admin pertama dibuat: ${config.admin.username} (${config.admin.email})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}
