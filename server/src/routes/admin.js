import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { query, logActivity } from '../db.js';
import { requireRole, endSession } from '../auth.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import { config } from '../config.js';
import { recentErrors } from '../errorlog.js';
import { getSettings } from '../settings.js';
import { publicAiConfig, saveAiConfig, testProvider, aiHealth, PROVIDERS } from '../ai.js';
import { extractionState, requeueAll } from '../extract.js';
import { publicStorageConfig, buildStorageConfig, saveStorageConfig, testStorage, checkHealth, storageHealth } from '../storage.js';

const r = Router();
const startedAt = new Date();

// Riwayat login: semua percobaan masuk, bisa disaring per status, pengguna, atau kata kunci.
r.get('/logins', requireRole('admin'), async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.status === 'berhasil') where.push('h.success = TRUE');
  if (req.query.status === 'gagal') where.push('h.success = FALSE');
  if (req.query.user_id) { where.push('h.user_id = ?'); params.push(Number(req.query.user_id)); }
  if (req.query.q) {
    where.push('(h.login LIKE ? OR h.ip LIKE ? OR u.name LIKE ?)');
    const q = `%${String(req.query.q).slice(0, 100)}%`;
    params.push(q, q, q);
  }
  const limit = Math.max(1, Math.min(Math.trunc(Number(req.query.limit)) || 200, 1000));
  const { rows } = await query(
    `SELECT h.id, h.user_id, u.name AS user_name, u.role, h.login, h.success, h.reason, h.ip, h.user_agent, h.created_at
       FROM login_history h LEFT JOIN users u ON u.id = h.user_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY h.id DESC LIMIT ${limit}`,
    params,
  );
  res.json(rows.map((x) => ({ ...x, success: Boolean(Number(x.success)) })));
});

// Sesi yang masih aktif di semua perangkat.
r.get('/sessions', requireRole('admin'), async (req, res) => {
  const { rows } = await query(
    `SELECT s.id, s.user_id, u.name AS user_name, u.username, u.role, s.remember, s.ip, s.user_agent,
            s.created_at, s.last_seen_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.ended_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP(3)
      ORDER BY s.last_seen_at DESC`,
  );
  res.json(rows.map((x) => ({ ...x, remember: Boolean(Number(x.remember)), current: x.id === req.sessionId })));
});

r.delete('/sessions/:id', requireRole('admin'), async (req, res) => {
  const id = String(req.params.id);
  if (!/^[0-9a-f]{32}$/.test(id)) throw notFound();
  const { rows } = await query('SELECT s.id, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?', [id]);
  if (!rows[0]) throw notFound();
  if (rows[0].role === 'infraadmin' && req.user.role !== 'infraadmin') throw forbidden('Sesi Infra Admin hanya bisa diakhiri oleh Infra Admin.');
  if (id === req.sessionId) throw badRequest('Gunakan tombol Keluar untuk mengakhiri sesi Anda sendiri.');
  await endSession(id, 'dipaksa_keluar');
  res.json({ ok: true });
});

async function dirSize(dir) {
  let files = 0;
  let bytes = 0;
  try {
    for (const name of await fs.readdir(dir)) {
      const st = await fs.stat(path.join(dir, name));
      if (st.isFile()) { files += 1; bytes += st.size; }
    }
  } catch { /* folder belum ada */ }
  return { files, bytes };
}

