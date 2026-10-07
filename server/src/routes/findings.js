import { Router } from 'express';
import { query, tx, logActivity } from '../db.js';
import { canEditAudit } from '../auth.js';
import { badRequest, notFound, forbidden, requireText, oneOf, dateOrNull, intId } from '../errors.js';
import { FINDING_STATUS, RISKS, AUDITEE_STATUS } from '../constants.js';
import { findingScope } from '../access.js';
import { nextCode } from '../codes.js';

const r = Router();
const TEXT_FIELDS = ['condition', 'criteria', 'cause', 'effect', 'recommendation', 'response'];

const BASE = `
  SELECT f.*, a.code AS audit_code, a.title AS audit_title, a.unit AS audit_unit,
         u.name AS owner_name, (f.status <> 'Selesai' AND f.due_date < CURRENT_DATE) AS overdue
  FROM findings f JOIN audits a ON a.id = f.audit_id LEFT JOIN users u ON u.id = f.owner_id`;

export async function loadFinding(user, id) {
  const scope = findingScope(user, 'f', 'a', 2);
  const { rows } = await query(`${BASE} WHERE f.id = $1 AND ${scope.sql}`, [id, ...scope.params]);
  if (!rows[0]) throw notFound('Temuan tidak ditemukan.');
  return rows[0];
}

r.get('/', async (req, res) => {
  const scope = findingScope(req.user, 'f', 'a', 1);
  const params = [...scope.params];
  const where = [scope.sql];
  const q = req.query;
  const add = (sql, val) => { params.push(val); where.push(sql.replace('?', `$${params.length}`)); };
  if (q.status && FINDING_STATUS.includes(q.status)) add('f.status = ?', q.status);
  if (q.risk && RISKS.includes(q.risk)) add('f.risk = ?', q.risk);
  if (q.audit_id) add('f.audit_id = ?', intId(q.audit_id));
  if (q.mine === '1') add('f.owner_id = ?', req.user.id);
  if (q.overdue === '1') where.push("f.status <> 'Selesai' AND f.due_date < CURRENT_DATE");
  if (q.q) add("(f.title || ' ' || f.code || ' ' || f.condition || ' ' || coalesce(u.name,'')) ILIKE ?", `%${String(q.q).replace(/[%_\\]/g, '\\$&')}%`);
  const { rows } = await query(
    `${BASE} WHERE ${where.join(' AND ')}
     ORDER BY (f.status = 'Selesai'), CASE f.risk WHEN 'Tinggi' THEN 0 WHEN 'Sedang' THEN 1 ELSE 2 END, f.due_date NULLS LAST, f.id`,
    params,
  );
  res.json(rows);
});

r.get('/:id', async (req, res) => {
  const id = intId(req.params.id);
  const finding = await loadFinding(req.user, id);
  const logs = (await query(
    `SELECT l.id, l.text, l.status, l.created_at, u.name AS user_name FROM finding_logs l
     LEFT JOIN users u ON u.id = l.user_id WHERE l.finding_id = $1 ORDER BY l.created_at DESC, l.id DESC`, [id])).rows;
  const attachments = (await query(
    `SELECT t.id, t.filename, t.mime, t.size, t.created_at, t.uploaded_by, u.name AS uploaded_by_name FROM attachments t
     LEFT JOIN users u ON u.id = t.uploaded_by WHERE t.finding_id = $1 ORDER BY t.id`, [id])).rows;
  res.json({ ...finding, logs, attachments });
});

