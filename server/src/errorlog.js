// 100 kesalahan server terakhir, disimpan di memori untuk diperiksa Infra Admin di halaman Sistem.
const MAX = 100;
const items = [];

export function recordError(req, err) {
  items.unshift({
    at: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl.slice(0, 300),
    user_id: req.user?.id ?? null,
    message: String(err?.message || err).slice(0, 500),
    stack: String(err?.stack || '').split('\n').slice(1, 6).map((l) => l.trim()).join('\n'),
  });
  if (items.length > MAX) items.length = MAX;
}

export const recentErrors = () => items;
