import path from 'node:path';

const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  databaseUrl: env.DATABASE_URL || 'postgres://jejak:jejak@localhost:5432/jejak_audit',
  jwtSecret: env.JWT_SECRET || '',
  uploadDir: path.resolve(env.UPLOAD_DIR || './uploads'),
  maxUploadMb: Number(env.MAX_UPLOAD_MB || 20),
  appUrl: env.APP_URL || 'http://localhost:3000',
  cookieSecure: env.COOKIE_SECURE === 'true',
  admin: {
    email: env.ADMIN_EMAIL || '',
    password: env.ADMIN_PASSWORD || '',
    name: env.ADMIN_NAME || 'Administrator',
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
