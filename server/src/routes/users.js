import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, logActivity } from '../db.js';
import { requireRole } from '../auth.js';
import { badRequest, notFound, requireText, oneOf, intId } from '../errors.js';
import { ROLES } from '../constants.js';

const r = Router();
const PUBLIC = 'id, name, email, role, unit, active, created_at';

// Admin melihat semua detail; auditor butuh daftar nama untuk memilih PIC temuan.
r.get('/', requireRole('admin', 'auditor', 'manajemen'), async (req, res) => {
  const cols = req.user.role === 'admin' ? PUBLIC : 'id, name, role, unit, active';
  const { rows } = await query(`SELECT ${cols} FROM users ORDER BY active DESC, name`);
  res.json(rows);
});

r.post('/', requireRole('admin'), async (req, res) => {
  const name = requireText(req.body?.name, 'Nama');
  const email = requireText(req.body?.email, 'Email').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw badRequest('Format email tidak valid.');
  const role = oneOf(req.body?.role, ROLES, 'Peran');
  const password = requireText(req.body?.password, 'Kata sandi');
  if (password.length < 8) throw badRequest('Kata sandi minimal 8 karakter.');
  const unit = req.body?.unit?.trim() || null;
  const exists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (exists.rowCount) throw badRequest('Email sudah dipakai pengguna lain.');
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role, unit) VALUES ($1,$2,$3,$4,$5) RETURNING ${PUBLIC}`,
    [name, email, await bcrypt.hash(password, 10), role, unit],
  );
  await logActivity({ query }, req.user.id, 'create', 'user', rows[0].id, { email, role });
  res.status(201).json(rows[0]);
});

r.patch('/:id', requireRole('admin'), async (req, res) => {
  const id = intId(req.params.id);
  const sets = [];
  const params = [];
  const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
  const b = req.body || {};
  if (b.name !== undefined) add('name', requireText(b.name, 'Nama'));
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
  params.push(id);
  const { rows } = await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${PUBLIC}`, params);
  if (!rows[0]) throw notFound();
  await logActivity({ query }, req.user.id, 'update', 'user', id, { fields: Object.keys(b).filter((k) => k !== 'password') });
  res.json(rows[0]);
});

export default r;
