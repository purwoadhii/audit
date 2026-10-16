// Mode offline (service worker). Dibuat ulang setiap build oleh vite.config.js, yang mengisi nomor build dan daftar file awal.
// - Tampilan aplikasi (HTML, JS, CSS, ikon) disimpan supaya aplikasi tetap terbuka tanpa koneksi.
// - Data dari halaman pengguna (permintaan GET ke /api) disimpan setiap kali berhasil dimuat. Saat offline,
//   data terakhir itu yang ditampilkan, dengan tanda x-offline supaya aplikasi bisa memberi tahu pengguna.
// - Data dihapus saat pengguna keluar atau sesinya berakhir, supaya tidak tertinggal di komputer bersama.
// - Halaman System Admin dan Infra Admin tidak disimpan.
const BUILD = '__BUILD__';
const SHELL = `shell-${BUILD}`;
const DATA = 'data-v1';
const FONTS = 'fonts-v1';
const PRECACHE = __PRECACHE__;
// Tidak disimpan: login SSO, unduhan file, dan data yang cepat basi atau berukuran besar.
const SKIP = [/^\/api\/auth\/sso/, /^\/api\/attachments\/\d+\/(download|view)/, /^\/api\/admin\//, /^\/api\/backup/, /^\/api\/ai\//, /^\/api\/verify\//];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('shell-') && key !== SHELL) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'clear-data') event.waitUntil(caches.delete(DATA));
});

// Kunci cache data memuat pintu masuk dan perusahaan yang dipilih, karena alamat yang sama bisa berbeda isinya.
function dataKey(req) {
  const u = new URL(req.url);
  u.searchParams.set('__sw', `${req.headers.get('x-portal') || 'user'}|${req.headers.get('x-company') || ''}`);
  return u.toString();
}

const offlineJson = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-offline': '1' } });

async function apiRequest(req) {
  const portal = req.headers.get('x-portal') || 'user';
  try {
    const res = await fetch(req);
    if (res.status === 401) await caches.delete(DATA);
    else if (portal === 'user' && res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
      const cache = await caches.open(DATA);
      await cache.put(dataKey(req), res.clone());
    }
    return res;
  } catch {
    if (portal === 'user') {
      const hit = await (await caches.open(DATA)).match(dataKey(req));
      if (hit) {
        const headers = new Headers(hit.headers);
        headers.set('x-offline', '1');
        return new Response(await hit.blob(), { status: hit.status, headers });
      }
    }
    return offlineJson(503, { error: 'Anda sedang offline dan data ini belum pernah dibuka di perangkat ini.', offline: true });
  }
}

async function pageRequest(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put('/index.html', res.clone());
    return res;
  } catch {
    return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') await cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return event.respondWith(cacheFirst(req, FONTS));
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    if (SKIP.some((r) => r.test(url.pathname))) return;
    return event.respondWith(apiRequest(req));
  }
  if (req.mode === 'navigate') return event.respondWith(pageRequest(req));
  if (url.pathname.startsWith('/assets/') || /\.(png|webp|svg|ico|webmanifest)$/.test(url.pathname)) return event.respondWith(cacheFirst(req, SHELL));
});
