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

// MySQL mengembalikan BOOLEAN sebagai 0/1; ubah ke true/false untuk API.
export function bools(row, ...keys) {
  if (!row) return row;
  for (const k of keys) if (k in row && row[k] !== null) row[k] = Boolean(Number(row[k]));
  return row;
}
