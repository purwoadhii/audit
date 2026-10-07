// Uji API end-to-end terhadap database PostgreSQL sungguhan.
// Jalankan: TEST_DATABASE_URL=postgres://... npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const dbUrl = process.env.TEST_DATABASE_URL || 'postgres://jejak:jejak@localhost:5432/jejak_audit_test';
process.env.DATABASE_URL = dbUrl;
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jejak-up-'));
process.env.ADMIN_EMAIL = 'admin@contoh.id';
process.env.ADMIN_PASSWORD = 'rahasia-admin-1';

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
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
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
  assert.equal((await client().get('/api/audits')).status, 401);
});

test('admin membuat pengguna untuk setiap peran', async () => {
  const mk = async (name, email, role, unit) => {
    const r = await admin.post('/api/users', { name, email, role, unit, password: 'katasandi123' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return r.data.id;
  };
  ctx.auditorId = await mk('Radipta', 'radipta@contoh.id', 'auditor');
  ctx.auditeeId = await mk('Budi', 'budi@contoh.id', 'auditee', 'Divisi Pengadaan');
  ctx.otherId = await mk('Sari', 'sari@contoh.id', 'auditee', 'Divisi Keuangan');
  assert.equal((await admin.post('/api/users', { name: 'X', email: 'budi@contoh.id', role: 'auditor', password: 'katasandi123' })).status, 400);
  await auditor.post('/api/auth/login', { email: 'radipta@contoh.id', password: 'katasandi123' });
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
