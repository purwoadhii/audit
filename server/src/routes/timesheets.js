// Timesheet auditor: jam kerja harian per audit atau kegiatan lain, dan realisasi dibanding anggaran jam di rencana.
// - Auditor dan Super User mencatat jamnya sendiri.
// - Super User, System Admin, dan manajemen bisa melihat timesheet semua auditor.
// - Ringkasan realisasi bisa dilihat semua peran kecuali auditee.
import { Router } from 'express';
import { query, logActivity } from '../db.js';
import { requireRole } from '../auth.js';
import { badRequest, forbidden, notFound, intId, dateOrNull, oneOf } from '../errors.js';
import { AUDIT_ACTIVITIES, OTHER_ACTIVITIES } from '../constants.js';
import { auditScope } from '../access.js';
import { getSettings } from '../settings.js';

const r = Router();
r.use(requireRole('admin', 'superadmin', 'auditor', 'manajemen'));
const loggers = requireRole('admin', 'superadmin', 'auditor');
const seesAll = (user) => ['admin', 'superadmin', 'manajemen'].includes(user.role);
const canManage = (user) => ['admin', 'superadmin'].includes(user.role);

const ENTRY_SQL = `
  SELECT t.id, t.user_id, u.name AS user_name, t.audit_id, a.code AS audit_code, a.title AS audit_title,
         t.work_date, t.activity, t.hours, t.note, t.created_at
  FROM timesheets t
  JOIN users u ON u.id = t.user_id
  LEFT JOIN audits a ON a.id = t.audit_id`;
const num = (row) => ({ ...row, hours: Number(row.hours) });

async function loadEntry(id) {
  const { rows } = await query(`${ENTRY_SQL} WHERE t.id = ?`, [id]);
  if (!rows[0]) throw notFound('Isian timesheet tidak ditemukan.');
  return num(rows[0]);
}

function hoursOf(v) {
  const h = Number(v);
  // Kelipatan 15 menit, paling banyak 24 jam.
  if (!Number.isFinite(h) || h <= 0 || h > 24 || Math.round(h * 4) !== h * 4) {
    throw badRequest('Jam harus antara 0,25 dan 24, dalam kelipatan 15 menit (0,25 jam).');
  }
  return h;
}

async function entryFields(user, b, cur) {
  const work_date = dateOrNull(b.work_date ?? cur?.work_date, 'Tanggal');
  if (!work_date) throw badRequest('{label} wajib diisi.', { label: 'Tanggal' });
  if (work_date > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) throw badRequest('Jam kerja tidak bisa dicatat untuk tanggal yang akan datang.');
  const audit_id = b.audit_id !== undefined ? (b.audit_id ? intId(b.audit_id) : null) : cur?.audit_id ?? null;
  const activity = oneOf(b.activity ?? cur?.activity, audit_id ? AUDIT_ACTIVITIES : OTHER_ACTIVITIES, 'Kegiatan');
  const hours = hoursOf(b.hours ?? cur?.hours);
  const note = String(b.note ?? cur?.note ?? '').trim().slice(0, 500) || null;
  if (audit_id) {
    const s = auditScope(user);
    const { rowCount } = await query(`SELECT 1 FROM audits a WHERE a.id = ? AND ${s.sql}`, [audit_id, ...s.params]);
    if (!rowCount) throw notFound('Audit tidak ditemukan.');
  }
  // Total jam satu orang dalam sehari tidak boleh lebih dari 24.
  const userId = cur?.user_id ?? user.id;
  const { rows: [day] } = await query('SELECT COALESCE(SUM(hours), 0) AS h FROM timesheets WHERE user_id = ? AND work_date = ? AND id <> ?',
    [userId, work_date, cur?.id ?? 0]);
  if (Number(day.h) + hours > 24) throw badRequest('Total jam pada {date} lebih dari 24 jam.', { date: work_date });
  return { work_date, audit_id, activity, hours, note };
}

