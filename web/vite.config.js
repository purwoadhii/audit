import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Service worker untuk mode offline: dibuat dari sw.template.js dengan nomor build dan daftar file
// tampilan utama (yang dimuat index.html), supaya setiap rilis memakai cache baru.
function serviceWorker() {
  let outDir;
  return {
    name: 'jejak-service-worker',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
      const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
      const precache = ['/', ...new Set(assets), '/manifest.webmanifest', '/icon-192.png', '/favicon.png'];
      const sw = fs.readFileSync('sw.template.js', 'utf8')
        .replace("'__BUILD__'", `'${Date.now().toString(36)}'`)
        .replace('= __PRECACHE__;', `= ${JSON.stringify(precache)};`);
      fs.writeFileSync(path.join(outDir, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  // Pustaka Excel (sekitar 900 kB) hanya dimuat saat tombol ekspor diklik, jadi peringatan ukuran dinaikkan.
  build: { chunkSizeWarningLimit: 1000 },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
