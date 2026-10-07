import { Router } from 'express';
import { query } from '../db.js';
import { requireRole } from '../auth.js';
import { badRequest, notFound, requireText, intId } from '../errors.js';

const r = Router();

function cleanSteps(steps) {
  if (!Array.isArray(steps)) throw badRequest('Langkah harus berupa daftar.');
  return steps.map((s) => String(s).trim()).filter(Boolean);
}

r.get('/', async (_req, res) => {
  const { rows } = await query('SELECT id, name, steps FROM templates ORDER BY name');
  res.json(rows);
});

r.post('/', requireRole('admin'), async (req, res) => {
  const name = requireText(req.body?.name, 'Nama template');
  const steps = cleanSteps(req.body?.steps || []);
  const dup = await query('SELECT 1 FROM templates WHERE lower(name) = lower($1)', [name]);
  if (dup.rowCount) throw badRequest('Nama template sudah ada.');
  const { rows } = await query('INSERT INTO templates (name, steps) VALUES ($1, $2) RETURNING id, name, steps', [name, JSON.stringify(steps)]);
  res.status(201).json(rows[0]);
});

r.patch('/:id', requireRole('admin'), async (req, res) => {
  const id = intId(req.params.id);
  const name = requireText(req.body?.name, 'Nama template');
  const steps = cleanSteps(req.body?.steps || []);
  const { rows } = await query('UPDATE templates SET name = $1, steps = $2 WHERE id = $3 RETURNING id, name, steps', [name, JSON.stringify(steps), id]);
  if (!rows[0]) throw notFound();
  res.json(rows[0]);
});

r.delete('/:id', requireRole('admin'), async (req, res) => {
  await query('DELETE FROM templates WHERE id = $1', [intId(req.params.id)]);
  res.json({ ok: true });
});

export default r;