// Isian timesheet dalam rentang tanggal. Auditor hanya melihat miliknya sendiri.
r.get('/', async (req, res) => {
  const from = dateOrNull(req.query.from, 'Tanggal awal') || new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const to = dateOrNull(req.query.to, 'Tanggal akhir') || new Date().toISOString().slice(0, 10);
  const q = req.query.user_id;
  const userId = q === 'all' ? null : q ? intId(q) : req.user.id;
  if (userId !== req.user.id && !seesAll(req.user)) throw forbidden();
  const where = ['t.work_date BETWEEN ? AND ?'];
  const params = [from, to];
  if (userId) { where.push('t.user_id = ?'); params.push(userId); }
  const { rows } = await query(`${ENTRY_SQL} WHERE ${where.join(' AND ')} ORDER BY t.work_date DESC, t.id DESC`, params);
  res.json({ from, to, user_id: userId, entries: rows.map(num) });
});

// Pilihan untuk form: kegiatan, audit yang bisa dicatat, dan (untuk yang bisa melihat semua) daftar auditor.
r.get('/options', async (req, res) => {
  const s = auditScope(req.user);
  const { rows: audits } = await query(
    `SELECT a.id, a.code, a.title, a.status FROM audits a WHERE ${s.sql}
     ORDER BY a.status = 'Selesai', (a.lead_id = ? OR EXISTS (SELECT 1 FROM audit_members m WHERE m.audit_id = a.id AND m.user_id = ?)) DESC, a.start_date DESC`,
    [...s.params, req.user.id, req.user.id]);
  const { rows: users } = seesAll(req.user)
    ? await query("SELECT id, name FROM users WHERE role IN ('auditor','superadmin','admin') AND active = TRUE ORDER BY name")
    : { rows: [] };
  res.json({ audit_activities: AUDIT_ACTIVITIES, other_activities: OTHER_ACTIVITIES, audits, users });
});

r.post('/', loggers, async (req, res) => {
  const f = await entryFields(req.user, req.body || {});
  const { insertId } = await query('INSERT INTO timesheets (user_id, audit_id, work_date, activity, hours, note) VALUES (?,?,?,?,?,?)',
    [req.user.id, f.audit_id, f.work_date, f.activity, f.hours, f.note]);
  res.status(201).json(await loadEntry(insertId));
});

async function ownEntry(req) {
  const cur = await loadEntry(intId(req.params.id));
  if (cur.user_id !== req.user.id && !canManage(req.user)) throw forbidden();
  return cur;
}

r.patch('/:id', loggers, async (req, res) => {
  const cur = await ownEntry(req);
  const f = await entryFields(req.user, req.body || {}, cur);
  await query('UPDATE timesheets SET audit_id = ?, work_date = ?, activity = ?, hours = ?, note = ?, updated_at = NOW(3) WHERE id = ?',
    [f.audit_id, f.work_date, f.activity, f.hours, f.note, cur.id]);
  if (cur.user_id !== req.user.id) {
    await logActivity({ query }, req.user.id, 'update', 'timesheet', cur.id, { title: `${cur.user_name} ${cur.work_date}` });
  }
  res.json(await loadEntry(cur.id));
});

r.delete('/:id', loggers, async (req, res) => {
  const cur = await ownEntry(req);
  await query('DELETE FROM timesheets WHERE id = ?', [cur.id]);
  if (cur.user_id !== req.user.id) {
    await logActivity({ query }, req.user.id, 'delete', 'timesheet', cur.id, { title: `${cur.user_name} ${cur.work_date}` });
  }
  res.json({ ok: true });
});

