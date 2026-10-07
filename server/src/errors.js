export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (msg) => new HttpError(400, msg);
export const notFound = (msg = 'Data tidak ditemukan.') => new HttpError(404, msg);
export const forbidden = (msg = 'Anda tidak punya akses untuk tindakan ini.') => new HttpError(403, msg);

// Validasi sederhana: ambil field yang diizinkan dan periksa nilai enum.
export function pick(body, fields) {
  const out = {};
  for (const f of fields) if (body && body[f] !== undefined) out[f] = body[f];
  return out;
}

export function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw badRequest(`${label} wajib diisi.`);
  return value.trim();
}

export function oneOf(value, list, label) {
  if (!list.includes(value)) throw badRequest(`${label} tidak valid.`);
  return value;
}

export function dateOrNull(value, label) {
  if (value === null || value === '' || value === undefined) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) throw badRequest(`${label} harus berformat tanggal.`);
  return value;
}

export function intId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
}
