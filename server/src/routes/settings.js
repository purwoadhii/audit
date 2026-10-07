import { Router } from 'express';
import multer from 'multer';
import { badRequest } from '../errors.js';
import { MAX_BACKGROUND_MB, saveBackground, removeBackground } from '../branding.js';
import { logActivity, query } from '../db.js';
import { requireRole } from '../auth.js';
import { SETTINGS, THEMES, getSettings, saveSettings, saveInternal, publicSettings } from '../settings.js';

const r = Router();

// Semua pengguna yang masuk butuh tampilan dan data master (daftar unit, jenis audit).
r.get('/', async (req, res) => {
  const all = await getSettings();
  const admin = ['admin', 'infraadmin'].includes(req.user.role);
  const keys = Object.entries(SETTINGS).filter(([k, s]) => admin || s.pub || ['units', 'audit_types'].includes(k)).map(([k]) => k);
  const values = Object.fromEntries(keys.map((k) => [k, all[k]]));
  if (!admin) return res.json({ values });
  const meta = Object.fromEntries(keys.map((k) => [k, { who: SETTINGS[k].who, label: SETTINGS[k].label, default: SETTINGS[k].def }]));
  res.json({ values, meta, themes: THEMES });
});

r.patch('/', requireRole('admin'), async (req, res) => {
  const changes = await saveSettings(req.user, req.body);
  await logActivity({ query }, req.user.id, 'update', 'setting', null, { keys: Object.keys(changes) });
  res.json({ values: await getSettings() });
});

const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BACKGROUND_MB * 1024 * 1024, files: 1 } });

// Unggah gambar latar halaman login. Gambar lama dihapus setelah yang baru tersimpan.
r.post('/login-background', requireRole('admin'), async (req, res) => {
  await new Promise((resolve, reject) => {
    imageUpload.single('file')(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') return reject(badRequest(`Ukuran gambar maksimal ${MAX_BACKGROUND_MB} MB.`));
      if (err) return reject(err);
      if (!req.file) return reject(badRequest('Pilih gambar yang akan diunggah.'));
      resolve();
    });
  });
  const old = (await getSettings()).login_background;
  const name = await saveBackground(req.file.buffer);
  await saveInternal(req.user, 'login_background', name);
  await removeBackground(old);
  await logActivity({ query }, req.user.id, 'upload', 'setting', null, { filename: 'gambar latar login' });
  res.json(await publicSettings());
});

r.delete('/login-background', requireRole('admin'), async (req, res) => {
  const old = (await getSettings()).login_background;
  await saveInternal(req.user, 'login_background', '');
  await removeBackground(old);
  await logActivity({ query }, req.user.id, 'delete', 'setting', null, { filename: 'gambar latar login' });
  res.json(await publicSettings());
});

export default r;
