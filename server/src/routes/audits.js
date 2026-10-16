import { Router } from 'express';
import { query, tx, logActivity, changesOf } from '../db.js';
import { requireRole, canEditAudit } from '../auth.js';
import { badRequest, notFound, forbidden, requireText, oneOf, dateOrNull, intId, N_ } from '../errors.js';
import { AUDIT_STATUS, STEP_RESULTS } from '../constants.js';
import { getSettings } from '../settings.js';
import { auditScope, findingScope, sameUnit, seesAllUnits, canApproveFor, ownCompany } from '../access.js';
import { notify, auditTeam } from '../notify.js';
import { nextCode } from '../codes.js';
import { removeFilesOf, ATTACHMENT_COLS } from '../files.js';
import { parseTemplate } from './templates.js';
import { signApproval } from '../esign.js';
import bcrypt from 'bcryptjs';

const r = Router();
const editors = requireRole('admin', 'superadmin', 'auditor');

const LIST_SQL = `
  SELECT a.id, a.code, a.title, a.unit, a.company, a.type, a.lead_id, u.name AS lead_name, a.team,
         a.start_date, a.end_date, a.status, a.scope, a.created_by, a.created_at, a.updated_at,
         a.approver_id, ap.name AS approver_name, ap.role AS approver_role, a.approval,
         a.entity_id, en.name AS entity_name, (SELECT p.id FROM plan_items p WHERE p.audit_id = a.id LIMIT 1) AS plan_item_id,
         (SELECT COUNT(*) FROM audit_steps s WHERE s.audit_id = a.id) AS steps_total,
         (SELECT COUNT(*) FROM audit_steps s WHERE s.audit_id = a.id AND s.result <> 'Belum diuji') AS steps_done,
         (SELECT COUNT(*) FROM findings f WHERE f.audit_id = a.id AND f.kind = 'temuan') AS findings_total,
         (SELECT COUNT(*) FROM findings f WHERE f.audit_id = a.id AND f.kind = 'temuan' AND f.status <> 'Selesai') AS findings_open,
         (SELECT COUNT(*) FROM findings f WHERE f.audit_id = a.id AND f.kind = 'isu') AS issues_total,
         (SELECT COUNT(*) FROM findings f WHERE f.audit_id = a.id AND f.kind = 'isu' AND f.status <> 'Selesai') AS issues_open
  FROM audits a LEFT JOIN users u ON u.id = a.lead_id LEFT JOIN users ap ON ap.id = a.approver_id
  LEFT JOIN auditable_entities en ON en.id = a.entity_id`;

const STEP_COLS = 's.id, s.position, s.text, s.result, s.note, s.updated_at, s.reviewed_by, s.reviewed_at, rv.name AS reviewer_name';
const STEP_FROM = 'FROM audit_steps s LEFT JOIN users rv ON rv.id = s.reviewed_by';

// Selama laporan menunggu persetujuan atau sudah disetujui, isi audit tidak bisa diubah.
export const LOCKED = ['persetujuan', 'disetujui'];
export function assertUnlocked(audit) {
  if (LOCKED.includes(audit.approval)) {
    throw badRequest('Laporan audit ini sedang menunggu persetujuan atau sudah disetujui. Minta penyetuju mengembalikannya dulu bila perlu diubah.');
  }
}

