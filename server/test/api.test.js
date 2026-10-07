// Uji API end-to-end terhadap database MySQL/MariaDB sungguhan.
// Jalankan: TEST_DATABASE_URL=mysql://user:pass@localhost:3306/jejak_audit_test npm test
// PERHATIAN: semua tabel di database tes dihapus setiap kali tes jalan.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const dbUrl = process.env.TEST_DATABASE_URL || 'mysql://root:@localhost:3306/jejak_audit_test';
process.env.DATABASE_URL = dbUrl;
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jejak-up-'));
process.env.ADMIN_EMAIL = 'admin@contoh.id';
process.env.ADMIN_PASSWORD = 'rahasia-admin-1';
process.env.INFRA_USERNAME = 'infra';
process.env.INFRA_PASSWORD = 'rahasia-infra-1';

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');

let server;
let base;

function client() {
  let cookie = '';
  const call = async (method, url, body, { raw } = {}) => {
    const headers = { 'x-requested-with': 'jejak' };
    if (cookie) headers.cookie = cookie;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + url, { method, headers, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    if (raw) return res;
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };
  return {
    get: (u, o) => call('GET', u, undefined, o),
    post: (u, b) => call('POST', u, b),
    patch: (u, b) => call('PATCH', u, b),
    del: (u) => call('DELETE', u),
  };
}

before(async () => {
  // Kosongkan database tes: hapus semua tabel.
  const [tables] = await pool.query('SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()');
  const conn = await pool.getConnection();
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const { t } of tables) await conn.query(`DROP TABLE \`${t}\``);
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  conn.release();
  await migrate();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await pool.end();
});

const admin = client();
const auditor = client();
const auditee = client();
const other = client();
const ctx = {};

test('login admin dan menolak kata sandi salah', async () => {
  assert.equal((await admin.post('/api/auth/login', { email: 'admin@contoh.id', password: 'salah' })).status, 401);
  const r = await admin.post('/api/auth/login', { email: 'ADMIN@contoh.id', password: 'rahasia-admin-1' });
  assert.equal(r.status, 200);
  assert.equal(r.data.role, 'admin');
  assert.equal(r.data.username, 'admin');
  assert.equal((await client().get('/api/audits')).status, 401);
});

test('login dengan username dan opsi ingat saya', async () => {
  const c = client();
  const plain = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'jejak' },
    body: JSON.stringify({ username: 'Admin', password: 'rahasia-admin-1' }),
  });
  assert.equal(plain.status, 200);
  assert.doesNotMatch(plain.headers.get('set-cookie'), /Max-Age|Expires/i, 'cookie hanya untuk sesi browser');
  const kept = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'jejak' },
    body: JSON.stringify({ username: 'admin', password: 'rahasia-admin-1', remember: true }),
  });
  assert.doesNotMatch(kept.headers.get('set-cookie'), /Max-Age|Expires/i, 'ingat saya pun berakhir saat browser ditutup');
  const [rows] = await pool.query('SELECT remember, ROUND(TIMESTAMPDIFF(SECOND, created_at, expires_at) / 3600) AS h FROM sessions ORDER BY created_at DESC, remember DESC LIMIT 2');
  assert.deepEqual(rows.map((x) => [Boolean(x.remember), Number(x.h)]).sort(), [[false, 2], [true, 168]]);
  assert.equal((await c.post('/api/auth/login', { username: 'admin', password: 'salah' })).status, 401);
});

