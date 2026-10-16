import { Router } from 'express';
import { query, bools } from '../db.js';
import { requireRole, isAdmin, watchedRoles } from '../auth.js';
import { auditScope, findingScope, seesAllUnits } from '../access.js';

const r = Router();
const countIf = (cond) => `CAST(SUM(CASE WHEN ${cond} THEN 1 ELSE 0 END) AS SIGNED)`;
const OVERDUE = "f.status <> 'Selesai' AND f.due_date < CURRENT_DATE";

r.get('/', async (req, res) => {
  const as = auditScope(req.user, 'a');
  const fs = findingScope(req.user, 'f', 'a');
  const audits = (await query(`SELECT a.status, COUNT(*) AS n FROM audits a WHERE ${as.sql} GROUP BY a.status`, as.params)).rows;
  const findings = (await query(
    `SELECT f.status, f.risk, COUNT(*) AS n, ${countIf(OVERDUE)} AS overdue
     FROM findings f JOIN audits a ON a.id = f.audit_id WHERE ${fs.sql} GROUP BY f.status, f.risk`, fs.params)).rows;
  const upcoming = (await query(
    `SELECT f.id, f.code, f.title, f.risk, f.status, f.due_date, u.name AS owner_name, a.title AS audit_title,
            (f.due_date < CURRENT_DATE) AS overdue
     FROM findings f JOIN audits a ON a.id = f.audit_id LEFT JOIN users u ON u.id = f.owner_id
     WHERE ${fs.sql} AND f.status <> 'Selesai'
     ORDER BY f.due_date IS NULL, f.due_date, f.id LIMIT 8`, fs.params)).rows.map((f) => bools(f, 'overdue'));
  const byUnit = (await query(
    `SELECT a.unit, COUNT(*) AS total, ${countIf("f.status <> 'Selesai'")} AS open
     FROM findings f JOIN audits a ON a.id = f.audit_id WHERE ${fs.sql}
     GROUP BY a.unit ORDER BY open DESC, total DESC LIMIT 8`, fs.params)).rows;
  // Progres rencana audit tahun ini (tidak untuk auditee).
  let plan = null;
  if (req.user.role !== 'auditee') {
    const { rows: [p] } = await query(
      `SELECT COUNT(*) AS planned, ${countIf('p.audit_id IS NOT NULL')} AS started, ${countIf("a.status = 'Selesai'")} AS done
       FROM plan_items p LEFT JOIN audits a ON a.id = p.audit_id WHERE p.year = ? AND p.cancelled = FALSE`, [new Date().getFullYear()]);
    plan = { year: new Date().getFullYear(), planned: Number(p.planned), started: Number(p.started || 0), done: Number(p.done || 0) };
  }
  res.json({ audits, findings, upcoming, byUnit, plan });
});

