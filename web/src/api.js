// Pembungkus fetch untuk API. Sesi disimpan di cookie httpOnly oleh server.
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(method, url, body) {
  const headers = { 'x-requested-with': 'jejak' };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${url}`, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'Tidak bisa terhubung ke server. Periksa koneksi internet.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // 401: sesi habis. 503: mode perbaikan. Keduanya kembali ke halaman login.
    if ((res.status === 401 || res.status === 503) && !url.startsWith('/auth/')) onUnauthorized();
    throw new ApiError(res.status, data?.error || 'Terjadi kesalahan.');
  }
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b ?? {}),
  patch: (u, b) => request('PATCH', u, b),
  del: (u) => request('DELETE', u),
  upload: (u, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('POST', u, fd);
  },
};
