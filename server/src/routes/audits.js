import { Router } from 'express';
import { query, tx, logActivity } from '../db.js';
import { requireRole, canEditAudit } from '../auth.js';
import { badRequest, notFound, requireText, oneOf, dateOrNull, intId, forbidden } from '../errors.js';
import { AUDIT_STATUS, AUDIT_TYPES, STEP_RESULTS } from '../constants.js';
import { auditScope, findingScope } from '../access.js';
import { nextCode } from '../codes.js';

const r = Router();
const editors = requireRole('admin', 'auditor');

const LIST_SQL = `
  SELECT a.id, a.code, a.title, a.unit, a.type, a.lead_id, u.name AS lead_name, a.team,
         a.start_date, a.end_date, a.status, a.scope, a.created_at, a.updated_at,
         (SELECT count(*)::int FROM audit_steps s WHERE s.audit_id = a.id) AS steps_total,
         (SELECT count(*)::int FROM audit_steps s WHERE s.audit_id = a.id AND s.result <> 'Belum diuji') AS steps_done,
         (SELECT count(*)::int FROM findings f WHERE f.audit_id = a.id) AS findings_total,
         (SELECT count(*)::int FROM findings f WHERE f.audit_id = a.id AND f.status <> 'Selesai') AS findings_open
  FROM audits a LEFT JOIN users u ON u.id = a.lead_id`;

function auditFields(b, partial) {
  const out = {};
  const has = (k) => b[k] !== undefined;
  if (!partial || has('title')) out.title = requireText(b.title, 'Judul audit');
  if (!partial || has('unit')) out.unit = requireText(b.unit, 'Unit yang diaudit');
  if (!partial || has('type')) out.type = oneOf(b.type, AUDIT_TYPES, 'Jenis audit');
  if (has('status')) out.status = oneOf(b.status, AUDIT_STATUS, 'Status');
  if (has('lead_id')) out.lead_id = b.lead_id ? intId(b.lead_id) : null;
  if (has('team')) out.team = String(b.team || '').trim() || null;
  if (has('scope')) out.scope = String(b.scope || '').trim() || null;
  if (has('start_date')) out.start_date = dateOrNull(b.start_date, 'Tanggal mulai');
  if (has('end_date')) out.end_date = dateOrNull(b.end_date, 'Tanggal selesai');
  if (out.start_date && out.end_date && out.end_date < out.start_date) throw badRequest('Tanggal selesai tidak boleh sebelum tanggal mulai.');
  return out;
}

async function loadAudit(user, id) {
  const scope = auditScope(user, 'a', 2);
  const { rows } = await query(`${LIST_SQL} WHERE a.id = $1 AND ${scope.sql}`, [id, ...scope.params]);
  if (!rows[0]) throw notFound('Audit tidak ditemukan.');
  return rows[0];
}

r.get('/', async (req, res) => {
  const scope = auditScope(req.user, 'a', 1);
  const { rows } = await query(
    `${LIST_SQL} WHERE ${scope.sql}
     ORDER BY CASE a.status WHEN 'Pelaksanaan' THEN 0 WHEN 'Perencanaan' THEN 1 WHEN 'Pelaporan' THEN 2 ELSE 3 END, a.start_date DESC NULLS LAST, a.id DESC`,
    scope.params,
  );
  res.json(rows);
});

