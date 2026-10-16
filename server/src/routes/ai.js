import { Router } from 'express';
import { aiUnavailableReason, chat } from '../ai.js';

const r = Router();

// Apakah Asisten AI bisa dipakai pengguna ini, dan bila belum, alasannya.
r.get('/status', async (req, res) => {
  const reason = await aiUnavailableReason(req.user);
  res.json({ available: !reason, reason });
});

r.post('/chat', async (req, res) => {
  res.json(await chat(req.user, req.body?.messages));
});

export default r;
