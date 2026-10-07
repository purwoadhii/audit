# Jejak Audit

Aplikasi web manajemen audit internal: perencanaan audit, program kerja, temuan, tindak lanjut rekomendasi, bukti, dan laporan.

## Fitur

- **Ringkasan:** audit berjalan, temuan terbuka, tindak lanjut terlambat, dan grafik temuan per risiko dan per unit.
- **Audit:** audit dibuat dari template program kerja, lalu hasil tiap langkah dicatat (Sesuai, Tidak sesuai, Tidak berlaku) beserta catatan dan kertas kerja.
- **Temuan:** isian kondisi, kriteria, sebab, akibat, dan rekomendasi, ditambah tingkat risiko, PIC, dan batas waktu. Langkah yang "Tidak sesuai" bisa langsung dijadikan temuan.
- **Tindak lanjut:** papan status (Terbuka, Dalam proses, Menunggu verifikasi, Selesai), riwayat progres, dan unggahan bukti.
- **Laporan:** laporan hasil audit yang siap dicetak atau disimpan sebagai PDF dari browser.
- **Pengguna dan peran:**

  | Peran | Hak akses |
  | --- | --- |
  | Admin | Mengelola pengguna, template, dan semua data |
  | Auditor | Membuat audit, mengisi program kerja, mencatat dan menutup temuan |
  | Auditee | Melihat temuan untuk dirinya atau unitnya, memberi tanggapan, mengunggah bukti |
  | Manajemen | Melihat semua audit, temuan, laporan, dan log aktivitas tanpa mengubah |

- **Log aktivitas:** setiap pembuatan, perubahan, penghapusan, dan unggahan tercatat.
- **Pengingat email (opsional):** setiap hari, PIC menerima daftar temuan yang terlambat atau jatuh tempo dalam 7 hari.

## Teknologi

- Frontend: React + Vite (`web/`)
- Backend: Node.js + Express (`server/`)
- Database: PostgreSQL
- File bukti disimpan di disk server (`UPLOAD_DIR`)

## Menjalankan di server (Docker)

Butuh server Linux dengan Docker dan Docker Compose.

```bash
git clone https://github.com/purwoadhii/audit.git jejak-audit
cd jejak-audit
cp .env.example .env
# Edit .env: isi DB_PASSWORD, JWT_SECRET (openssl rand -hex 32), ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up -d --build
```

Aplikasi berjalan di `http://IP-SERVER:3000`. Masuk dengan `ADMIN_EMAIL` dan `ADMIN_PASSWORD`, lalu segera ganti kata sandi lewat menu **Akun**.

Data database dan file bukti disimpan di volume Docker `db-data` dan `uploads`, jadi tetap ada saat aplikasi diperbarui.

### Domain dan HTTPS

Pasang reverse proxy (misalnya Caddy atau Nginx) di depan port 3000. Contoh Caddy yang mengurus sertifikat HTTPS otomatis:

```
audit.perusahaan.co.id {
    reverse_proxy localhost:3000
}
```

Setelah HTTPS aktif, pastikan `COOKIE_SECURE=true` di `.env`.

### Memperbarui aplikasi

```bash
git pull
docker compose up -d --build
```

Migrasi database berjalan otomatis saat aplikasi mulai.

### Backup

```bash
docker compose exec db pg_dump -U jejak jejak_audit > backup-$(date +%F).sql
docker run --rm -v jejak-audit_uploads:/data -v "$PWD":/out alpine tar czf /out/uploads-$(date +%F).tgz -C /data .
```

## Pengembangan lokal

Butuh Node.js 20+ dan PostgreSQL 14+.

```bash
# Backend
cd server
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/jejak_audit \
ADMIN_EMAIL=admin@contoh.id ADMIN_PASSWORD=admin12345 npm run dev

# Frontend (terminal lain), membuka http://localhost:5173
cd web
npm install
npm run dev
```

### Tes

Tes API berjalan terhadap database PostgreSQL sungguhan dan mengosongkannya setiap kali jalan, jadi gunakan database khusus tes:

```bash
cd server
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/jejak_audit_test npm test
```

## Konfigurasi

Semua pengaturan ada di `.env` (lihat `.env.example`):

| Variabel | Keterangan |
| --- | --- |
| `DATABASE_URL` | Koneksi PostgreSQL (diisi otomatis oleh docker-compose) |
| `JWT_SECRET` | Rahasia sesi login, minimal 32 karakter, wajib di production |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Akun admin pertama, dibuat hanya bila belum ada pengguna |
| `COOKIE_SECURE` | `true` bila diakses lewat HTTPS |
| `MAX_UPLOAD_MB` | Ukuran maksimal file bukti (bawaan 20) |
| `SMTP_*`, `REMINDER_HOUR` | Email pengingat harian, nonaktif bila `SMTP_HOST` kosong |
