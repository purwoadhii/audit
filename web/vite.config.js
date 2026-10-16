import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Pustaka Excel (sekitar 900 kB) hanya dimuat saat tombol ekspor diklik, jadi peringatan ukuran dinaikkan.
  build: { chunkSizeWarningLimit: 1000 },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