// Kondisi teknis aplikasi, hanya untuk Infra Admin.
r.get('/system', requireRole('infraadmin'), async (_req, res) => {
  const [{ rows: ver }, { rows: tables }, { rows: migrations }] = await Promise.all([
    query('SELECT VERSION() AS v, DATABASE() AS db, NOW() AS db_time'),
    query(
      `SELECT TABLE_NAME AS name, TABLE_ROWS AS approx_rows, DATA_LENGTH + INDEX_LENGTH AS bytes
         FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`,
    ),
    query('SELECT name, applied_at FROM schema_migrations ORDER BY name'),
  ]);
  const pkg = JSON.parse(await fs.readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  const mem = process.memoryUsage();
  res.json({
    app: { version: pkg.version, node: process.version, env: process.env.NODE_ENV || 'development', started_at: startedAt, uptime_s: Math.round(process.uptime()), memory_mb: Math.round(mem.rss / 1048576), platform: `${process.platform} ${process.arch}` },
    database: { version: ver[0].v, name: ver[0].db, time: ver[0].db_time, tables, migrations },
    uploads: { dir: config.uploadDir, ...(await dirSize(config.uploadDir)), max_mb: config.maxUploadMb },
    config: { cookie_secure: config.cookieSecure, smtp: Boolean(config.smtp.host), reminder_hour: config.reminderHour, app_url: config.appUrl, jwt_secret_set: Boolean(process.env.JWT_SECRET) },
    errors: recentErrors().length,
  });
});

// ---- Penyimpanan file (diatur System Admin, dipantau Infra Admin) ----
r.get('/storage', requireRole('admin'), async (_req, res) => {
  res.json(await publicStorageConfig());
});

// Uji pengaturan dari form tanpa menyimpannya.
r.post('/storage/test', requireRole('admin'), async (req, res) => {
  res.json(await testStorage(await buildStorageConfig(req.body)));
});

// Simpan hanya bila tes koneksi berhasil, supaya unggahan berikutnya tidak gagal.
r.put('/storage', requireRole('admin'), async (req, res) => {
  const cfg = await buildStorageConfig(req.body);
  const test = await testStorage(cfg);
  if (!test.ok) throw badRequest(`Pengaturan belum disimpan. ${test.message}`);
  await saveStorageConfig(req.user, cfg);
  await logActivity({ query }, req.user.id, 'update', 'setting', null, { keys: ['storage'], driver: cfg.driver });
  await checkHealth();
  res.json(await publicStorageConfig());
});

r.get('/storage/status', requireRole('infraadmin'), async (req, res) => {
  if (req.query.check === '1' || !storageHealth().last_check) await checkHealth();
  const { rows } = await query('SELECT storage, storage_dir, COUNT(*) AS files, COALESCE(SUM(size),0) AS bytes FROM attachments GROUP BY storage, storage_dir');
  const cfg = await publicStorageConfig();
  const settings = await getSettings();
  res.json({
    driver: cfg.driver,
    target: cfg.driver === 's3' ? `${cfg.s3.endpoint || 'AWS S3'} / ${cfg.s3.bucket}/${cfg.s3.prefix}` : cfg.local_dir || config.uploadDir,
    secret_unreadable: cfg.secret_unreadable,
    health: storageHealth(),
    usage: rows.map((x) => ({ storage: x.storage, dir: x.storage === 's3' ? null : x.storage_dir || config.uploadDir, files: Number(x.files), bytes: Number(x.bytes) })),
    max_upload_mb: config.maxUploadMb,
    login_background: Boolean(settings.login_background),
  });
});

// ---- Asisten AI (diatur System Admin, dipantau Infra Admin) ----
r.get('/ai', requireRole('admin'), async (_req, res) => {
  res.json(await publicAiConfig());
});

r.put('/ai', requireRole('admin'), async (req, res) => {
  await saveAiConfig(req.user, req.body || {});
  await logActivity({ query }, req.user.id, 'update', 'setting', null, { keys: ['ai'] });
  res.json(await publicAiConfig());
});

r.post('/ai/test', requireRole('admin'), async (req, res) => {
  res.json(await testProvider(String(req.body?.provider || '')));
});

r.get('/ai/status', requireRole('infraadmin'), async (_req, res) => {
  const cfg = await publicAiConfig();
  const { rows } = await query(
    `SELECT provider, SUM(ok) AS ok, SUM(1 - ok) AS failed, SUM(CASE WHEN status = 429 THEN 1 ELSE 0 END) AS limited,
            COALESCE(SUM(tokens_in), 0) AS tokens_in, COALESCE(SUM(tokens_out), 0) AS tokens_out, MAX(created_at) AS last_used
       FROM ai_usage WHERE created_at >= CURRENT_DATE GROUP BY provider`,
  );
  const today = Object.fromEntries(rows.map((x) => [x.provider, { ok: Number(x.ok), failed: Number(x.failed), limited: Number(x.limited), tokens_in: Number(x.tokens_in), tokens_out: Number(x.tokens_out), last_used: x.last_used }]));
  const health = aiHealth();
  const { rows: texts } = await query('SELECT text_status AS status, COUNT(*) AS n FROM attachments GROUP BY text_status');
  res.json({
    enabled: cfg.enabled,
    providers: cfg.order.map((id) => ({
      id, label: PROVIDERS[id].label, enabled: cfg.providers[id].enabled, key_set: cfg.providers[id].key_set, model: cfg.providers[id].model,
      today: today[id] || { ok: 0, failed: 0, limited: 0, tokens_in: 0, tokens_out: 0, last_used: null }, ...(health[id] || {}),
    })),
    extraction: { ...extractionState(), files: Object.fromEntries(texts.map((x) => [x.status, Number(x.n)])) },
  });
});

// Baca ulang file yang belum terbaca, misalnya setelah OCR dinyalakan.
r.post('/ocr/reprocess', requireRole('admin'), async (req, res) => {
  const queued = await requeueAll(['none', 'failed', 'pending']);
  await logActivity({ query }, req.user.id, 'update', 'setting', null, { action: 'ocr_reprocess', queued });
  res.json({ queued });
});

r.get('/errors', requireRole('infraadmin'), (_req, res) => {
  res.json(recentErrors());
});

export default r;