r.post('/', async (req, res) => {
  if (!canEditAudit(req.user)) throw forbidden();
  const b = req.body || {};
  const auditId = intId(b.audit_id);
  const title = requireText(b.title, 'Judul temuan');
  const risk = oneOf(b.risk, RISKS, 'Tingkat risiko');
  const status = b.status ? oneOf(b.status, FINDING_STATUS, 'Status') : 'Terbuka';
  const due = dateOrNull(b.due_date, 'Batas waktu');
  const ownerId = b.owner_id ? intId(b.owner_id) : null;
  const stepId = b.step_id ? intId(b.step_id) : null;
  const texts = TEXT_FIELDS.map((k) => String(b[k] || '').trim());
  const id = await tx(async (c) => {
    const a = await c.query('SELECT 1 FROM audits WHERE id = $1', [auditId]);
    if (!a.rowCount) throw badRequest('Audit tidak ditemukan.');
    if (stepId) {
      const s = await c.query('SELECT 1 FROM audit_steps WHERE id = $1 AND audit_id = $2', [stepId, auditId]);
      if (!s.rowCount) throw badRequest('Langkah tidak ada di audit ini.');
    }
    const code = await nextCode(c, 'findings', 'TMN');
    const { rows } = await c.query(
      `INSERT INTO findings (code, audit_id, step_id, title, risk, status, due_date, owner_id,
         condition, criteria, cause, effect, recommendation, response, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [code, auditId, stepId, title, risk, status, due, ownerId, ...texts, req.user.id],
    );
    await c.query('INSERT INTO finding_logs (finding_id, user_id, text, status) VALUES ($1,$2,$3,$4)', [rows[0].id, req.user.id, 'Temuan dicatat', status]);
    await logActivity(c, req.user.id, 'create', 'finding', rows[0].id, { code, title });
    return rows[0].id;
  });
  res.status(201).json(await loadFinding(req.user, id));
});

r.patch('/:id', async (req, res) => {
  const id = intId(req.params.id);
  const current = await loadFinding(req.user, id);
  const b = req.body || {};
  const f = {};
  if (canEditAudit(req.user)) {
    if (b.title !== undefined) f.title = requireText(b.title, 'Judul temuan');
    if (b.risk !== undefined) f.risk = oneOf(b.risk, RISKS, 'Tingkat risiko');
    if (b.status !== undefined) f.status = oneOf(b.status, FINDING_STATUS, 'Status');
    if (b.due_date !== undefined) f.due_date = dateOrNull(b.due_date, 'Batas waktu');
    if (b.owner_id !== undefined) f.owner_id = b.owner_id ? intId(b.owner_id) : null;
    if (b.audit_id !== undefined) f.audit_id = intId(b.audit_id);
    for (const k of TEXT_FIELDS) if (b[k] !== undefined) f[k] = String(b[k]).trim();
  } else if (req.user.role === 'auditee') {
    // Auditee hanya mengisi tanggapan dan melaporkan progres.
    if (b.response !== undefined) f.response = String(b.response).trim();
    if (b.status !== undefined && b.status !== current.status) f.status = oneOf(b.status, AUDITEE_STATUS, 'Status');
    const extra = Object.keys(b).filter((k) => !['response', 'status'].includes(k));
    if (extra.length) throw forbidden('Auditee hanya bisa mengubah tanggapan dan status tindak lanjut.');
  } else {
    throw forbidden();
  }
  const keys = Object.keys(f);
  if (!keys.length) return res.json(current);
  await tx(async (c) => {
    await c.query(
      `UPDATE findings SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = $${keys.length + 1}`,
      [...keys.map((k) => f[k]), id],
    );
    if (f.status && f.status !== current.status) {
      await c.query('INSERT INTO finding_logs (finding_id, user_id, text, status) VALUES ($1,$2,$3,$4)',
        [id, req.user.id, `Status diubah dari ${current.status} ke ${f.status}`, f.status]);
    }
    await logActivity(c, req.user.id, 'update', 'finding', id, { fields: keys });
  });
  res.json(await loadFinding(req.user, id));
});

r.delete('/:id', async (req, res) => {
  if (!canEditAudit(req.user)) throw forbidden();
  const id = intId(req.params.id);
  const { rows } = await query('DELETE FROM findings WHERE id = $1 RETURNING code', [id]);
  if (!rows[0]) throw notFound('Temuan tidak ditemukan.');
  await logActivity({ query }, req.user.id, 'delete', 'finding', id, { code: rows[0].code });
  res.json({ ok: true });
});

r.post('/:id/logs', async (req, res) => {
  const id = intId(req.params.id);
  const finding = await loadFinding(req.user, id);
  if (req.user.role === 'manajemen') throw forbidden();
  const text = requireText(req.body?.text, 'Catatan');
  const { rows } = await query(
    'INSERT INTO finding_logs (finding_id, user_id, text, status) VALUES ($1,$2,$3,$4) RETURNING id, text, status, created_at',
    [id, req.user.id, text, finding.status]);
  res.status(201).json({ ...rows[0], user_name: req.user.name });
});

export default r;
