import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Baca file .env di folder utama proyek bila ada (untuk menjalankan di lokal).
// Variabel yang sudah diset di sistem tetap diutamakan.
const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  databaseUrl: env.DATABASE_URL || 'mysql://root:@localhost:3306/jejak_audit',
  jwtSecret: env.JWT_SECRET || '',
  uploadDir: path.resolve(env.UPLOAD_DIR || './uploads'),
  maxUploadMb: Number(env.MAX_UPLOAD_MB || 20),
  appUrl: env.APP_URL || 'http://localhost:3000',
  cookieSecure: env.COOKIE_SECURE === 'true',
  admin: {
    email: env.ADMIN_EMAIL || '',
    password: env.ADMIN_PASSWORD || '',
    name: env.ADMIN_NAME || 'Administrator',
    username: env.ADMIN_USERNAME || 'admin',
  },
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT || 587),
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.SMTP_FROM || 'Jejak Audit <no-reply@localhost>',
  },
  reminderHour: Number(env.REMINDER_HOUR || 8),
};

if (!config.jwtSecret || config.jwtSecret.length < 32) {
  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET wajib diisi minimal 32 karakter di production.');
  }
  config.jwtSecret = 'dev-only-secret-ganti-di-production-0123456789';
}
