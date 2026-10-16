import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  uri: config.databaseUrl,
  connectionLimit: 10,
  timezone: 'Z',
  dateStrings: ['DATE'], // kolom DATE tetap 'YYYY-MM-DD' agar tidak bergeser zona waktu
  charset: 'utf8mb4',
  multipleStatements: false,
});

// Semua waktu disimpan dalam UTC.
pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));

// Bentuk hasil yang seragam untuk SELECT dan INSERT/UPDATE/DELETE.
function wrap(result) {
  const [res] = result;
  if (Array.isArray(res)) return { rows: res, rowCount: res.length };
  return { rows: [], rowCount: res.affectedRows, insertId: res.insertId };
}

export const query = async (sql, params = []) => wrap(await pool.query(sql, params));

export async function tx(fn) {
  const conn = await pool.getConnection();
  const client = { query: async (sql, params = []) => wrap(await conn.query(sql, params)) };
  try {
    await conn.beginTransaction();
    const result = await fn(client);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function logActivity(db, userId, action, entity, entityId, detail) {
  await db.query(
    'INSERT INTO activity_log (user_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?)',
    [userId, action, entity, entityId, detail ? JSON.stringify(detail) : null],
  );
}

// Nilai yang dicatat di log aktivitas: pendek, dan true/false dijadikan 1/0 supaya sebanding dengan isi database.
function logValue(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'boolean') return Number(v);
  if (typeof v === 'number') return v;
  const s = v instanceof Date ? v.toISOString() : typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : JSON.stringify(v);
  return s.length > 300 ? `${s.slice(0, 300)}…` : s;
}

// Perubahan untuk audit trail: { kolom: [nilai lama, nilai baru] }, hanya kolom yang benar-benar berubah.
export function changesOf(before, after, keys = Object.keys(after)) {
  const out = {};
  for (const k of keys) {
    const a = logValue(before?.[k]);
    const b = logValue(after[k]);
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = [a, b];
  }
  return out;
}

// MySQL mengembalikan BOOLEAN sebagai 0/1; ubah ke true/false untuk API.
export function bools(row, ...keys) {
  if (!row) return row;
  for (const k of keys) if (k in row && row[k] !== null) row[k] = Boolean(Number(row[k]));
  return row;
}
