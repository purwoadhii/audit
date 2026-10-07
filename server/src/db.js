import pg from 'pg';
import { config } from './config.js';

// Kolom DATE dikembalikan sebagai string 'YYYY-MM-DD' agar tidak bergeser zona waktu.
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export const query = (text, params) => pool.query(text, params);

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function logActivity(db, userId, action, entity, entityId, detail) {
  await db.query(
    'INSERT INTO activity_log (user_id, action, entity, entity_id, detail) VALUES ($1,$2,$3,$4,$5)',
    [userId, action, entity, entityId, detail ? JSON.stringify(detail) : null],
  );
}
