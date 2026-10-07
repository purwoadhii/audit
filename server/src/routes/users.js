import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, logActivity, bools } from '../db.js';
import { requireRole } from '../auth.js';
import { badRequest, notFound, requireText, oneOf, intId } from '../errors.js';
import { ROLES } from '../constants.js';

const r = Router();
const PUBLIC = 'id, name, username, email, role, unit, active, created_at';

function cleanUsername(v) {
  const u = String(v || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,60}$/.test(u)) throw badRequest('Username 3-60 karakter: huruf kecil, angka, titik, minus, atau garis bawah.');
  return u;
}

async function assertFree(field, value, exceptId = 0) {
  const { rowCount } = await query(`SELECT 1 FROM users WHERE ${field} = ? AND id <> ?`, [value, exceptId]);
  if (rowCount) throw badRequest(field === 'email' ? 'Email sudah dipakai pengguna lain.' : 'Username sudah dipakai pengguna lain.');
}

// Admin melihat semua detail; auditor butuh daftar nama untuk memilih PIC temuan.
r.get('/', requireRole('admin', 'auditor', 'manajemen'), async (req, res) => {
  const cols = req.user.role === 'admin' ? PUBLIC : 'id, name, role, unit, active';
  const { rows } = await query(`SELECT ${cols} FROM users ORDER BY active DESC, name`);
  res.json(rows.map((u) => bools(u, 'active')));
});

async function loadUser(id) {
  const { rows } = await query(`SELECT ${PUBLIC} FROM users WHERE id = ?`, [id]);
  if (!rows[0]) throw notFound();
  return bools(rows[0], 'active');
}

r.post('/', requireRole('admin'), async (req, res) => {
  const name = requireText(req.body?.name, 'Nama');
  const email = requireText(req.body?.email, 'Email').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw badRequest('Format email tidak valid.');
  const role = oneOf(req.body?.role, ROLES, 'Peran');
  const password = requireText(req.body?.password, 'Kata sandi');
  if (password.length < 8) throw badRequest('Kata sandi minimal 8 karakter.');
  const unit = req.body?.unit?.trim() || null;
  const username = cleanUsername(req.body?.username);
  await assertFree('email', email);
  await assertFree('username', username);
  const { insertId } = await query(
    'INSERT INTO users (name, username, email, password_hash, role, unit) VALUES (?,?,?,?,?,?)',
    [name, username, email, await bcrypt.hash(password, 10), role, unit],
  );
  await logActivity({ query }, req.user.id, 'create', 'user', insertId, { email, role });
  res.status(201).json(await loadUser(insertId));
});

r.patch('/:id', requireRole('admin'), async (req, res) => {
  const id = intId(req.params.id);
  const sets = [];
  const params = [];
  const add = (col, val) => { params.push(val); sets.push(`${col} = ?`); };
  const b = req.body || {};
  if (b.name !== undefined) add('name', requireText(b.name, 'Nama'));
  if (b.username !== undefined) {
    const username = cleanUsername(b.username);
    await assertFree('username', username, id);
    add('username', username);
  }
  if (b.role !== undefined) add('role', oneOf(b.role, ROLES, 'Peran'));
  if (b.unit !== undefined) add('unit', b.unit?.trim() || null);
  if (b.active !== undefined) {
    if (id === req.user.id && !b.active) throw badRequest('Anda tidak bisa menonaktifkan akun sendiri.');
    add('active', Boolean(b.active));
  }
  if (b.password) {
    if (String(b.password).length < 8) throw badRequest('Kata sandi minimal 8 karakter.');
    add('password_hash', await bcrypt.hash(String(b.password), 10));
  }
  if (id === req.user.id && b.role && b.role !== 'admin') throw badRequest('Anda tidak bisa menurunkan peran akun sendiri.');
  if (!sets.length) throw badRequest('Tidak ada perubahan.');
  await loadUser(id);
  await query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  await logActivity({ query }, req.user.id, 'update', 'user', id, { fields: Object.keys(b).filter((k) => k !== 'password') });
  res.json(await loadUser(id));
});

export default r;
