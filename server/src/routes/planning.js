// Perencanaan audit berbasis risiko: audit universe, penilaian risiko tahunan, dan rencana audit tahunan.
import { Router } from 'express';
import { query, tx, logActivity, bools, changesOf } from '../db.js';
import { requireRole } from '../auth.js';
import { badRequest, notFound, requireText, intId } from '../errors.js';
import { riskLevel, AUDIT_CYCLE } from '../constants.js';
import { getSettings } from '../settings.js';

const r = Router();
const readers = requireRole('admin', 'superadmin', 'auditor', 'manajemen');
const editors = requireRole('admin', 'superadmin', 'auditor');
r.use(readers);

const optText = (v, label, max) => {
  const s = String(v ?? '').trim();
  if (s.length > max) throw badRequest('{label} maksimal {max} karakter.', { label, max });
  return s || null;
};
const yearOf = (v) => {
  const y = Number(v ?? new Date().getFullYear());
  if (!Number.isInteger(y) || y < 2000 || y > 2100) throw badRequest('{label} tidak valid.', { label: 'Tahun' });
  return y;
};
const scale = (v, label) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw badRequest('{label} harus angka {min} sampai {max}.', { label, min: 1, max: 5 });
  return n;
};

// ---- Audit universe ----
// Setiap area dilengkapi audit terakhir (dari audit yang dikaitkan) dan jumlah audit.
const ENTITY_SQL = `
  SELECT e.id, e.name, e.kind, e.unit, e.owner, e.description, e.active, e.created_at, e.updated_at,
         (SELECT MAX(a.start_date) FROM audits a WHERE a.entity_id = e.id AND a.start_date <= CURRENT_DATE) AS last_audit,
         (SELECT COUNT(*) FROM audits a WHERE a.entity_id = e.id) AS audits
  FROM auditable_entities e`;

async function loadEntity(id) {
  const { rows } = await query(`${ENTITY_SQL} WHERE e.id = ?`, [id]);
  if (!rows[0]) throw notFound('Area audit tidak ditemukan.');
  return bools(rows[0], 'active');
}

function entityFields(b, partial) {
  const out = {};
  const has = (k) => b[k] !== undefined;
  if (!partial || has('name')) out.name = requireText(b.name, 'Nama area');
  if (!partial || has('kind')) out.kind = requireText(b.kind, 'Jenis area');
  if (has('unit')) out.unit = optText(b.unit, 'Unit', 150);
  if (has('owner')) out.owner = optText(b.owner, 'Pemilik proses', 150);
  if (has('description')) out.description = optText(b.description, 'Keterangan', 4000);
  if (has('active')) out.active = Boolean(b.active);
  if (out.name && out.name.length > 200) throw badRequest('{label} maksimal {max} karakter.', { label: 'Nama area', max: 200 });
  return out;
}

r.get('/entities', async (_req, res) => {
  const { rows } = await query(`${ENTITY_SQL} ORDER BY e.active DESC, e.kind, e.name`);
  res.json(rows.map((e) => bools(e, 'active')));
});

r.post('/entities', editors, async (req, res) => {
  const f = entityFields(req.body || {}, false);
  const { insertId } = await query(
    'INSERT INTO auditable_entities (name, kind, unit, owner, description, active, created_by) VALUES (?,?,?,?,?,?,?)',
    [f.name, f.kind, f.unit ?? null, f.owner ?? null, f.description ?? null, f.active ?? true, req.user.id]);
  await logActivity({ query }, req.user.id, 'create', 'entity', insertId, { title: f.name });
  res.status(201).json(await loadEntity(insertId));
});

r.patch('/entities/:id', editors, async (req, res) => {
  const id = intId(req.params.id);
  const cur = await loadEntity(id);
  const f = entityFields(req.body || {}, true);
  const keys = Object.keys(f);
  if (!keys.length) throw badRequest('Tidak ada perubahan.');
  await query(`UPDATE auditable_entities SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = NOW(3) WHERE id = ?`, [...keys.map((k) => f[k]), id]);
  const after = await loadEntity(id);
  const changes = changesOf(cur, after, keys);
  if (Object.keys(changes).length) await logActivity({ query }, req.user.id, 'update', 'entity', id, { title: cur.name, fields: Object.keys(changes), changes });
  res.json(after);
});