r.post('/', editors, async (req, res) => {
  const f = auditFields(req.body || {}, false);
  const templateId = req.body?.template_id ? intId(req.body.template_id) : null;
  const audit = await tx(async (c) => {
    const code = await nextCode(c, 'audits', 'AUD');
    const { rows } = await c.query(
      `INSERT INTO audits (code, title, unit, type, status, lead_id, team, scope, start_date, end_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [code, f.title, f.unit, f.type, f.status || 'Perencanaan', f.lead_id ?? null, f.team ?? null, f.scope ?? null,
        f.start_date ?? null, f.end_date ?? null, req.user.id],
    );
    const id = rows[0].id;
    if (templateId) {
      const t = await c.query('SELECT steps FROM templates WHERE id = $1', [templateId]);
      const steps = t.rows[0]?.steps || [];
      for (let i = 0; i < steps.length; i++) {
        await c.query('INSERT INTO audit_steps (audit_id, position, text) VALUES ($1,$2,$3)', [id, i, steps[i]]);
      }
    }
    await logActivity(c, req.user.id, 'create', 'audit', id, { code, title: f.title });
    return id;
  });
  res.status(201).json(await loadAudit(req.user, audit));
});

r.get('/:id', async (req, res) => {
  const id = intId(req.params.id);
  const audit = await loadAudit(req.user, id);
  // Auditee hanya melihat temuan miliknya, bukan kertas kerja auditor.
  const steps = req.user.role === 'auditee' ? [] :
    (await query('SELECT id, position, text, result, note, updated_at FROM audit_steps WHERE audit_id = $1 ORDER BY position, id', [id])).rows;
  const fs = findingScope(req.user, 'f', 'a', 2);
  const findings = (await query(
    `SELECT f.id, f.code, f.title, f.risk, f.status, f.due_date, f.owner_id, u.name AS owner_name, f.step_id,
            f.condition, f.criteria, f.cause, f.effect, f.recommendation, f.response
     FROM findings f JOIN audits a ON a.id = f.audit_id LEFT JOIN users u ON u.id = f.owner_id
     WHERE f.audit_id = $1 AND ${fs.sql} ORDER BY f.code`, [id, ...fs.params])).rows;
  const attachments = req.user.role === 'auditee' ? [] : (await query(
    `SELECT t.id, t.filename, t.mime, t.size, t.created_at, t.uploaded_by, u.name AS uploaded_by_name
     FROM attachments t LEFT JOIN users u ON u.id = t.uploaded_by WHERE t.audit_id = $1 AND t.finding_id IS NULL ORDER BY t.id`, [id])).rows;
  res.json({ ...audit, steps, findings, attachments });
});

r.patch('/:id', editors, async (req, res) => {
  const id = intId(req.params.id);
  const f = auditFields(req.body || {}, true);
  const keys = Object.keys(f);
  if (!keys.length) throw badRequest('Tidak ada perubahan.');
  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  const { rowCount } = await query(
    `UPDATE audits SET ${sets.join(', ')}, updated_at = now() WHERE id = $${keys.length + 1}`,
    [...keys.map((k) => f[k]), id],
  );
  if (!rowCount) throw notFound('Audit tidak ditemukan.');
  await logActivity({ query }, req.user.id, 'update', 'audit', id, { fields: keys });
  res.json(await loadAudit(req.user, id));
});

r.delete('/:id', editors, async (req, res) => {
  const id = intId(req.params.id);
  const { rows } = await query('DELETE FROM audits WHERE id = $1 RETURNING code', [id]);
  if (!rows[0]) throw notFound('Audit tidak ditemukan.');
  await logActivity({ query }, req.user.id, 'delete', 'audit', id, { code: rows[0].code });
  res.json({ ok: true });
});

// ---- Langkah program kerja ----
r.post('/:id/steps', editors, async (req, res) => {
  const id = intId(req.params.id);
  const text = requireText(req.body?.text, 'Langkah pengujian');
  const { rows } = await query(
    `INSERT INTO audit_steps (audit_id, position, text)
     SELECT $1, COALESCE(max(position) + 1, 0), $2 FROM audit_steps WHERE audit_id = $1
     RETURNING id, position, text, result, note, updated_at`, [id, text]).catch((err) => {
    if (err.code === '23503') throw notFound('Audit tidak ditemukan.');
    throw err;
  });
  res.status(201).json(rows[0]);
});

r.patch('/:id/steps/:stepId', editors, async (req, res) => {
  const id = intId(req.params.id);
  const stepId = intId(req.params.stepId);
  const b = req.body || {};
  const sets = [];
  const params = [];
  if (b.text !== undefined) { params.push(requireText(b.text, 'Langkah pengujian')); sets.push(`text = $${params.length}`); }
  if (b.result !== undefined) { params.push(oneOf(b.result, STEP_RESULTS, 'Hasil')); sets.push(`result = $${params.length}`); }
  if (b.note !== undefined) { params.push(String(b.note)); sets.push(`note = $${params.length}`); }
  if (!sets.length) throw badRequest('Tidak ada perubahan.');
  params.push(stepId, id);
  const { rows } = await query(
    `UPDATE audit_steps SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length - 1} AND audit_id = $${params.length}
     RETURNING id, position, text, result, note, updated_at`, params);
  if (!rows[0]) throw notFound('Langkah tidak ditemukan.');
  res.json(rows[0]);
});

r.delete('/:id/steps/:stepId', editors, async (req, res) => {
  const { rowCount } = await query('DELETE FROM audit_steps WHERE id = $1 AND audit_id = $2', [intId(req.params.stepId), intId(req.params.id)]);
  if (!rowCount) throw notFound('Langkah tidak ditemukan.');
  res.json({ ok: true });
});

export { loadAudit };
export default r;
