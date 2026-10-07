import { Router } from 'express';
import { query, tx, logActivity } from '../db.js';
import { requireRole } from '../auth.js';
import { badRequest, notFound, requireText, oneOf, dateOrNull, intId } from '../errors.js';
import { AUDIT_STATUS, STEP_RESULTS } from '../constants.js';
import { getSettings } from '../settings.js';
import { auditScope, findingScope } from '../access.js';
import { nextCode } from '../codes.js';
import { parseTemplate } from './templates.js';

const r = Router();
const editors = requireRole('admin', 'auditor');

const LIST_SQL = `
  SELECT a.id, a.code, a.title, a.unit, a.type, a.lead_id, u.name AS lead_name, a.team,
         a.start_date, a.end_date, a.status, a.scope, a.created_at, a.updated_at,
         (SELECT COUNT(*) FROM audit_steps s WHERE s.audit_id = a.id) AS steps_total,
         (SELECT COUNT(*) FROM audit_steps s WHERE s.audit_id = a.id AND s.result <> 'Belum diuji') AS steps_done,
         (SELECT COUNT(*) FROM findings f WHERE f.audit_id = a.id) AS findings_total,
         (SELECT COUNT(*) FROM findings f WHERE f.audit_id = a.id AND f.status <> 'Selesai') AS findings_open
  FROM audits a LEFT JOIN users u ON u.id = a.lead_id`;

const STEP_COLS = 'id, position, text, result, note, updated_at';

// types: jenis audit yang diizinkan (dari pengaturan), ditambah jenis lama audit itu saat diubah.
function auditFields(b, partial, types) {
  const out = {};
  const has = (k) => b[k] !== undefined;
  if (!partial || has('title')) out.title = requireText(b.title, 'Judul audit');
  if (!partial || has('unit')) out.unit = requireText(b.unit, 'Unit yang diaudit');
  if (!partial || has('type')) out.type = oneOf(b.type, types, 'Jenis audit');
  if (has('status')) out.status = oneOf(b.status, AUDIT_STATUS, 'Status');
  if (has('lead_id')) out.lead_id = b.lead_id ? intId(b.lead_id) : null;
  if (has('team')) out.team = String(b.team || '').trim() || null;
  if (has('scope')) out.scope = String(b.scope || '').trim() || null;
  if (has('start_date')) out.start_date = dateOrNull(b.start_date, 'Tanggal mulai');
  if (has('end_date')) out.end_date = dateOrNull(b.end_date, 'Tanggal selesai');
  if (out.start_date && out.end_date && out.end_date < out.start_date) throw badRequest('Tanggal selesai tidak boleh sebelum tanggal mulai.');
  return out;
}

// Anggota tim dari pengguna terdaftar, ditempelkan ke setiap audit sebagai members: [{ id, name }].
async function attachMembers(audits) {
  if (!audits.length) return audits;
  const { rows } = await query(
    `SELECT m.audit_id, u.id, u.name FROM audit_members m JOIN users u ON u.id = m.user_id
      WHERE m.audit_id IN (${audits.map(() => '?').join(',')}) ORDER BY u.name`,
    audits.map((a) => a.id),
  );
  for (const a of audits) a.members = rows.filter((m) => m.audit_id === a.id).map(({ id, name }) => ({ id, name }));
  return audits;
}

// Memeriksa daftar id anggota: harus pengguna aktif yang terdaftar.
async function memberIds(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw badRequest('Anggota tim harus berupa daftar.');
  const ids = [...new Set(value.map((v) => intId(v)))];
  if (!ids.length) return ids;
  const { rows } = await query(`SELECT id FROM users WHERE active = TRUE AND id IN (${ids.map(() => '?').join(',')})`, ids);
  if (rows.length !== ids.length) throw badRequest('Ada anggota tim yang tidak terdaftar atau tidak aktif.');
  return ids;
}