r.delete('/entities/:id', editors, async (req, res) => {
  const id = intId(req.params.id);
  const cur = await loadEntity(id);
  await query('DELETE FROM auditable_entities WHERE id = ?', [id]);
  await logActivity({ query }, req.user.id, 'delete', 'entity', id, { title: cur.name });
  res.json({ ok: true });
});

// ---- Penilaian risiko ----
// Semua area aktif dengan penilaian tahun itu, tingkat risiko, dan tahun audit berikutnya yang disarankan
// (audit terakhir + siklus sesuai tingkat risiko; area yang belum pernah diaudit disarankan tahun itu juga).
function withRisk(e, year) {
  const score = e.likelihood ? e.likelihood * e.impact : null;
  const level = score ? riskLevel(score) : null;
  const lastYear = e.last_audit ? Number(String(e.last_audit).slice(0, 4)) : null;
  const next = level ? (lastYear ? Math.max(year, lastYear + AUDIT_CYCLE[level]) : year) : null;
  return { ...e, score, level, next_audit_year: next, due: next !== null && next <= year };
}

r.get('/risks', async (req, res) => {
  const year = yearOf(req.query.year);
  const { rows } = await query(
    `SELECT e.id, e.name, e.kind, e.unit, e.owner, e.active,
            (SELECT MAX(a.start_date) FROM audits a WHERE a.entity_id = e.id AND a.start_date <= CURRENT_DATE) AS last_audit,
            ra.likelihood, ra.impact, ra.notes, ra.assessed_at, u.name AS assessed_by_name,
            (SELECT p.id FROM plan_items p WHERE p.entity_id = e.id AND p.year = ? AND p.cancelled = FALSE LIMIT 1) AS plan_item_id
     FROM auditable_entities e
     LEFT JOIN risk_assessments ra ON ra.entity_id = e.id AND ra.year = ?
     LEFT JOIN users u ON u.id = ra.assessed_by
     WHERE e.active = TRUE
     ORDER BY (ra.likelihood * ra.impact) IS NULL, ra.likelihood * ra.impact DESC, e.name`, [year, year]);
  res.json(rows.map((e) => withRisk(bools(e, 'active'), year)));
});

r.put('/risks/:entityId/:year', editors, async (req, res) => {
  const entityId = intId(req.params.entityId);
  const year = yearOf(req.params.year);
  const entity = await loadEntity(entityId);
  const likelihood = scale(req.body?.likelihood, 'Kemungkinan');
  const impact = scale(req.body?.impact, 'Dampak');
  const notes = optText(req.body?.notes, 'Alasan penilaian', 4000);
  const { rows: [before] } = await query('SELECT likelihood, impact FROM risk_assessments WHERE entity_id = ? AND year = ?', [entityId, year]);
  await query(
    `INSERT INTO risk_assessments (entity_id, year, likelihood, impact, notes, assessed_by) VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE likelihood = VALUES(likelihood), impact = VALUES(impact), notes = VALUES(notes),
       assessed_by = VALUES(assessed_by), assessed_at = NOW(3)`,
    [entityId, year, likelihood, impact, notes, req.user.id]);
  const score = likelihood * impact;
  const oldScore = before ? before.likelihood * before.impact : null;
  await logActivity({ query }, req.user.id, 'assess', 'risk', entityId, {
    title: `${entity.name} (${year})`,
    changes: oldScore === score ? {} : { score: [oldScore && `${oldScore} · ${riskLevel(oldScore)}`, `${score} · ${riskLevel(score)}`] },
  });
  res.json({ entity_id: entityId, year, likelihood, impact, notes, score, level: riskLevel(score) });
});