test('admin membuat pengguna untuk setiap peran', async () => {
  const mk = async (name, email, role, unit) => {
    const r = await admin.post('/api/users', { name, username: name.toLowerCase(), email, role, unit, password: 'katasandi123' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return r.data.id;
  };
  ctx.auditorId = await mk('Radipta', 'radipta@contoh.id', 'auditor');
  ctx.auditeeId = await mk('Budi', 'budi@contoh.id', 'auditee', 'Divisi Pengadaan');
  ctx.otherId = await mk('Sari', 'sari@contoh.id', 'auditee', 'Divisi Keuangan');
  assert.equal((await admin.post('/api/users', { name: 'X', username: 'x1', email: 'budi@contoh.id', role: 'auditor', password: 'katasandi123' })).status, 400);
  assert.equal((await admin.post('/api/users', { name: 'X', username: 'budi', email: 'x@contoh.id', role: 'auditor', password: 'katasandi123' })).status, 400);
  assert.equal((await admin.post('/api/users', { name: 'X', username: 'xx', email: 'x@contoh.id', role: 'auditee', password: 'katasandi123' })).status, 400, 'auditee wajib punya unit');
  assert.equal((await admin.post('/api/users', { name: 'X', username: 'a b', email: 'x@contoh.id', role: 'auditor', password: 'katasandi123' })).status, 400);
  await auditor.post('/api/auth/login', { username: 'radipta', password: 'katasandi123' });
  await auditee.post('/api/auth/login', { email: 'budi@contoh.id', password: 'katasandi123' });
  await other.post('/api/auth/login', { email: 'sari@contoh.id', password: 'katasandi123' });
  assert.equal((await auditor.post('/api/users', { name: 'Y', email: 'y@contoh.id', role: 'admin', password: 'katasandi123' })).status, 403);
});

test('auditor membuat audit dari template dan mengisi program kerja', async () => {
  const templates = (await auditor.get('/api/templates')).data;
  const tpl = templates.find((t) => t.name === 'Pengadaan');
  const r = await auditor.post('/api/audits', {
    title: 'Audit Pengadaan', unit: 'Divisi Pengadaan', type: 'Pengadaan', lead_id: ctx.auditorId,
    start_date: '2026-09-01', end_date: '2026-10-30', template_id: tpl.id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.match(r.data.code, /^AUD-\d{4}-001$/);
  assert.equal(r.data.steps_total, 5);
  ctx.auditId = r.data.id;
  const second = await auditor.post('/api/audits', { title: 'Audit Kas', unit: 'Divisi Keuangan', type: 'Keuangan' });
  assert.match(second.data.code, /-002$/);
  ctx.audit2 = second.data.id;
  assert.equal((await auditor.post('/api/audits', { title: 'X', unit: 'Y', type: 'Bukan jenis' })).status, 400);
  assert.equal((await auditor.post('/api/audits', { title: 'X', unit: 'Y', type: 'Keuangan', start_date: '2026-10-10', end_date: '2026-10-01' })).status, 400);

  const detail = (await auditor.get(`/api/audits/${ctx.auditId}`)).data;
  ctx.stepId = detail.steps[1].id;
  const s = await auditor.patch(`/api/audits/${ctx.auditId}/steps/${ctx.stepId}`, { result: 'Tidak sesuai', note: '3 dari 8 PO tanpa 3 penawaran' });
  assert.equal(s.data.result, 'Tidak sesuai');
  const added = await auditor.post(`/api/audits/${ctx.auditId}/steps`, { text: 'Langkah tambahan' });
  assert.equal(added.data.position, 5);
  assert.equal((await auditor.del(`/api/audits/${ctx.auditId}/steps/${added.data.id}`)).status, 200);
  assert.equal((await auditee.post(`/api/audits/${ctx.auditId}/steps`, { text: 'X' })).status, 403);
});

test('auditor mencatat temuan dengan PIC', async () => {
  const r = await auditor.post('/api/findings', {
    audit_id: ctx.auditId, step_id: ctx.stepId, title: 'PO tanpa tiga penawaran', risk: 'Tinggi',
    condition: 'Kondisi', criteria: 'SOP', owner_id: ctx.auditeeId, due_date: '2020-01-01',
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.match(r.data.code, /^TMN-\d{4}-001$/);
  assert.equal(r.data.overdue, true);
  ctx.findingId = r.data.id;
  const r2 = await auditor.post('/api/findings', { audit_id: ctx.audit2, title: 'Kas kecil', risk: 'Rendah' });
  ctx.finding2 = r2.data.id;
  assert.equal((await auditor.post('/api/findings', { audit_id: ctx.audit2, step_id: ctx.stepId, title: 'X', risk: 'Rendah' })).status, 400);
});

test('auditee hanya melihat temuan unitnya dan hanya bisa menanggapi', async () => {
  const mine = (await auditee.get('/api/findings')).data;
  assert.deepEqual(mine.map((f) => f.id), [ctx.findingId]);
  assert.equal((await auditee.get(`/api/findings/${ctx.finding2}`)).status, 404);
  assert.equal((await other.get(`/api/findings/${ctx.findingId}`)).status, 404);
  const audits = (await auditee.get('/api/audits')).data;
  assert.deepEqual(audits.map((a) => a.id), [ctx.auditId]);
  assert.deepEqual((await auditee.get(`/api/audits/${ctx.auditId}`)).data.steps, []);

  assert.equal((await auditee.patch(`/api/findings/${ctx.findingId}`, { status: 'Selesai' })).status, 400);
  assert.equal((await auditee.patch(`/api/findings/${ctx.findingId}`, { risk: 'Rendah' })).status, 403);
  const u = await auditee.patch(`/api/findings/${ctx.findingId}`, { response: 'Setuju', status: 'Dalam proses' });
  assert.equal(u.status, 200);
  assert.equal(u.data.status, 'Dalam proses');
  assert.equal((await auditee.post(`/api/findings/${ctx.findingId}/logs`, { text: 'SOP direvisi' })).status, 201);
  const detail = (await auditee.get(`/api/findings/${ctx.findingId}`)).data;
  assert.equal(detail.logs.length, 3);
  assert.equal(detail.logs[0].text, 'SOP direvisi');
});

test('unggah dan unduh bukti dengan pemeriksaan akses', async () => {
  const fd = new FormData();
  fd.append('file', new Blob(['%PDF-1.4 bukti'], { type: 'application/pdf' }), 'Berita acara ü.pdf');
  const up = await auditee.post(`/api/findings/${ctx.findingId}/attachments`, fd);
  assert.equal(up.status, 201, JSON.stringify(up.data));
  assert.equal(up.data.filename, 'Berita acara ü.pdf');
  const dl = await auditor.get(`/api/attachments/${up.data.id}`, { raw: true });
  assert.equal(dl.status, 200);
  assert.equal(await dl.text(), '%PDF-1.4 bukti');
  assert.equal((await other.get(`/api/attachments/${up.data.id}`, { raw: true })).status, 404);

  const bad = new FormData();
  bad.append('file', new Blob(['x'], { type: 'application/x-msdownload' }), 'virus.exe');
  assert.equal((await auditee.post(`/api/findings/${ctx.findingId}/attachments`, bad)).status, 400);
  assert.equal((await auditee.del(`/api/attachments/${up.data.id}`)).status, 200);
});

test('ringkasan dan log aktivitas', async () => {
  const d = (await admin.get('/api/dashboard')).data;
  assert.equal(d.audits.reduce((s, x) => s + x.n, 0), 2);
  assert.equal(d.findings.reduce((s, x) => s + x.overdue, 0), 1);
  const scoped = (await auditee.get('/api/dashboard')).data;
  assert.equal(scoped.findings.reduce((s, x) => s + x.n, 0), 1);
  const act = await admin.get('/api/dashboard/activity');
  assert.ok(act.data.length >= 5);
  assert.equal((await auditee.get('/api/dashboard/activity')).status, 403);
});

test('permintaan tanpa header aplikasi ditolak', async () => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
});

test('menghapus audit ikut menghapus temuannya', async () => {
  assert.equal((await auditor.del(`/api/audits/${ctx.audit2}`)).status, 200);
  assert.equal((await auditor.get(`/api/findings/${ctx.finding2}`)).status, 404);
});

test('riwayat login dan sesi aktif', async () => {
  const logins = await admin.get('/api/admin/logins?status=gagal');
  assert.equal(logins.status, 200);
  assert.ok(logins.data.some((x) => x.login === 'admin' && x.reason === 'password_salah'));
  assert.equal((await auditor.get('/api/admin/logins')).status, 403);
  const mine = await auditor.get('/api/auth/my-logins');
  assert.ok(mine.data.length >= 1 && mine.data[0].success);

  const extra = client();
  await extra.post('/api/auth/login', { username: 'radipta', password: 'katasandi123' });
  const sessions = (await admin.get('/api/admin/sessions')).data;
  const victim = sessions.filter((x) => x.username === 'radipta').at(-1);
  assert.ok(sessions.find((x) => x.current));
  assert.equal((await admin.del(`/api/admin/sessions/${victim.id}`)).status, 200);
  const results = [await extra.get('/api/audits'), await auditor.get('/api/audits')];
  assert.equal(results.filter((x) => x.status === 401).length, 1, 'hanya sesi yang diakhiri yang keluar');
  await auditor.post('/api/auth/login', { username: 'radipta', password: 'katasandi123' });
  assert.equal((await extra.post('/api/auth/logout', {})).status, 200);
  assert.equal((await extra.get('/api/audits')).status, 401);
});

test('pengaturan tampilan dan data master', async () => {
  const pub = await client().get('/api/auth/settings');
  assert.equal(pub.data.app_name, 'Audit Management');
  assert.equal(pub.data.units, undefined, 'data master tidak dibuka tanpa login');
  assert.equal((await admin.patch('/api/settings', { app_name: 'Audit OTI', theme: 'biru', units: ['Divisi Pengadaan', ' ', 'Divisi Keuangan'], audit_types: ['Keuangan', 'Khusus'] })).status, 200);
  assert.equal((await client().get('/api/auth/settings')).data.app_name, 'Audit OTI');
  const asAuditor = await auditor.get('/api/settings');
  assert.deepEqual(asAuditor.data.values.units, ['Divisi Pengadaan', 'Divisi Keuangan']);
  assert.equal(asAuditor.data.meta, undefined);
  assert.equal((await auditor.patch('/api/settings', { app_name: 'X' })).status, 403);
  assert.equal((await admin.patch('/api/settings', { theme: 'pink' })).status, 400);
  assert.equal((await admin.patch('/api/settings', { maintenance: true })).status, 400, 'mode perbaikan khusus Infra Admin');
  // Jenis audit mengikuti pengaturan.
  assert.equal((await auditor.post('/api/audits', { title: 'Khusus', unit: 'Divisi Keuangan', type: 'Khusus' })).status, 201);
  assert.equal((await auditor.post('/api/audits', { title: 'Lama', unit: 'Divisi Keuangan', type: 'Investigasi' })).status, 400);
});

test('infra admin di atas system admin', async () => {
  const infra = client();
  assert.equal((await infra.post('/api/auth/login', { username: 'infra', password: 'rahasia-infra-1' })).data.role, 'infraadmin');
  assert.equal((await infra.get('/api/users')).status, 200, 'infra punya semua hak admin');
  assert.equal((await admin.get('/api/admin/system')).status, 403);
  const sys = await infra.get('/api/admin/system');
  assert.equal(sys.status, 200);
  assert.ok(sys.data.database.migrations.some((m) => m.name === '004_settings_logins.sql'));
  assert.equal((await infra.get('/api/admin/errors')).status, 200);

  const infraId = (await admin.get('/api/users')).data.find((u) => u.role === 'infraadmin').id;
  assert.equal((await admin.patch(`/api/users/${infraId}`, { active: false })).status, 403);
  assert.equal((await admin.post('/api/users', { name: 'Dev', username: 'dev2', email: 'dev2@contoh.id', role: 'infraadmin', password: 'katasandi123' })).status, 403);
  assert.equal((await infra.post('/api/users', { name: 'Dev', username: 'dev2', email: 'dev2@contoh.id', role: 'infraadmin', password: 'katasandi123' })).status, 201);

  // Mode perbaikan: hanya Infra Admin yang tetap bisa masuk.
  assert.equal((await infra.patch('/api/settings', { maintenance: true })).status, 200);
  assert.equal((await auditor.get('/api/audits')).status, 503);
  assert.equal((await client().post('/api/auth/login', { username: 'radipta', password: 'katasandi123' })).status, 503);
  assert.equal((await infra.get('/api/audits')).status, 200);
  assert.equal((await client().get('/api/auth/settings')).data.maintenance, true);
  assert.equal((await infra.patch('/api/settings', { maintenance: false })).status, 200);
  assert.equal((await auditor.get('/api/audits')).status, 200);
});

test('gambar latar login', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const form = (buf, name, type) => { const fd = new FormData(); fd.append('file', new Blob([buf], { type }), name); return fd; };
  assert.equal((await client().get('/api/auth/login-background', { raw: true })).status, 404);
  assert.equal((await auditor.post('/api/settings/login-background', form(png, 'a.png', 'image/png'))).status, 403);
  assert.equal((await admin.post('/api/settings/login-background', form(Buffer.from('<svg onload=alert(1)>'), 'x.png', 'image/png'))).status, 400);
  const up = await admin.post('/api/settings/login-background', form(png, 'latar.png', 'image/png'));
  assert.equal(up.status, 200);
  assert.match(up.data.login_background_url, /^\/api\/auth\/login-background\?v=login-bg-[0-9a-f]{16}\.png$/);
  const img = await client().get(up.data.login_background_url, { raw: true });
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal((await admin.patch('/api/settings', { login_background: '../../etc/passwd' })).status, 400);
  assert.equal((await admin.del('/api/settings/login-background')).status, 200);
  assert.equal((await client().get('/api/auth/settings')).data.login_background_url, '');
});

test('anggota tim dari pengguna terdaftar dan anggota eksternal', async () => {
  const created = await auditor.post('/api/audits', {
    title: 'Audit Tim', unit: 'Divisi Keuangan', type: 'Keuangan',
    member_ids: [ctx.auditorId, ctx.auditeeId, ctx.auditorId], team: 'Andi (KAP Sejahtera), Rina (konsultan)',
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.deepEqual(created.data.members.map((m) => m.id).sort(), [ctx.auditorId, ctx.auditeeId].sort());
  assert.equal(created.data.team, 'Andi (KAP Sejahtera), Rina (konsultan)');
  assert.equal((await auditor.post('/api/audits', { title: 'X', unit: 'Y', type: 'Keuangan', member_ids: [99999] })).status, 400);
  const upd = await auditor.patch(`/api/audits/${created.data.id}`, { member_ids: [ctx.auditorId] });
  assert.deepEqual(upd.data.members.map((m) => m.id), [ctx.auditorId]);
  const list = (await auditor.get('/api/audits')).data.find((a) => a.id === created.data.id);
  assert.equal(list.members.length, 1);
  assert.equal((await auditor.del(`/api/audits/${created.data.id}`)).status, 200);
});