// Realisasi jam setahun: per audit (dibanding anggaran di rencana), per auditor (dibanding kapasitas), per kegiatan, per bulan.
r.get('/summary', async (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest('{label} tidak valid.', { label: 'Tahun' });
  const range = [`${year}-01-01`, `${year}-12-31`];
  const s = auditScope(req.user);
  const { rows: audits } = await query(
    `SELECT a.id, a.code, a.title, a.status, a.unit,
            (SELECT COALESCE(SUM(m.hours), 0) FROM plan_items p JOIN plan_item_members m ON m.plan_item_id = p.id WHERE p.audit_id = a.id) AS budget,
            (SELECT COALESCE(SUM(t.hours), 0) FROM timesheets t WHERE t.audit_id = a.id AND t.work_date BETWEEN ? AND ?) AS actual
     FROM audits a
     WHERE ${s.sql} AND (EXISTS (SELECT 1 FROM timesheets t WHERE t.audit_id = a.id AND t.work_date BETWEEN ? AND ?)
                         OR EXISTS (SELECT 1 FROM plan_items p WHERE p.audit_id = a.id AND p.year = ?))
     ORDER BY a.code`, [...range, ...s.params, ...range, year]);
  const { rows: users } = await query(
    `SELECT u.id, u.name,
            COALESCE(SUM(CASE WHEN t.audit_id IS NOT NULL THEN t.hours END), 0) AS audit_hours,
            COALESCE(SUM(CASE WHEN t.audit_id IS NULL THEN t.hours END), 0) AS other_hours,
            (SELECT COALESCE(SUM(m.hours), 0) FROM plan_item_members m JOIN plan_items p ON p.id = m.plan_item_id
              WHERE m.user_id = u.id AND p.year = ? AND p.cancelled = FALSE) AS budget
     FROM users u JOIN timesheets t ON t.user_id = u.id AND t.work_date BETWEEN ? AND ?
     GROUP BY u.id, u.name ORDER BY u.name`, [year, ...range]);
  const { rows: activities } = await query(
    'SELECT activity, COALESCE(SUM(hours), 0) AS hours FROM timesheets WHERE work_date BETWEEN ? AND ? GROUP BY activity ORDER BY hours DESC', range);
  const { rows: months } = await query(
    'SELECT MONTH(work_date) AS month, COALESCE(SUM(hours), 0) AS hours FROM timesheets WHERE work_date BETWEEN ? AND ? GROUP BY MONTH(work_date)', range);
  const n = (rows, ...keys) => rows.map((x) => { for (const k of keys) x[k] = Number(x[k]); return x; });
  res.json({
    year,
    capacity: (await getSettings()).auditor_hours,
    audits: n(audits, 'budget', 'actual'),
    users: n(users, 'audit_hours', 'other_hours', 'budget').map((u) => ({ ...u, hours: u.audit_hours + u.other_hours })),
    activities: n(activities, 'hours'),
    months: Array.from({ length: 12 }, (_, i) => Number(months.find((m) => Number(m.month) === i + 1)?.hours || 0)),
  });
});

// Realisasi jam satu audit, per orang dan per kegiatan, untuk halaman detail audit.
r.get('/audit/:auditId', async (req, res) => {
  const auditId = intId(req.params.auditId);
  const s = auditScope(req.user);
  const { rows: [a] } = await query(
    `SELECT a.id, (SELECT COALESCE(SUM(m.hours), 0) FROM plan_items p JOIN plan_item_members m ON m.plan_item_id = p.id WHERE p.audit_id = a.id) AS budget
     FROM audits a WHERE a.id = ? AND ${s.sql}`, [auditId, ...s.params]);
  if (!a) throw notFound('Audit tidak ditemukan.');
  const { rows: users } = await query(
    `SELECT u.id, u.name, SUM(t.hours) AS hours FROM timesheets t JOIN users u ON u.id = t.user_id
     WHERE t.audit_id = ? GROUP BY u.id, u.name ORDER BY hours DESC`, [auditId]);
  const { rows: activities } = await query(
    'SELECT activity, SUM(hours) AS hours FROM timesheets WHERE audit_id = ? GROUP BY activity ORDER BY hours DESC', [auditId]);
  const list = (rows) => rows.map((x) => ({ ...x, hours: Number(x.hours) }));
  const u = list(users);
  res.json({ budget: Number(a.budget), actual: u.reduce((sum, x) => sum + x.hours, 0), users: u, activities: list(activities) });
});

export default r;
