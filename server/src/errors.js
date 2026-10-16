// Pesan error ditulis dalam bahasa Indonesia, dengan isian {nama} untuk bagian yang berubah.
// Browser menerjemahkan pesan ke bahasa pengguna dari teks asli (key) dan isiannya (vars).
export const fill = (text, vars) => (vars ? String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text);

// Teks tetap yang dikirim ke browser di luar pesan error (misalnya hasil tes penyedia AI):
// N_(teks) untuk teks tanpa isian, msg(teks, isian) untuk teks dengan isian. Browser mencocokkan dan menerjemahkannya.
export const N_ = (s) => s;
export const msg = fill;

export class HttpError extends Error {
  constructor(status, message, vars) {
    super(fill(message, vars));
    this.status = status;
    this.key = message;
    this.vars = vars;
  }
}

export const badRequest = (msg, vars) => new HttpError(400, msg, vars);
export const notFound = (msg = 'Data tidak ditemukan.') => new HttpError(404, msg);
export const forbidden = (msg = 'Anda tidak punya akses untuk tindakan ini.') => new HttpError(403, msg);

// Validasi sederhana: ambil field yang diizinkan dan periksa nilai enum.
export function pick(body, fields) {
  const out = {};
  for (const f of fields) if (body && body[f] !== undefined) out[f] = body[f];
  return out;
}

export function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw badRequest('{label} wajib diisi.', { label });
  return value.trim();
}

export function oneOf(value, list, label) {
  if (!list.includes(value)) throw badRequest('{label} tidak valid.', { label });
  return value;
}

export function dateOrNull(value, label) {
  if (value === null || value === '' || value === undefined) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) throw badRequest('{label} harus berformat tanggal.', { label });
  return value;
}

export function intId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
}
