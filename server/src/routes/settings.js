import { Router } from 'express';
import { logActivity, query } from '../db.js';
import { requireRole } from '../auth.js';
import { SETTINGS, THEMES, getSettings, saveSettings } from '../settings.js';

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

export default r;
