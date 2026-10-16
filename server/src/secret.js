import crypto from 'node:crypto';
import { config } from './config.js';

// Rahasia (secret key S3, API key AI) disimpan terenkripsi di database dengan kunci turunan JWT_SECRET.
// Bila JWT_SECRET berubah, rahasia lama tidak bisa dibaca (openSecret mengembalikan null) dan harus diisi ulang.
const keyFor = (label) => crypto.createHash('sha256').update(`${label}:${config.jwtSecret}`).digest();

export function sealSecret(text, label) {
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyFor(label), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function openSecret(blob, label) {
  if (!blob) return '';
  try {
    const [iv, tag, enc] = blob.split('.').map((x) => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', keyFor(label), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