r.delete('/risks/:entityId/:year', editors, async (req, res) => {
  await query('DELETE FROM risk_assessments WHERE entity_id = ? AND year = ?', [intId(req.params.entityId), yearOf(req.params.year)]);
  res.json({ ok: true });
});

// ---- Rencana audit tahunan ----
// Status penugasan mengikuti audit yang dibuat dari rencana: Belum dimulai, status audit itu, atau Dibatalkan.
const ITEM_SQL = `
  SELECT p.id, p.year, p.entity_id, e.name AS entity_name, e.kind AS entity_kind, p.title, p.unit, p.type, p.quarter,
         p.lead_id, u.name AS lead_name, p.notes, p.cancelled, p.audit_id, a.code AS audit_code, a.status AS audit_status,
         ra.likelihood * ra.impact AS score
  FROM plan_items p
  LEFT JOIN auditable_entities e ON e.id = p.entity_id
  LEFT JOIN users u ON u.id = p.lead_id
  LEFT JOIN audits a ON a.id = p.audit_id
  LEFT JOIN risk_assessments ra ON ra.entity_id = p.entity_id AND ra.year = p.year`;

async function attachPlanMembers(items) {
  if (!items.length) return items;
  const { rows } = await query(
    `SELECT m.plan_item_id, m.user_id AS id, u.name, m.hours FROM plan_item_members m JOIN users u ON u.id = m.user_id
      WHERE m.plan_item_id IN (${items.map(() => '?').join(',')}) ORDER BY u.name`, items.map((i) => i.id));
  for (const i of items) {
    i.members = rows.filter((m) => m.plan_item_id === i.id).map(({ id, name, hours }) => ({ id, name, hours: Number(hours) }));
    i.hours = i.members.reduce((s, m) => s + m.hours, 0);
    i.level = i.score ? riskLevel(Number(i.score)) : null;
  }
  return items;
}

async function loadItem(id) {
  const { rows } = await query(`${ITEM_SQL} WHERE p.id = ?`, [id]);
  if (!rows[0]) throw notFound('Rencana audit tidak ditemukan.');
  return (await attachPlanMembers([bools(rows[0], 'cancelled')]))[0];
}

// members: [{ id, hours }] dari pengguna aktif yang bisa jadi tim audit.
async function planMembers(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw badRequest('Anggota tim harus berupa daftar.');
  const out = new Map();
  for (const m of value) {
    const hours = Number(m?.hours ?? 0);
    if (!Number.isInteger(hours) || hours < 0 || hours > 3000) throw badRequest('{label} harus angka {min} sampai {max}.', { label: 'Jam', min: 0, max: 3000 });
    out.set(intId(m?.id), hours);
  }
  const ids = [...out.keys()];
  if (ids.length) {
    const { rows } = await query(`SELECT id FROM users WHERE active = TRUE AND role IN ('auditor','superadmin','admin') AND id IN (${ids.map(() => '?').join(',')})`, ids);
    if (rows.length !== ids.length) throw badRequest('Alokasi hanya untuk auditor yang aktif.');
  }
  return [...out].map(([id, hours]) => ({ id, hours }));
}

async function itemFields(b, partial) {
  const out = {};
  const has = (k) => b[k] !== undefined;
  if (!partial || has('year')) out.year = yearOf(b.year);
  if (has('entity_id')) out.entity_id = b.entity_id ? intId(b.entity_id) : null;
  if (!partial || has('title')) out.title = requireText(b.title, 'Judul audit');
  if (!partial || has('unit')) out.unit = requireText(b.unit, 'Unit yang diaudit');
  if (!partial || has('type')) out.type = requireText(b.type, 'Jenis audit');
  if (!partial || has('quarter')) {
    out.quarter = Number(b.quarter);
    if (![1, 2, 3, 4].includes(out.quarter)) throw badRequest('{label} tidak valid.', { label: 'Triwulan' });
  }
  if (has('lead_id')) out.lead_id = b.lead_id ? intId(b.lead_id) : null;
  if (has('notes')) out.notes = optText(b.notes, 'Catatan', 4000);
  if (has('cancelled')) out.cancelled = Boolean(b.cancelled);
  if (has('audit_id')) out.audit_id = b.audit_id ? intId(b.audit_id) : null;
  if (out.entity_id) await loadEntity(out.entity_id);
  return out;
}

