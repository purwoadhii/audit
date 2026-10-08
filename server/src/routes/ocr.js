import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { badRequest } from '../errors.js';
import { logActivity, query } from '../db.js';
import { getSettings } from '../settings.js';
import { extractText } from '../extract.js';

// Menu OCR: baca teks dari file tanpa menyimpannya. File hanya diproses di memori.
const r = Router();
const READABLE = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/(plain|csv)|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))$/;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!READABLE.test(file.mimetype)) return cb(badRequest('Gunakan gambar (JPG, PNG), PDF, Word, Excel, PowerPoint, atau teks.'));
    cb(null, true);
  },
});

r.post('/', (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    try {
      if (err?.code === 'LIMIT_FILE_SIZE') throw badRequest(`Ukuran file maksimal ${config.maxUploadMb} MB.`);
      if (err) throw err;
      if (!req.file) throw badRequest('Pilih file yang akan dibaca.');
      const { ocr_enabled: ocr } = await getSettings();
      const filename = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 200);
      const started = Date.now();
      const result = await extractText(req.file.buffer, req.file.mimetype, { ocr });
      if (result?.skipped) throw badRequest('OCR sedang dimatikan oleh admin, jadi gambar tidak bisa dibaca.');
      const text = (result?.text || '').replace(/\u0000/g, '').trim();
      await logActivity({ query }, req.user.id, 'ocr', 'file', null, { filename, chars: text.length });
      res.json({ filename, text, ocr: Boolean(result?.ocr), ms: Date.now() - started });
    } catch (e) {
      next(e);
    }
  });
});

export default r;