async function saveMembers(db, auditId, ids) {
  await db.query('DELETE FROM audit_members WHERE audit_id = ?', [auditId]);
  for (const uid of ids) await db.query('INSERT INTO audit_members (audit_id, user_id) VALUES (?,?)', [auditId, uid]);
}

async function loadAudit(user, id) {
  const scope = auditScope(user, 'a');
  const { rows } = await query(`${LIST_SQL} WHERE a.id = ? AND ${scope.sql}`, [id, ...scope.params]);
  if (!rows[0]) throw notFound('Audit tidak ditemukan.');
  return (await attachMembers(rows))[0];
}

r.get('/', async (req, res) => {
  const scope = auditScope(req.user, 'a');
  const { rows } = await query(
    `${LIST_SQL} WHERE ${scope.sql}
     ORDER BY CASE a.status WHEN 'Pelaksanaan' THEN 0 WHEN 'Perencanaan' THEN 1 WHEN 'Pelaporan' THEN 2 ELSE 3 END,
              a.start_date IS NULL, a.start_date DESC, a.id DESC`,
    scope.params,
  );
  res.json(await attachMembers(rows));
});

r.post('/', editors, async (req, res) => {
  const f = auditFields(req.body || {}, false, (await getSettings()).audit_types);
  const templateId = req.body?.template_id ? intId(req.body.template_id) : null;
  const members = await memberIds(req.body?.member_ids);
  const id = await tx(async (c) => {
    const code = await nextCode(c, 'AUD');
    const { insertId } = await c.query(
      `INSERT INTO audits (code, title, unit, type, status, lead_id, team, scope, start_date, end_date, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [code, f.title, f.unit, f.type, f.status || 'Perencanaan', f.lead_id ?? null, f.team ?? null, f.scope ?? null,
        f.start_date ?? null, f.end_date ?? null, req.user.id],
    );
    if (members?.length) await saveMembers(c, insertId, members);
    if (templateId) {
      const t = await c.query('SELECT steps FROM templates WHERE id = ?', [templateId]);
      const steps = t.rows[0] ? parseTemplate(t.rows[0]).steps : [];
      for (let i = 0; i < steps.length; i++) {
        await c.query("INSERT INTO audit_steps (audit_id, position, text, note) VALUES (?,?,?,'')", [insertId, i, steps[i]]);
      }
    }
    await logActivity(c, req.user.id, 'create', 'audit', insertId, { code, title: f.title });
    return insertId;
  });
  res.status(201).json(await loadAudit(req.user, id));
});

r.get('/:id', async (req, res) => {
  const id = intId(req.params.id);
  const audit = await loadAudit(req.user, id);
  // Auditee hanya melihat temuan miliknya, bukan kertas kerja auditor.
  const steps = req.user.role === 'auditee' ? [] :
    (await query(`SELECT ${STEP_COLS} FROM audit_steps WHERE audit_id = ? ORDER BY position, id`, [id])).rows;
  const fs = findingScope(req.user, 'f', 'a');
  const findings = (await query(
    `SELECT f.id, f.code, f.title, f.risk, f.status, f.due_date, f.owner_id, u.name AS owner_name, f.step_id,
            f.\`condition\`, f.criteria, f.cause, f.effect, f.recommendation, f.response
     FROM findings f JOIN audits a ON a.id = f.audit_id LEFT JOIN users u ON u.id = f.owner_id
     WHERE f.audit_id = ? AND ${fs.sql} ORDER BY f.code`, [id, ...fs.params])).rows;
  const attachments = req.user.role === 'auditee' ? [] : (await query(
    `SELECT t.id, t.filename, t.mime, t.size, t.text_status, t.created_at, t.uploaded_by, u.name AS uploaded_by_name
     FROM attachments t LEFT JOIN users u ON u.id = t.uploaded_by WHERE t.audit_id = ? AND t.finding_id IS NULL ORDER BY t.id`, [id])).rows;
  res.json({ ...audit, steps, findings, attachments });
});

r.patch('/:id', editors, async (req, res) => {
  const id = intId(req.params.id);
  const { rows: cur } = await query('SELECT type FROM audits WHERE id = ?', [id]);
  const f = auditFields(req.body || {}, true, [...(await getSettings()).audit_types, cur[0]?.type]);
  if (!cur[0]) throw notFound('Audit tidak ditemukan.');
  const members = await memberIds(req.body?.member_ids);
  const keys = Object.keys(f);
  if (!keys.length && members === undefined) throw badRequest('Tidak ada perubahan.');
  await tx(async (c) => {
    await c.query(
      `UPDATE audits SET ${keys.map((k) => `${k} = ?, `).join('')}updated_at = NOW(3) WHERE id = ?`,
      [...keys.map((k) => f[k]), id],
    );
    if (members !== undefined) await saveMembers(c, id, members);
  });
  await logActivity({ query }, req.user.id, 'update', 'audit', id, { fields: members !== undefined ? [...keys, 'member_ids'] : keys });
  res.json(await loadAudit(req.user, id));
});

r.delete('/:id', editors, async (req, res) => {
  const id = intId(req.params.id);
  const { rows } = await query('SELECT code FROM audits WHERE id = ?', [id]);
  if (!rows[0]) throw notFound('Audit tidak ditemukan.');
  await query('DELETE FROM audits WHERE id = ?', [id]);
  await logActivity({ query }, req.user.id, 'delete', 'audit', id, { code: rows[0].code });
  res.json({ ok: true });
});

// ---- Langkah program kerja ----
async function loadStep(auditId, stepId) {
  const { rows } = await query(`SELECT ${STEP_COLS} FROM audit_steps WHERE id = ? AND audit_id = ?`, [stepId, auditId]);
  if (!rows[0]) throw notFound('Langkah tidak ditemukan.');
  return rows[0];
}

r.post('/:id/steps', editors, async (req, res) => {
  const id = intId(req.params.id);
  const text = requireText(req.body?.text, 'Langkah pengujian');
  const exists = await query('SELECT 1 FROM audits WHERE id = ?', [id]);
  if (!exists.rowCount) throw notFound('Audit tidak ditemukan.');
  const { rows } = await query('SELECT COALESCE(MAX(position) + 1, 0) AS pos FROM audit_steps WHERE audit_id = ?', [id]);
  const { insertId } = await query("INSERT INTO audit_steps (audit_id, position, text, note) VALUES (?,?,?,'')", [id, rows[0].pos, text]);
  res.status(201).json(await loadStep(id, insertId));
});

r.patch('/:id/steps/:stepId', editors, async (req, res) => {
  const id = intId(req.params.id);
  const stepId = intId(req.params.stepId);
  const b = req.body || {};
  const sets = [];
  const params = [];
  if (b.text !== undefined) { params.push(requireText(b.text, 'Langkah pengujian')); sets.push('text = ?'); }
  if (b.result !== undefined) { params.push(oneOf(b.result, STEP_RESULTS, 'Hasil')); sets.push('result = ?'); }
  if (b.note !== undefined) { params.push(String(b.note)); sets.push('note = ?'); }
  if (!sets.length) throw badRequest('Tidak ada perubahan.');
  await loadStep(id, stepId);
  await query(`UPDATE audit_steps SET ${sets.join(', ')}, updated_at = NOW(3) WHERE id = ? AND audit_id = ?`, [...params, stepId, id]);
  res.json(await loadStep(id, stepId));
});

r.delete('/:id/steps/:stepId', editors, async (req, res) => {
  const { rowCount } = await query('DELETE FROM audit_steps WHERE id = ? AND audit_id = ?', [intId(req.params.stepId), intId(req.params.id)]);
  if (!rowCount) throw notFound('Langkah tidak ditemukan.');
  res.json({ ok: true });
});

export { loadAudit };
export default r;
