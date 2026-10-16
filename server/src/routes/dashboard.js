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
