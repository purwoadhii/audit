import { Router } from 'express';
import { query, tx, logActivity, bools, changesOf } from '../db.js';
import { canEditAudit } from '../auth.js';
import { badRequest, notFound, forbidden, requireText, oneOf, dateOrNull, intId, N_ } from '../errors.js';
import { FINDING_STATUS, FINDING_KINDS, RISKS, AUDITEE_STATUS } from '../constants.js';
import { auditScope, findingScope } from '../access.js';
import { nextCode } from '../codes.js';
import { removeFilesOf, ATTACHMENT_COLS } from '../files.js';
import { notify } from '../notify.js';
import { LOCKED } from './audits.js';

const r = Router();
const TEXT_FIELDS = ['condition', 'criteria', 'cause', 'effect', 'recommendation', 'response'];
const col = (k) => `\`${k}\``; // `condition` adalah kata kunci MySQL

const BASE = `
  SELECT f.*, a.code AS audit_code, a.title AS audit_title, a.unit AS audit_unit, a.lead_id AS audit_lead_id, a.approval AS audit_approval,
         u.name AS owner_name, rv.name AS reviewer_name, (f.status <> 'Selesai' AND f.due_date < CURRENT_DATE) AS overdue
  FROM findings f JOIN audits a ON a.id = f.audit_id LEFT JOIN users u ON u.id = f.owner_id LEFT JOIN users rv ON rv.id = f.reviewed_by`;

// Isian temuan yang dikunci selama laporan audit menunggu persetujuan atau sudah disetujui, dan yang
// membuat temuan harus direview ulang oleh ketua tim bila diubah. Status, PIC, dan batas waktu tetap bisa diubah untuk tindak lanjut.
const CONTENT = ['title', 'risk', 'category', 'root_cause', 'condition', 'criteria', 'cause', 'effect', 'recommendation', 'audit_id'];
const LOCKED_MSG = 'Laporan audit ini sedang menunggu persetujuan atau sudah disetujui. Minta penyetuju mengembalikannya dulu bila perlu diubah.';
const findingLink = (f) => `/audit/${f.audit_id}?temuan=${f.id}`;

export async function loadFinding(user, id) {
  const scope = findingScope(user, 'f', 'a');
  const { rows } = await query(`${BASE} WHERE f.id = ? AND ${scope.sql}`, [id, ...scope.params]);
  if (!rows[0]) throw notFound('Temuan tidak ditemukan.');
  return bools(rows[0], 'overdue');
}

r.get('/', async (req, res) => {
  const scope = findingScope(req.user, 'f', 'a');
  const params = [...scope.params];
  const where = [scope.sql];
  const q = req.query;
  const add = (sql, ...vals) => { params.push(...vals); where.push(sql); };
  if (q.status && FINDING_STATUS.includes(q.status)) add('f.status = ?', q.status);
  if (q.risk && RISKS.includes(q.risk)) add('f.risk = ?', q.risk);
  if (q.kind && FINDING_KINDS.includes(q.kind)) add('f.kind = ?', q.kind);
  if (q.audit_id) add('f.audit_id = ?', intId(q.audit_id));
  // Nilai '-' berarti belum diberi kategori.
  for (const col of ['category', 'root_cause']) {
    if (q[col] === '-') where.push(`COALESCE(f.${col}, '') = ''`);
    else if (q[col]) add(`f.${col} = ?`, String(q[col]));
  }
  if (q.mine === '1') add('f.owner_id = ?', req.user.id);
  if (q.overdue === '1') where.push("f.status <> 'Selesai' AND f.due_date < CURRENT_DATE");
  if (q.q) add("CONCAT_WS(' ', f.title, f.code, f.`condition`, u.name) LIKE ?", `%${String(q.q).replace(/[%_\\]/g, '\\$&')}%`);
  const { rows } = await query(
    `${BASE} WHERE ${where.join(' AND ')}
     ORDER BY (f.status = 'Selesai'), CASE f.risk WHEN 'Tinggi' THEN 0 WHEN 'Sedang' THEN 1 ELSE 2 END,
              f.due_date IS NULL, f.due_date, f.id`,
    params,
  );
  res.json(rows.map((f) => bools(f, 'overdue')));
});

r.get('/:id', async (req, res) => {
  const id = intId(req.params.id);
  const finding = await loadFinding(req.user, id);
  const logs = (await query(
    `SELECT l.id, l.text, l.status, l.created_at, u.name AS user_name FROM finding_logs l
     LEFT JOIN users u ON u.id = l.user_id WHERE l.finding_id = ? ORDER BY l.created_at DESC, l.id DESC`, [id])).rows;
  const attachments = (await query(
    `SELECT ${ATTACHMENT_COLS} FROM attachments t
     LEFT JOIN users u ON u.id = t.uploaded_by WHERE t.finding_id = ? AND t.superseded_by IS NULL ORDER BY COALESCE(t.root_id, t.id)`, [id])).rows;
  res.json({ ...finding, logs, attachments });
});

