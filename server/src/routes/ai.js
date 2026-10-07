import { Router } from 'express';
import { canUseAi, chat } from '../ai.js';

const r = Router();

// Apakah menu Asisten AI ditampilkan untuk pengguna ini.
r.get('/status', async (req, res) => {
  res.json({ available: await canUseAi(req.user) });
});

r.post('/chat', async (req, res) => {
  res.json(await chat(req.user, req.body?.messages));
});

export default r;