// types: jenis audit yang diizinkan (dari pengaturan), ditambah jenis lama audit itu saat diubah.
function auditFields(b, partial, types) {
  const out = {};
  const has = (k) => b[k] !== undefined;
  if (!partial || has('title')) out.title = requireText(b.title, 'Judul audit');
  if (!partial || has('unit')) out.unit = requireText(b.unit, 'Unit yang diaudit');
  if (!partial || has('type')) out.type = oneOf(b.type, types, 'Jenis audit');
  if (has('status')) out.status = oneOf(b.status, AUDIT_STATUS, 'Status');
  if (has('lead_id')) out.lead_id = b.lead_id ? intId(b.lead_id) : null;
  if (has('approver_id')) out.approver_id = b.approver_id ? intId(b.approver_id) : null;
  if (has('entity_id')) out.entity_id = b.entity_id ? intId(b.entity_id) : null;
  if (has('company')) out.company = String(b.company || '').trim() || null;
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

// Penyetuju harus akun aktif: Manajemen, atau auditee di unit yang diaudit.
async function checkApprover(id, unit, company = null) {
  if (!id) return;
  const { rows } = await query('SELECT id, role, unit, company, active FROM users WHERE id = ?', [id]);
  if (!rows[0] || !Number(rows[0].active) || !canApproveFor(rows[0], unit)) {
    throw badRequest('Penyetuju harus akun Manajemen atau kepala unit yang diaudit.');
  }
  if (!canApproveFor(rows[0], unit, company)) throw badRequest('Penyetuju harus dari perusahaan yang sama dengan audit ({name}).', { name: company });
}

// Multi-entitas: perusahaan audit harus dari daftar, wajib diisi bila daftarnya ada,
// dan pengguna yang terikat perusahaan hanya bisa memakai perusahaannya sendiri.
function checkCompany(user, settings, company) {
  if (!settings.multi_entity) return null;
  const c = company ?? null;
  if (!c) {
    if (settings.companies.length) throw badRequest('{label} wajib diisi.', { label: 'Perusahaan' });
    return null;
  }
  if (!settings.companies.includes(c)) throw badRequest('Perusahaan {name} tidak ada di daftar perusahaan.', { name: c });
  const own = ownCompany(user);
  if (own && own !== c) throw badRequest('Anda hanya bisa memakai perusahaan Anda sendiri ({name}) untuk audit.', { name: own });
  return c;
}

async function checkEntity(id) {
  if (!id) return;
  const { rowCount } = await query('SELECT 1 FROM auditable_entities WHERE id = ?', [id]);
  if (!rowCount) throw badRequest('Area audit tidak ditemukan.');
}

async function saveMembers(db, auditId, ids) {
  await db.query('DELETE FROM audit_members WHERE audit_id = ?', [auditId]);
  for (const uid of ids) await db.query('INSERT INTO audit_members (audit_id, user_id) VALUES (?,?)', [auditId, uid]);
}

// Pengguna yang terikat unit hanya bisa membuat audit untuk unitnya sendiri, atau memindahkannya ke unitnya.
function assertOwnUnit(user, unit) {
  if (seesAllUnits(user) || sameUnit(user, unit)) return;
  throw badRequest('Anda hanya bisa memakai unit Anda sendiri ({unit}) untuk audit.', { unit: String(user.unit).trim() });
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
  const settings = await getSettings();
  const f = auditFields(req.body || {}, false, settings.audit_types);
  assertOwnUnit(req.user, f.unit);
  await checkEntity(f.entity_id);
  if (f.status === 'Selesai' && (await getSettings()).approval_required) throw badRequest('Audit baru bisa Selesai setelah laporannya disetujui.');
  const templateId = req.body?.template_id ? intId(req.body.template_id) : null;
  // Audit yang dibuat dari rencana tahunan: rencana itu dikaitkan ke audit baru, dan area audit ikut terisi.
  const planItemId = req.body?.plan_item_id ? intId(req.body.plan_item_id) : null;
  if (planItemId) {
    const { rows: [item] } = await query('SELECT entity_id, audit_id, cancelled FROM plan_items WHERE id = ?', [planItemId]);
    if (!item) throw badRequest('Rencana audit tidak ditemukan.');
    if (item.audit_id) throw badRequest('Rencana ini sudah punya audit.');
    if (Number(item.cancelled)) throw badRequest('Rencana ini sudah dibatalkan.');
    if (f.entity_id === undefined) f.entity_id = item.entity_id;
    if (f.company === undefined) f.company = item.company;
  }
  // Tanpa pilihan, audit baru memakai perusahaan pengguna atau perusahaan yang sedang dipilih di bilah atas.
  f.company = checkCompany(req.user, settings, f.company ?? ownCompany(req.user) ?? req.user.view_company);
  await checkApprover(f.approver_id, f.unit, f.company);
  const members = await memberIds(req.body?.member_ids);
  const id = await tx(async (c) => {
    const code = await nextCode(c, 'AUD');
    const { insertId } = await c.query(
      `INSERT INTO audits (code, title, unit, company, type, status, lead_id, approver_id, entity_id, team, scope, start_date, end_date, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [code, f.title, f.unit, f.company, f.type, f.status || 'Perencanaan', f.lead_id ?? null, f.approver_id ?? null, f.entity_id ?? null, f.team ?? null, f.scope ?? null,
        f.start_date ?? null, f.end_date ?? null, req.user.id],
    );
    if (planItemId) await c.query('UPDATE plan_items SET audit_id = ? WHERE id = ? AND audit_id IS NULL', [insertId, planItemId]);
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
  // Auditee hanya melihat temuan miliknya, bukan kertas kerja auditor, kecuali ia penyetuju laporan audit ini.
  const workPapers = req.user.role !== 'auditee' || audit.approver_id === req.user.id;
  const steps = !workPapers ? [] :
    (await query(`SELECT ${STEP_COLS} ${STEP_FROM} WHERE s.audit_id = ? ORDER BY s.position, s.id`, [id])).rows;
  const fs = findingScope(req.user, 'f', 'a');
  const findings = (await query(
    `SELECT f.id, f.code, f.kind, f.title, f.risk, f.status, f.due_date, f.owner_id, u.name AS owner_name, f.step_id, f.category, f.root_cause,
            f.\`condition\`, f.criteria, f.cause, f.effect, f.recommendation, f.response, f.reviewed_by, f.reviewed_at, rv.name AS reviewer_name
     FROM findings f JOIN audits a ON a.id = f.audit_id LEFT JOIN users u ON u.id = f.owner_id LEFT JOIN users rv ON rv.id = f.reviewed_by
     WHERE f.audit_id = ? AND ${fs.sql} ORDER BY f.code`, [id, ...fs.params])).rows;
  const attachments = !workPapers ? [] : (await query(
    `SELECT ${ATTACHMENT_COLS} FROM attachments t LEFT JOIN users u ON u.id = t.uploaded_by
     WHERE t.audit_id = ? AND t.finding_id IS NULL AND t.superseded_by IS NULL ORDER BY COALESCE(t.root_id, t.id)`, [id])).rows;
  const approvals = (await query(
    `SELECT p.id, p.user_id, p.action, p.note, p.created_at, p.sign_code, p.signature, u.name AS user_name FROM audit_approvals p
     LEFT JOIN users u ON u.id = p.user_id WHERE p.audit_id = ? ORDER BY p.id`, [id])).rows;
  res.json({ ...audit, steps, findings, attachments, approvals });
});

r.patch('/:id', editors, async (req, res) => {
  const id = intId(req.params.id);
  const cur = await loadAudit(req.user, id);
  const f = auditFields(req.body || {}, true, [...(await getSettings()).audit_types, cur.type]);
  if (f.unit !== undefined && !sameUnit({ unit: cur.unit }, f.unit)) assertOwnUnit(req.user, f.unit);
  const settings = await getSettings();
  if (f.company !== undefined) {
    if (!settings.multi_entity) delete f.company;
    else if (f.company !== cur.company) f.company = checkCompany(req.user, settings, f.company);
  }
  const members = await memberIds(req.body?.member_ids);
  const keys = Object.keys(f);
  if (!keys.length && members === undefined) throw badRequest('Tidak ada perubahan.');
  if (f.approver_id !== undefined || f.unit !== undefined || f.company !== undefined) {
    const approver = f.approver_id !== undefined ? f.approver_id : cur.approver_id;
    const company = f.company !== undefined ? f.company : cur.company;
    if (approver !== cur.approver_id || !sameUnit({ unit: cur.unit }, f.unit ?? cur.unit) || company !== cur.company) {
      await checkApprover(approver, f.unit ?? cur.unit, settings.multi_entity ? company : null);
    }
  }
  await checkEntity(f.entity_id);
  if (f.status === 'Selesai' && cur.status !== 'Selesai' && settings.approval_required && cur.approval !== 'disetujui') {
    throw badRequest('Audit baru bisa Selesai setelah laporannya disetujui.');
  }
  // Saat terkunci, yang boleh berubah hanya status audit.
  const sameIds = (x, y) => [...x].sort().join() === [...y].sort().join();
  const touched = keys.some((k) => k !== 'status' && String(f[k] ?? '') !== String(cur[k] ?? ''))
    || (members !== undefined && !sameIds(members, cur.members.map((m) => m.id)));
  if (touched) assertUnlocked(cur);
  await tx(async (c) => {
    await c.query(
      `UPDATE audits SET ${keys.map((k) => `${k} = ?, `).join('')}updated_at = NOW(3) WHERE id = ?`,
      [...keys.map((k) => f[k]), id],
    );
    if (members !== undefined) await saveMembers(c, id, members);
  });
  const after = await loadAudit(req.user, id);
  const changes = changesOf(cur, after, keys.filter((k) => !['lead_id', 'approver_id', 'entity_id'].includes(k)));
  if (cur.entity_id !== after.entity_id) changes.entity = [cur.entity_name ?? null, after.entity_name ?? null];
  if (cur.lead_id !== after.lead_id) changes.lead = [cur.lead_name ?? null, after.lead_name ?? null];
  if (cur.approver_id !== after.approver_id) changes.approver = [cur.approver_name ?? null, after.approver_name ?? null];
  if (members !== undefined) {
    const names = (a) => a.members.map((m) => m.name).join(', ') || null;
    if (names(cur) !== names(after)) changes.members = [names(cur), names(after)];
  }
  if (Object.keys(changes).length) {
    await logActivity({ query }, req.user.id, 'update', 'audit', id, { code: cur.code, title: cur.title, fields: Object.keys(changes), changes });
  }
  res.json(after);
});

r.delete('/:id', editors, async (req, res) => {
  const id = intId(req.params.id);
  const { code } = await loadAudit(req.user, id);
  await removeFilesOf('t.audit_id = ? OR t.finding_id IN (SELECT id FROM findings WHERE audit_id = ?)', [id, id]);
  await query('DELETE FROM audits WHERE id = ?', [id]);
  await logActivity({ query }, req.user.id, 'delete', 'audit', id, { code });
  res.json({ ok: true });
});

// ---- Langkah program kerja ----
async function loadStep(auditId, stepId) {
  const { rows } = await query(`SELECT ${STEP_COLS} ${STEP_FROM} WHERE s.id = ? AND s.audit_id = ?`, [stepId, auditId]);
  if (!rows[0]) throw notFound('Langkah tidak ditemukan.');
  return rows[0];
}

r.post('/:id/steps', editors, async (req, res) => {
  const id = intId(req.params.id);
  const text = requireText(req.body?.text, 'Langkah pengujian');
  assertUnlocked(await loadAudit(req.user, id));
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
  assertUnlocked(await loadAudit(req.user, id));
  const before = await loadStep(id, stepId);
  // Langkah yang isinya berubah harus direview ulang oleh ketua tim.
  const changed = (b.text !== undefined && String(b.text).trim() !== before.text) || (b.result !== undefined && b.result !== before.result)
    || (b.note !== undefined && String(b.note) !== before.note);
  if (changed) sets.push('reviewed_by = NULL, reviewed_at = NULL');
  await query(`UPDATE audit_steps SET ${sets.join(', ')}, updated_at = NOW(3) WHERE id = ? AND audit_id = ?`, [...params, stepId, id]);
  res.json(await loadStep(id, stepId));
});

r.delete('/:id/steps/:stepId', editors, async (req, res) => {
  assertUnlocked(await loadAudit(req.user, intId(req.params.id)));
  const { rowCount } = await query('DELETE FROM audit_steps WHERE id = ? AND audit_id = ?', [intId(req.params.stepId), intId(req.params.id)]);
  if (!rowCount) throw notFound('Langkah tidak ditemukan.');
  res.json({ ok: true });
});

// ---- Review ketua tim (sign-off kertas kerja) ----
const isLead = (user, audit) => audit.lead_id && audit.lead_id === user.id;

function assertLead(user, audit) {
  if (!isLead(user, audit)) throw forbidden('Hanya ketua tim audit ini yang bisa mereview.');
  assertUnlocked(audit);
}

r.post('/:id/steps/:stepId/review', async (req, res) => {
  const id = intId(req.params.id);
  const stepId = intId(req.params.stepId);
  assertLead(req.user, await loadAudit(req.user, id));
  const step = await loadStep(id, stepId);
  if (req.body?.reviewed !== false && step.result === 'Belum diuji') throw badRequest('Langkah yang belum diuji belum bisa direview.');
  await query(
    req.body?.reviewed === false ? 'UPDATE audit_steps SET reviewed_by = NULL, reviewed_at = NULL WHERE id = ?'
      : 'UPDATE audit_steps SET reviewed_by = ?, reviewed_at = NOW(3) WHERE id = ?',
    req.body?.reviewed === false ? [stepId] : [req.user.id, stepId]);
  res.json(await loadStep(id, stepId));
});

// Menandai semua langkah yang sudah diuji dan semua temuan sebagai sudah direview.
r.post('/:id/review-all', async (req, res) => {
  const id = intId(req.params.id);
  const audit = await loadAudit(req.user, id);
  assertLead(req.user, audit);
  const s = await query("UPDATE audit_steps SET reviewed_by = ?, reviewed_at = NOW(3) WHERE audit_id = ? AND reviewed_by IS NULL AND result <> 'Belum diuji'", [req.user.id, id]);
  const f = await query('UPDATE findings SET reviewed_by = ?, reviewed_at = NOW(3) WHERE audit_id = ? AND reviewed_by IS NULL', [req.user.id, id]);
  await logActivity({ query }, req.user.id, 'review', 'audit', id, { code: audit.code, title: audit.title, steps: s.rowCount, findings: f.rowCount });
  res.json({ steps: s.rowCount, findings: f.rowCount });
});

// Berapa langkah dan temuan yang belum direview ketua tim.
async function unreviewed(auditId) {
  const { rows: [st] } = await query("SELECT COUNT(*) AS n FROM audit_steps WHERE audit_id = ? AND result <> 'Belum diuji' AND reviewed_by IS NULL", [auditId]);
  const { rows: [fi] } = await query('SELECT COUNT(*) AS n FROM findings WHERE audit_id = ? AND reviewed_by IS NULL', [auditId]);
  return { steps: Number(st.n), findings: Number(fi.n) };
}

// ---- Persetujuan berjenjang ----
// Alur: tim audit mengajukan → ketua tim mereview dan meneruskan → penyetuju (Manager atau Kepala unit) menyetujui.
// Bila yang mengajukan adalah ketua tim, laporan langsung diteruskan ke penyetuju.
// Ketua tim atau penyetuju bisa mengembalikan dengan catatan; penyetuju juga bisa membuka kembali laporan yang sudah disetujui.
const ACTIONS = ['ajukan', 'teruskan', 'setujui', 'kembalikan', 'tarik'];

r.post('/:id/approval', async (req, res) => {
  const id = intId(req.params.id);
  const audit = await loadAudit(req.user, id);
  const action = oneOf(req.body?.action, ACTIONS, 'Tindakan');
  const note = String(req.body?.note || '').trim().slice(0, 2000) || null;
  const settings = await getSettings();
  const state = audit.approval;
  const me = req.user;
  const link = `/audit/${id}`;
  const vars = { code: audit.code, title: audit.title, user: me.name };

  const assertReviewed = async () => {
    if (!settings.review_required) return;
    const u = await unreviewed(id);
    if (u.steps || u.findings) {
      throw badRequest('Masih ada {steps} langkah dan {findings} temuan atau isu yang belum direview ketua tim.', u);
    }
  };

  let next;
  let status = null;
  if (action === 'ajukan') {
    if (!canEditAudit(me)) throw forbidden();
    if (state && state !== 'dikembalikan') throw badRequest('Laporan audit ini sudah diajukan.');
    if (!audit.lead_id) throw badRequest('Tentukan ketua tim dulu di Ubah audit.');
    if (!audit.approver_id) throw badRequest('Pilih penyetuju dulu di Ubah audit.');
    if (isLead(me, audit)) {
      await assertReviewed();
      next = 'persetujuan';
    } else next = 'review';
    if (audit.status !== 'Selesai') status = 'Pelaporan';
  } else if (action === 'teruskan') {
    if (state !== 'review') throw badRequest('Laporan audit ini tidak sedang menunggu review.');
    if (!isLead(me, audit)) throw forbidden('Hanya ketua tim audit ini yang bisa mereview.');
    await assertReviewed();
    next = 'persetujuan';
  } else if (action === 'setujui') {
    if (state !== 'persetujuan') throw badRequest('Laporan audit ini tidak sedang menunggu persetujuan.');
    if (audit.approver_id !== me.id) throw forbidden('Hanya penyetuju audit ini yang bisa menyetujui.');
    next = 'disetujui';
    status = 'Selesai';
  } else if (action === 'kembalikan') {
    const allowed = (state === 'review' && isLead(me, audit)) || (['persetujuan', 'disetujui'].includes(state) && audit.approver_id === me.id);
    if (!allowed) throw forbidden('Anda tidak bisa mengembalikan laporan audit ini sekarang.');
    if (!note) throw badRequest('Tulis alasan laporan dikembalikan.');
    next = 'dikembalikan';
    if (state === 'disetujui' && audit.status === 'Selesai') status = 'Pelaporan';
  } else {
    // tarik: tim audit menarik kembali pengajuan yang belum disetujui.
    if (!canEditAudit(me)) throw forbidden();
    if (!['review', 'persetujuan'].includes(state)) throw badRequest('Tidak ada pengajuan yang bisa ditarik.');
    next = null;
  }

  // Ketua tim menandatangani saat meneruskan ke penyetuju, penyetuju saat menyetujui.
  const signs = next === 'persetujuan' || next === 'disetujui';
  if (signs && settings.esign_required) {
    const { rows: [u] } = await query('SELECT signature, password_hash FROM users WHERE id = ?', [me.id]);
    if (!u?.signature) throw badRequest('Buat tanda tangan Anda dulu di halaman Akun saya.');
    if (!req.body?.password || !(await bcrypt.compare(String(req.body.password), u.password_hash || ''))) {
      throw badRequest('Masukkan kata sandi Anda dengan benar untuk menandatangani.');
    }
  }

  await tx(async (c) => {
    await c.query(`UPDATE audits SET approval = ?${status ? ', status = ?' : ''}, updated_at = NOW(3) WHERE id = ?`, status ? [next, status, id] : [next, id]);
    const { insertId } = await c.query('INSERT INTO audit_approvals (audit_id, user_id, action, note) VALUES (?,?,?,?)', [id, me.id, action, note]);
    if (signs) await signApproval(c, insertId, id, me);
    await logActivity(c, me.id, action, 'approval', id, { code: audit.code, title: audit.title, note, changes: { approval: [state, next] } });
    if (next === 'review') await notify(c, [audit.lead_id], N_('{user} mengajukan laporan audit {code} untuk direview.'), vars, link, me.id);
    if (next === 'persetujuan') await notify(c, [audit.approver_id], N_('Laporan audit {code} menunggu persetujuan Anda.'), vars, link, me.id);
    if (next === 'disetujui') await notify(c, await auditTeam(c, id), N_('Laporan audit {code} disetujui oleh {user}.'), vars, link, me.id);
    if (next === 'dikembalikan') await notify(c, await auditTeam(c, id), N_('Laporan audit {code} dikembalikan oleh {user}: {note}'), { ...vars, note }, link, me.id);
  });
  res.json(await loadAudit(req.user, id));
});

export { loadAudit };
export default r;