// Kategori dan akar masalah: teks pendek opsional, dipilih dari daftar di pengaturan.
function optLabel(v, label) {
  const s = String(v ?? '').trim();
  if (s.length > 150) throw badRequest('{label} maksimal {max} karakter.', { label, max: 150 });
  return s || null;
}

// Memeriksa isian satu temuan atau isu baru.
function newFinding(b) {
  const kind = b.kind === undefined ? 'temuan' : oneOf(b.kind, FINDING_KINDS, 'Jenis');
  return {
    kind,
    title: requireText(b.title, kind === 'isu' ? 'Judul isu' : 'Judul temuan'),
    risk: oneOf(b.risk, RISKS, 'Tingkat risiko'),
    status: b.status ? oneOf(b.status, FINDING_STATUS, 'Status') : 'Terbuka',
    due: dateOrNull(b.due_date, 'Batas waktu'),
    ownerId: b.owner_id ? intId(b.owner_id) : null,
    stepId: b.step_id ? intId(b.step_id) : null,
    category: optLabel(b.category, 'Kategori temuan'),
    rootCause: optLabel(b.root_cause, 'Kategori akar masalah'),
    texts: TEXT_FIELDS.map((k) => String(b[k] || '').trim()),
  };
}

async function assertAudit(c, user, auditId) {
  const as = auditScope(user, 'a');
  const a = await c.query(`SELECT a.approval FROM audits a WHERE a.id = ? AND ${as.sql}`, [auditId, ...as.params]);
  if (!a.rows[0]) throw badRequest('Audit tidak ditemukan.');
  if (LOCKED.includes(a.rows[0].approval)) throw badRequest(LOCKED_MSG);
}

