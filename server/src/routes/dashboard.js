import { Router } from 'express';
import { query } from '../db.js';
import { requireRole } from '../auth.js';
import { auditScope, findingScope } from '../access.js';

const r = Router();

r.get('/', async (req, res) => {
  const as = auditScope(req.user, 'a', 1);
  const fs = findingScope(req.user, 'f', 'a', 1);
  const audits = (await query(`SELECT a.status, count(*)::int AS n FROM audits a WHERE ${as.sql} GROUP BY a.status`, as.params)).rows;
  const findings = (await query(
    `SELECT f.status, f.risk, count(*)::int AS n,
            count(*) FILTER (WHERE f.status <> 'Selesai' AND f.due_date < CURRENT_DATE)::int AS overdue
     FROM findings f JOIN audits a ON a.id = f.audit_id WHERE ${fs.sql} GROUP BY f.status, f.risk`, fs.params)).rows;
  const upcoming = (await query(
    `SELECT f.id, f.code, f.title, f.risk, f.status, f.due_date, u.name AS owner_name, a.title AS audit_title,
            (f.due_date < CURRENT_DATE) AS overdue
     FROM findings f JOIN audits a ON a.id = f.audit_id LEFT JOIN users u ON u.id = f.owner_id
     WHERE ${fs.sql} AND f.status <> 'Selesai'
     ORDER BY f.due_date NULLS LAST, f.id LIMIT 8`, fs.params)).rows;
  const byUnit = (await query(
    `SELECT a.unit, count(*)::int AS total, count(*) FILTER (WHERE f.status <> 'Selesai')::int AS open
     FROM findings f JOIN audits a ON a.id = f.audit_id WHERE ${fs.sql}
     GROUP BY a.unit ORDER BY open DESC, total DESC LIMIT 8`, fs.params)).rows;
  res.json({ audits, findings, upcoming, byUnit });
});

r.get('/activity', requireRole('admin', 'manajemen', 'auditor'), async (_req, res) => {
  const { rows } = await query(
    `SELECT l.id, l.action, l.entity, l.entity_id, l.detail, l.created_at, u.name AS user_name
     FROM activity_log l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC, l.id DESC LIMIT 100`);
  res.json(rows);
});

export default r;
