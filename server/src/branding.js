import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { badRequest } from './errors.js';

// Gambar latar (halaman login dan halaman setelah login) disimpan di folder branding di dalam UPLOAD_DIR.
export const brandingDir = path.join(config.uploadDir, 'branding');
export const MAX_BACKGROUND_MB = 5;

// Jenis file dikenali dari isinya, bukan dari nama, supaya file lain yang diberi nama .jpg ditolak.
const KINDS = [
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

export const mimeFor = (name) => KINDS.find((k) => name.endsWith(`.${k.ext}`))?.mime;

// Jenis gambar latar: awalan nama file dan kunci pengaturannya.
export const BACKGROUNDS = {
  login: { prefix: 'login-bg', key: 'login_background', label: 'gambar latar login' },
  app: { prefix: 'app-bg', key: 'app_background', label: 'gambar latar halaman aplikasi' },
};

export async function saveBackground(buffer, kind = 'login') {
  const type = KINDS.find((k) => k.test(buffer));
  if (!type) throw badRequest('Gunakan gambar JPG, PNG, atau WebP.');
  await fs.mkdir(brandingDir, { recursive: true });
  const name = `${BACKGROUNDS[kind].prefix}-${crypto.randomBytes(8).toString('hex')}.${type.ext}`;
  await fs.writeFile(path.join(brandingDir, name), buffer);
  return name;
}

export async function removeBackground(name) {
  if (!/^(login|app)-bg-[0-9a-f]{16}\.(jpg|png|webp)$/.test(name || '')) return;
  await fs.rm(path.join(brandingDir, name), { force: true });
}