async function insertFinding(c, user, auditId, n) {
  if (n.stepId) {
    const s = await c.query('SELECT 1 FROM audit_steps WHERE id = ? AND audit_id = ?', [n.stepId, auditId]);
    if (!s.rowCount) throw badRequest('Langkah tidak ada di audit ini.');
  }
  const code = await nextCode(c, n.kind === 'isu' ? 'ISU' : 'TMN');
  const { insertId } = await c.query(
    `INSERT INTO findings (code, kind, audit_id, step_id, title, risk, status, due_date, owner_id, category, root_cause,
       ${TEXT_FIELDS.map(col).join(', ')}, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [code, n.kind, auditId, n.stepId, n.title, n.risk, n.status, n.due, n.ownerId, n.category, n.rootCause, ...n.texts, user.id],
  );
  if (n.status === 'Selesai') await c.query('UPDATE findings SET closed_at = NOW(3) WHERE id = ?', [insertId]);
  await c.query('INSERT INTO finding_logs (finding_id, user_id, text, status) VALUES (?,?,?,?)',
    [insertId, user.id, n.kind === 'isu' ? 'Isu dicatat' : 'Temuan dicatat', n.status]);
  await logActivity(c, user.id, 'create', 'finding', insertId, { code, title: n.title });
  await notify(c, [n.ownerId], N_('Anda ditunjuk sebagai PIC {code}: {title}'), { code, title: n.title }, findingLink({ audit_id: auditId, id: insertId }), user.id);
  return insertId;
}

r.post('/', async (req, res) => {
  if (!canEditAudit(req.user)) throw forbidden();
  const b = req.body || {};
  const auditId = intId(b.audit_id);
  const n = newFinding(b);
  const id = await tx(async (c) => {
    await assertAudit(c, req.user, auditId);
    return insertFinding(c, req.user, auditId, n);
  });
  res.status(201).json(await loadFinding(req.user, id));
});

// Menambah beberapa temuan dan isu sekaligus ke satu audit. Semua tersimpan, atau tidak satu pun.
r.post('/batch', async (req, res) => {
  if (!canEditAudit(req.user)) throw forbidden();
  const b = req.body || {};
  const auditId = intId(b.audit_id);
  if (!Array.isArray(b.items) || !b.items.length) throw badRequest('Isi minimal satu temuan atau isu.');
  if (b.items.length > 50) throw badRequest('Paling banyak 50 temuan dan isu sekali simpan.');
  const items = b.items.map((x) => newFinding({ ...x, step_id: undefined }));
  const ids = await tx(async (c) => {
    await assertAudit(c, req.user, auditId);
    const out = [];
    for (const n of items) out.push(await insertFinding(c, req.user, auditId, n));
    return out;
  });
  res.status(201).json({ ids });
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
    if (b.category !== undefined) f.category = optLabel(b.category, 'Kategori temuan');
    if (b.root_cause !== undefined) f.root_cause = optLabel(b.root_cause, 'Kategori akar masalah');
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
  const contentChanged = keys.some((k) => CONTENT.includes(k) && String(f[k] ?? '') !== String(current[k] ?? ''));
  if (contentChanged && LOCKED.includes(current.audit_approval)) throw badRequest(LOCKED_MSG);
  if (f.audit_id !== undefined && f.audit_id !== current.audit_id) await assertAudit({ query }, req.user, f.audit_id);
  await tx(async (c) => {
    await c.query(
      `UPDATE findings SET ${keys.map((k) => `${col(k)} = ?`).join(', ')}${contentChanged ? ', reviewed_by = NULL, reviewed_at = NULL' : ''}, updated_at = NOW(3) WHERE id = ?`,
      [...keys.map((k) => f[k]), id],
    );
    const vars = { code: current.code, title: current.title, user: req.user.name, status: f.status };
    const link = findingLink(current);
    if (f.owner_id && f.owner_id !== current.owner_id) {
      await notify(c, [f.owner_id], N_('Anda ditunjuk sebagai PIC {code}: {title}'), vars, link, req.user.id);
    }
    if (req.user.role === 'auditee') {
      // Tanggapan atau progres dari auditee diberitahukan ke ketua tim dan pencatat temuan.
      await notify(c, [current.audit_lead_id, current.created_by], N_('{user} memperbarui tindak lanjut {code}: {title}'), vars, link, req.user.id);
    } else if (f.status && f.status !== current.status) {
      await notify(c, [current.owner_id], N_('Status {code} diubah menjadi {status} oleh {user}.'), vars, link, req.user.id);
    }
    if (f.status && f.status !== current.status) {
      await c.query('UPDATE findings SET closed_at = ? WHERE id = ?', [f.status === 'Selesai' ? new Date() : null, id]);
      await c.query('INSERT INTO finding_logs (finding_id, user_id, text, status) VALUES (?,?,?,?)',
        [id, req.user.id, `Status diubah dari ${current.status} ke ${f.status}`, f.status]);
    }
    const changes = changesOf(current, f, keys);
    // PIC dicatat dengan nama, bukan id.
    if (changes.owner_id) {
      const names = await c.query('SELECT id, name FROM users WHERE id IN (?, ?)', [current.owner_id ?? 0, f.owner_id ?? 0]);
      const nameOf = (uid) => names.rows.find((u) => u.id === uid)?.name ?? null;
      delete changes.owner_id;
      changes.owner = [nameOf(current.owner_id), nameOf(f.owner_id)];
    }
    if (changes.audit_id) {
      const codes = await c.query('SELECT id, code FROM audits WHERE id IN (?, ?)', [current.audit_id, f.audit_id]);
      const codeOf = (aid) => codes.rows.find((a) => a.id === aid)?.code ?? null;
      delete changes.audit_id;
      changes.audit = [codeOf(current.audit_id), codeOf(f.audit_id)];
    }
    // Simpan tanpa perubahan apa pun tidak dicatat.
    if (Object.keys(changes).length) {
      await logActivity(c, req.user.id, 'update', 'finding', id, { code: current.code, title: current.title, fields: Object.keys(changes), changes });
    }
  });
  res.json(await loadFinding(req.user, id));
});

r.delete('/:id', async (req, res) => {
  if (!canEditAudit(req.user)) throw forbidden();
  const id = intId(req.params.id);
  const { code, audit_approval: approval } = await loadFinding(req.user, id);
  if (LOCKED.includes(approval)) throw badRequest(LOCKED_MSG);
  await removeFilesOf('t.finding_id = ?', [id]);
  await query('DELETE FROM findings WHERE id = ?', [id]);
  await logActivity({ query }, req.user.id, 'delete', 'finding', id, { code });
  res.json({ ok: true });
});

// Review ketua tim untuk satu temuan atau isu.
r.post('/:id/review', async (req, res) => {
  const id = intId(req.params.id);
  const f = await loadFinding(req.user, id);
  if (!f.audit_lead_id || f.audit_lead_id !== req.user.id) throw forbidden('Hanya ketua tim audit ini yang bisa mereview.');
  if (LOCKED.includes(f.audit_approval)) throw badRequest(LOCKED_MSG);
  const off = req.body?.reviewed === false;
  await query(off ? 'UPDATE findings SET reviewed_by = NULL, reviewed_at = NULL WHERE id = ?' : 'UPDATE findings SET reviewed_by = ?, reviewed_at = NOW(3) WHERE id = ?',
    off ? [id] : [req.user.id, id]);
  res.json(await loadFinding(req.user, id));
});

r.post('/:id/logs', async (req, res) => {
  const id = intId(req.params.id);
  const finding = await loadFinding(req.user, id);
  if (req.user.role === 'manajemen') throw forbidden();
  const text = requireText(req.body?.text, 'Catatan');
  const { insertId } = await query(
    'INSERT INTO finding_logs (finding_id, user_id, text, status) VALUES (?,?,?,?)',
    [id, req.user.id, text, finding.status]);
  const { rows } = await query('SELECT id, text, status, created_at FROM finding_logs WHERE id = ?', [insertId]);
  res.status(201).json({ ...rows[0], user_name: req.user.name });
});

export default r;
