import { Router } from 'express';
import { query } from '../db.js';
import { requireRole } from '../auth.js';
import { badRequest, notFound, requireText, intId } from '../errors.js';

const r = Router();

function cleanSteps(steps) {
  if (!Array.isArray(steps)) throw badRequest('Langkah harus berupa daftar.');
  return steps.map((s) => String(s).trim()).filter(Boolean);
}

export const parseTemplate = (t) => ({ ...t, steps: typeof t.steps === 'string' ? JSON.parse(t.steps) : t.steps });

async function loadTemplate(id) {
  const { rows } = await query('SELECT id, name, steps FROM templates WHERE id = ?', [id]);
  if (!rows[0]) throw notFound();
  return parseTemplate(rows[0]);
}

r.get('/', async (_req, res) => {
  const { rows } = await query('SELECT id, name, steps FROM templates ORDER BY name');
  res.json(rows.map(parseTemplate));
});

async function assertUniqueName(name, exceptId = 0) {
  const dup = await query('SELECT 1 FROM templates WHERE LOWER(name) = LOWER(?) AND id <> ?', [name, exceptId]);
  if (dup.rowCount) throw badRequest('Nama template sudah ada.');
}

r.post('/', requireRole('admin'), async (req, res) => {
  const name = requireText(req.body?.name, 'Nama template');
  const steps = cleanSteps(req.body?.steps || []);
  await assertUniqueName(name);
  const { insertId } = await query('INSERT INTO templates (name, steps) VALUES (?, ?)', [name, JSON.stringify(steps)]);
  res.status(201).json(await loadTemplate(insertId));
});

r.patch('/:id', requireRole('admin'), async (req, res) => {
  const id = intId(req.params.id);
  const name = requireText(req.body?.name, 'Nama template');
  const steps = cleanSteps(req.body?.steps || []);
  await loadTemplate(id);
  await assertUniqueName(name, id);
  await query('UPDATE templates SET name = ?, steps = ? WHERE id = ?', [name, JSON.stringify(steps), id]);
  res.json(await loadTemplate(id));
});

r.delete('/:id', requireRole('admin'), async (req, res) => {
  await query('DELETE FROM templates WHERE id = ?', [intId(req.params.id)]);
  res.json({ ok: true });
});

export default r;