// Analitik temuan: tren bulanan, lama penyelesaian, ketepatan waktu, umur keterlambatan, temuan berulang,
// dan perbandingan antar unit. Periode bawaan 12 bulan terakhir.
r.get('/analytics', requireRole('admin', 'superadmin', 'auditor', 'manajemen'), async (req, res) => {
  const months = Math.min(36, Math.max(3, Number(req.query.months) || 12));
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1)).toISOString().slice(0, 10);
  const fs = findingScope(req.user, 'f', 'a');
  const base = `FROM findings f JOIN audits a ON a.id = f.audit_id WHERE ${fs.sql}`;
  const ym = (col) => `DATE_FORMAT(${col}, '%Y-%m')`;
  const opened = (await query(`SELECT ${ym('f.created_at')} AS m, COUNT(*) AS n ${base} AND f.created_at >= ? GROUP BY m`, [...fs.params, start])).rows;
  const closed = (await query(`SELECT ${ym('f.closed_at')} AS m, COUNT(*) AS n ${base} AND f.closed_at >= ? GROUP BY m`, [...fs.params, start])).rows;
  const keys = Array.from({ length: months }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1 + i, 1)).toISOString().slice(0, 7));
  const pick = (rows, k) => Number(rows.find((x) => x.m === k)?.n || 0);
  const trend = keys.map((k) => ({ month: k, opened: pick(opened, k), closed: pick(closed, k) }));

  // Lama penyelesaian (hari) dan ketepatan waktu temuan yang ditutup dalam periode, per tingkat risiko.
  const closing = (await query(
    `SELECT f.risk, COUNT(*) AS n, AVG(DATEDIFF(f.closed_at, f.created_at)) AS days,
            ${countIf('f.due_date IS NOT NULL AND DATE(f.closed_at) <= f.due_date')} AS on_time,
            ${countIf('f.due_date IS NOT NULL')} AS with_due
     ${base} AND f.closed_at >= ? GROUP BY f.risk`, [...fs.params, start])).rows
    .map((x) => ({ risk: x.risk, closed: Number(x.n), days: x.days === null ? null : Math.round(Number(x.days)), on_time: Number(x.on_time || 0), with_due: Number(x.with_due || 0) }));

  // Umur keterlambatan temuan terbuka yang lewat batas waktu.
  const { rows: [age] } = await query(
    `SELECT ${countIf("f.due_date >= CURRENT_DATE OR f.due_date IS NULL")} AS not_due,
            ${countIf('DATEDIFF(CURRENT_DATE, f.due_date) BETWEEN 1 AND 30')} AS d30,
            ${countIf('DATEDIFF(CURRENT_DATE, f.due_date) BETWEEN 31 AND 60')} AS d60,
            ${countIf('DATEDIFF(CURRENT_DATE, f.due_date) BETWEEN 61 AND 90')} AS d90,
            ${countIf('DATEDIFF(CURRENT_DATE, f.due_date) > 90')} AS d90plus
     ${base} AND f.status <> 'Selesai'`, fs.params);
  const aging = ['not_due', 'd30', 'd60', 'd90', 'd90plus'].map((k) => ({ bucket: k, n: Number(age?.[k] || 0) }));

  // Temuan berulang: kategori yang sama muncul di lebih dari satu audit pada unit yang sama.
  const repeats = (await query(
    `SELECT a.unit, f.category, COUNT(DISTINCT f.audit_id) AS audits, COUNT(*) AS findings, MAX(f.created_at) AS last_at
     ${base} AND f.kind = 'temuan' AND f.category IS NOT NULL AND f.category <> ''
     GROUP BY a.unit, f.category HAVING COUNT(DISTINCT f.audit_id) > 1
     ORDER BY audits DESC, findings DESC LIMIT 10`, fs.params)).rows.map((x) => ({ ...x, audits: Number(x.audits), findings: Number(x.findings) }));

  // Per unit: jumlah temuan, terbuka, terlambat, risiko tinggi yang masih terbuka, dan persentase selesai.
  const units = (await query(
    `SELECT a.unit, COUNT(*) AS total, ${countIf("f.status = 'Selesai'")} AS done, ${countIf(OVERDUE)} AS overdue,
            ${countIf("f.status <> 'Selesai' AND f.risk = 'Tinggi'")} AS high_open
     ${base} GROUP BY a.unit ORDER BY overdue DESC, high_open DESC, total DESC`, fs.params)).rows
    .map((x) => ({ unit: x.unit, total: Number(x.total), done: Number(x.done), overdue: Number(x.overdue), high_open: Number(x.high_open) }));

  const byCategory = (await query(
    `SELECT COALESCE(NULLIF(f.category, ''), '-') AS category, COUNT(*) AS n ${base} AND f.created_at >= ? GROUP BY category ORDER BY n DESC`,
    [...fs.params, start])).rows.map((x) => ({ category: x.category, n: Number(x.n) }));
  const byRootCause = (await query(
    `SELECT COALESCE(NULLIF(f.root_cause, ''), '-') AS root_cause, COUNT(*) AS n ${base} AND f.created_at >= ? GROUP BY root_cause ORDER BY n DESC`,
    [...fs.params, start])).rows.map((x) => ({ root_cause: x.root_cause, n: Number(x.n) }));

  res.json({ months, start, trend, closing, aging, repeats, units, byCategory, byRootCause });
});

// Log aktivitas. Admin melihat aktivitas akun yang diawasinya: System Admin melihat pengguna dan admin,
// Infra Admin melihat admin dan Infra Admin. Auditor dan manajemen melihat aktivitas pengguna.
r.get('/activity', requireRole('admin', 'superadmin', 'manajemen', 'auditor'), async (req, res) => {
  const roles = isAdmin(req.user) ? watchedRoles(req.user) : ['superadmin', 'auditor', 'auditee', 'manajemen'];
  // Pengguna yang terikat unit hanya melihat aktivitas pengguna di unitnya.
  const unit = seesAllUnits(req.user) ? null : String(req.user.unit).trim();
  const { rows } = await query(
    `SELECT l.id, l.action, l.entity, l.entity_id, l.detail, l.created_at, u.name AS user_name, u.role AS user_role
     FROM activity_log l LEFT JOIN users u ON u.id = l.user_id
     WHERE u.role IN (${roles.map(() => '?').join(',')})${unit ? ' AND TRIM(u.unit) = ?' : ''}
     ORDER BY l.created_at DESC, l.id DESC LIMIT 1000`, unit ? [...roles, unit] : roles);
  res.json(rows.map((l) => ({ ...l, detail: l.detail ? JSON.parse(l.detail) : null })));
});

export default r;
