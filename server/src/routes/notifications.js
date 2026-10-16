import { Router } from 'express';
import { query } from '../db.js';
import { intId } from '../errors.js';
import { listNotifications } from '../notify.js';

const r = Router();

r.get('/', async (req, res) => {
  res.json(await listNotifications(req.user.id));
});

// Menandai sudah dibaca: satu notifikasi ({ id }) atau semuanya.
r.post('/read', async (req, res) => {
  const id = req.body?.id;
  if (id) await query('UPDATE notifications SET read_at = NOW(3) WHERE id = ? AND user_id = ? AND read_at IS NULL', [intId(id), req.user.id]);
  else await query('UPDATE notifications SET read_at = NOW(3) WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
  res.json(await listNotifications(req.user.id));
});

export default r;