async function saveMembers(c, itemId, members) {
  await c.query('DELETE FROM plan_item_members WHERE plan_item_id = ?', [itemId]);
  for (const m of members) await c.query('INSERT INTO plan_item_members (plan_item_id, user_id, hours) VALUES (?,?,?)', [itemId, m.id, m.hours]);
}

// Rencana satu tahun: penugasan, ringkasan, dan beban jam per auditor dibanding kapasitas.
r.get('/plan', async (req, res) => {
  const year = yearOf(req.query.year);
  const items = await attachPlanMembers((await query(`${ITEM_SQL} WHERE p.year = ? ORDER BY p.quarter, p.title`, [year])).rows.map((i) => bools(i, 'cancelled')));
  const capacity = (await getSettings()).auditor_hours;
  const load = new Map();
  for (const i of items.filter((x) => !x.cancelled)) {
    for (const m of i.members) {
      const cur = load.get(m.id) || { id: m.id, name: m.name, hours: 0, items: 0 };
      cur.hours += m.hours;
      cur.items += 1;
      load.set(m.id, cur);
    }
  }
  const active = items.filter((i) => !i.cancelled);
  res.json({
    year,
    capacity,
    items,
    auditors: [...load.values()].sort((a, b) => b.hours - a.hours),
    summary: {
      planned: active.length,
      started: active.filter((i) => i.audit_id).length,
      done: active.filter((i) => i.audit_status === 'Selesai').length,
      cancelled: items.length - active.length,
      hours: active.reduce((s, i) => s + i.hours, 0),
    },
  });
});

r.post('/plan', editors, async (req, res) => {
  const f = await itemFields(req.body || {}, false);
  const members = (await planMembers(req.body?.members)) || [];
  const id = await tx(async (c) => {
    const { insertId } = await c.query(
      'INSERT INTO plan_items (year, entity_id, title, unit, type, quarter, lead_id, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?)',
      [f.year, f.entity_id ?? null, f.title, f.unit, f.type, f.quarter, f.lead_id ?? null, f.notes ?? null, req.user.id]);
    await saveMembers(c, insertId, members);
    await logActivity(c, req.user.id, 'create', 'plan', insertId, { title: `${f.title} (${f.year})` });
    return insertId;
  });
  res.status(201).json(await loadItem(id));
});

r.patch('/plan/:id', editors, async (req, res) => {
  const id = intId(req.params.id);
  const cur = await loadItem(id);
  const f = await itemFields(req.body || {}, true);
  const members = await planMembers(req.body?.members);
  const keys = Object.keys(f);
  if (!keys.length && members === undefined) throw badRequest('Tidak ada perubahan.');
  await tx(async (c) => {
    if (keys.length) await c.query(`UPDATE plan_items SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => f[k]), id]);
    if (members !== undefined) await saveMembers(c, id, members);
  });
  const after = await loadItem(id);
  const changes = changesOf(cur, after, keys.filter((k) => !['lead_id', 'entity_id', 'audit_id'].includes(k)));
  if (cur.lead_id !== after.lead_id) changes.lead = [cur.lead_name ?? null, after.lead_name ?? null];
  if (cur.hours !== after.hours) changes.hours = [cur.hours, after.hours];
  if (Object.keys(changes).length) await logActivity({ query }, req.user.id, 'update', 'plan', id, { title: `${cur.title} (${cur.year})`, changes });
  res.json(after);
});

r.delete('/plan/:id', editors, async (req, res) => {
  const id = intId(req.params.id);
  const cur = await loadItem(id);
  await query('DELETE FROM plan_items WHERE id = ?', [id]);
  await logActivity({ query }, req.user.id, 'delete', 'plan', id, { title: `${cur.title} (${cur.year})` });
  res.json({ ok: true });
});

export { loadItem as loadPlanItem };
export default r;
