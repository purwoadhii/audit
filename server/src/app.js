import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { requireAuth } from './auth.js';
import { HttpError } from './errors.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import templateRoutes from './routes/templates.js';
import auditRoutes from './routes/audits.js';
import findingRoutes from './routes/findings.js';
import attachmentRoutes, { findingUploads, auditUploads } from './routes/attachments.js';
import dashboardRoutes from './routes/dashboard.js';
import settingsRoutes from './routes/settings.js';
import adminRoutes from './routes/admin.js';
import aiRoutes from './routes/ai.js';
import ocrRoutes from './routes/ocr.js';
import { recordError } from './errorlog.js';

const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use((_req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  // Permintaan yang mengubah data wajib JSON atau multipart, sebagai perlindungan CSRF tambahan.
  app.use('/api', (req, _res, next) => {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      const ct = req.headers['content-type'] || '';
      if (req.method !== 'DELETE' && !ct.startsWith('application/json') && !ct.startsWith('multipart/form-data')) {
        return next(new HttpError(415, 'Format permintaan tidak didukung.'));
      }
      if (req.headers['x-requested-with'] !== 'jejak') return next(new HttpError(403, 'Permintaan ditolak.'));
    }
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api', requireAuth);
  app.use('/api/users', userRoutes);
  app.use('/api/templates', templateRoutes);
  app.use('/api/audits/:id/attachments', auditUploads);
  app.use('/api/audits', auditRoutes);
  app.use('/api/findings/:id/attachments', findingUploads);
  app.use('/api/findings', findingRoutes);
  app.use('/api/attachments', attachmentRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/ocr', ocrRoutes);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Alamat API tidak ditemukan.')));

  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Data JSON tidak valid.' });
    if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'Data terkait tidak ditemukan.' });
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Data yang sama sudah ada.' });
    console.error(err);
    recordError(req, err);
    res.status(500).json({ error: 'Terjadi kesalahan di server.' });
  });
  return app;
}
