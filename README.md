# Audit Management

Aplikasi web manajemen audit internal: perencanaan audit, program kerja, temuan, tindak lanjut rekomendasi, bukti, dan laporan.

## Fitur

- **Ringkasan:** audit berjalan, temuan terbuka, tindak lanjut terlambat, dan grafik temuan per risiko dan per unit.
- **Audit:** audit dibuat dari template program kerja, lalu hasil tiap langkah dicatat (Sesuai, Tidak sesuai, Tidak berlaku) beserta catatan dan kertas kerja.
- **Temuan:** isian kondisi, kriteria, sebab, akibat, dan rekomendasi, ditambah tingkat risiko, PIC, dan batas waktu. Langkah yang "Tidak sesuai" bisa langsung dijadikan temuan.
- **Tindak lanjut:** papan status (Terbuka, Dalam proses, Menunggu verifikasi, Selesai), riwayat progres, dan unggahan bukti.
- **Laporan:** laporan hasil audit yang siap dicetak atau disimpan sebagai PDF dari browser.
- **Masuk:** dengan username atau email. Sesi selalu berakhir saat browser ditutup. Tanpa "Ingat saya", pengguna juga otomatis keluar setelah tidak aktif (bawaan 120 menit). Dengan "Ingat saya", sesi bertahan selama browser terbuka, paling lama 7 hari.
- **Pengguna dan peran:**

  | Peran | Hak akses |
  | --- | --- |
  | Infra Admin | Developer. Semua hak System Admin, ditambah menu Infra Admin |
  | System Admin | Admin dari pihak klien. Menu System Admin dan riwayat login |
  | Auditor | Membuat audit, mengisi program kerja, mencatat dan menutup temuan |
  | Auditee | Melihat temuan untuk dirinya atau unitnya, memberi tanggapan, mengunggah bukti |
  | Manajemen | Melihat semua audit, temuan, laporan, dan log aktivitas tanpa mengubah |

- **System Admin** (`/sysAdmin`), untuk admin dari pihak klien:
  - Pengguna dan template.
  - Pengaturan tampilan: nama aplikasi, tema warna, teks dan gambar latar halaman login.
  - Data master (daftar unit, jenis audit) dan batas waktu sesi login.
  - Penyimpanan file bukti: di server aplikasi (lokal/on-premise; foldernya bisa diganti dari halaman ini, misalnya `D:/AuditManagement/files` atau folder NAS yang di-mapping) atau object storage S3 (AWS S3, MinIO di server sendiri, Google Cloud Storage, Cloudflare R2, dan penyedia lain yang kompatibel S3). Ada tombol tes koneksi; pengaturan hanya disimpan bila tes berhasil.
  - Sesi aktif yang bisa dipaksa keluar.
- **Infra Admin** (`/infraAdmin`), untuk developer: kondisi server dan database, kesalahan server terakhir, status dan pemakaian penyimpanan file, batas percobaan login, dan mode perbaikan.
- Akun System Admin dan Infra Admin hanya melihat menu pengaturan dan Aktivitas. Infra Admin mengawasi admin, dan admin mengawasi user. Supaya pemilik akun admin tetap bisa mengerjakan audit, saat aplikasi jalan dibuat juga akun user terpisah (peran dari `ADMIN_USER_ROLE`, bawaan auditor) dengan password yang sama, username `<ADMIN_USERNAME>.user`, dan email alias `+user`, misalnya `oti.twingate+user@gmail.com`.
- **Pembacaan dokumen dan OCR:** teks PDF, Word, Excel, dan PowerPoint (.docx, .xlsx, .pptx) dibaca otomatis saat diunggah. Gambar dan PDF hasil scan dibaca dengan OCR (bahasa Indonesia dan Inggris, tanpa internet). Teks bisa dilihat dari tombol "Lihat teks" di daftar file dan dipakai untuk pencarian. OCR bisa dimatikan di Pengaturan. Ada juga menu **OCR** untuk user: unggah foto, scan, atau dokumen, lalu teksnya bisa disalin atau diunduh tanpa file itu disimpan.
- **Asisten AI** (menu untuk auditor, auditee, dan manajemen): mencari audit, temuan, tindak lanjut, dan isi file atas permintaan, dengan tautan ke datanya. AI hanya melihat data yang boleh dilihat penanya. Penyedia AI yang dipakai adalah Cohere. Bila Cohere kena batas pemakaian gratis atau error, asisten tidak bisa menjawab sampai batasnya pulih. API key, model, urutan, dan peran yang boleh memakai diatur di System Admin (API key disimpan terenkripsi). Pemakaian per penyedia, batas yang tercapai, dan antrian OCR dipantau di Infra Admin.
- **Aktivitas:** log aktivitas, dan untuk admin juga riwayat login (berhasil dan gagal, dengan IP dan perangkat).
- **Log aktivitas:** setiap pembuatan, perubahan, penghapusan, dan unggahan tercatat.
- **Pengingat email (opsional):** setiap hari, PIC menerima daftar temuan yang terlambat atau jatuh tempo dalam 7 hari.

## Teknologi

- Frontend: React + Vite (`web/`)
- Backend: Node.js + Express (`server/`)
- Database: MySQL 8 atau MariaDB 10.4+ (bisa dikelola lewat phpMyAdmin)
- File bukti disimpan di disk server (`UPLOAD_DIR`, atau folder yang dipilih System Admin)

## Mencoba di komputer sendiri (XAMPP + phpMyAdmin)

Cocok untuk Windows. Yang perlu dipasang:

- [XAMPP](https://www.apachefriends.org/) (berisi MySQL/MariaDB dan phpMyAdmin)
- [Node.js](https://nodejs.org/) versi 22 LTS
- [Git](https://git-scm.com/)

Langkah:

1. Buka **XAMPP Control Panel**, klik **Start** pada **Apache** dan **MySQL**.
2. Buka http://localhost/phpmyadmin, klik **New** (Baru), isi nama database `jejak_audit`, pilih collation `utf8mb4_unicode_ci`, lalu klik **Create**. Tabelnya tidak perlu dibuat manual, aplikasi membuatnya sendiri.
3. Buka Command Prompt atau PowerShell, lalu ambil kodenya:

   ```bash
   git clone https://github.com/purwoadhii/audit.git jejak-audit
   cd jejak-audit
   ```

4. Salin `.env.example` menjadi `.env` (`copy .env.example .env` di Command Prompt, atau `cp .env.example .env` di Git Bash). Isi `ADMIN_EMAIL` dan `ADMIN_PASSWORD` untuk akun admin pertama. `DATABASE_URL` sudah cocok untuk XAMPP bawaan (user `root` tanpa kata sandi). Kalau user root MySQL Anda memakai kata sandi, tulis sebagai `mysql://root:KATASANDI@localhost:3306/jejak_audit`.
5. Pasang dan jalankan:

   ```bash
   npm run setup
   npm start
   ```

6. Buka http://localhost:3000 dan masuk dengan username `admin` (atau `ADMIN_EMAIL`) dan `ADMIN_PASSWORD` dari `.env`.

Setelah aplikasi jalan, semua tabel (antara lain `users`, `audits`, `findings`, `settings`, `login_history`, dan `sessions`) bisa dilihat di phpMyAdmin pada database `jejak_audit`. File bukti yang diunggah disimpan di folder `server/uploads`.

Untuk memperbarui ke versi terbaru: `git pull`, lalu `npm run setup` dan `npm start` lagi.

## Menjalankan di server (Docker)

Butuh server Linux dengan Docker dan Docker Compose.

```bash
git clone https://github.com/purwoadhii/audit.git jejak-audit
cd jejak-audit
cp .env.example .env
# Edit .env: isi DB_PASSWORD, DB_ROOT_PASSWORD, JWT_SECRET (openssl rand -hex 32), ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up -d --build
```

Aplikasi berjalan di `http://IP-SERVER:3000`. Masuk dengan username `admin` (atau `ADMIN_EMAIL`) dan `ADMIN_PASSWORD`, lalu segera ganti kata sandi lewat menu **Akun**.

Data database dan file bukti disimpan di volume Docker `db-data` dan `uploads`, jadi tetap ada saat aplikasi diperbarui.

Untuk membuka phpMyAdmin di server: `docker compose --profile tools up -d`, lalu buka `http://IP-SERVER:8080` dan masuk dengan user `jejak` dan `DB_PASSWORD`. Sebaiknya port 8080 tidak dibuka ke internet.

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
docker compose exec db sh -c 'mariadb-dump -ujejak -p"$MARIADB_PASSWORD" jejak_audit' > backup-$(date +%F).sql
docker run --rm -v jejak-audit_uploads:/data -v "$PWD":/out alpine tar czf /out/uploads-$(date +%F).tgz -C /data .
```

## Pengembangan

Untuk mengubah tampilan dengan hot reload, jalankan backend dan frontend terpisah:

```bash
npm --prefix server run dev   # API di http://localhost:3000
npm --prefix web run dev      # buka http://localhost:5173
```

### Tes

Untuk ikut menguji penyimpanan S3, tambahkan `TEST_S3_ENDPOINT` yang menunjuk ke server S3 uji (misalnya MinIO).

Tes API berjalan terhadap database MySQL/MariaDB sungguhan dan **menghapus semua tabelnya** setiap kali jalan. Buat database terpisah bernama `jejak_audit_test` di phpMyAdmin, lalu:

```bash
cd server
TEST_DATABASE_URL=mysql://root:@localhost:3306/jejak_audit_test npm test
```

## Konfigurasi

Semua pengaturan ada di `.env` (lihat `.env.example`):

| Variabel | Keterangan |
| --- | --- |
| `DATABASE_URL` | Koneksi MySQL/MariaDB, misalnya `mysql://root:@localhost:3306/jejak_audit` (diisi otomatis oleh docker-compose) |
| `DB_PASSWORD`, `DB_ROOT_PASSWORD` | Kata sandi database untuk docker-compose |
| `JWT_SECRET` | Rahasia sesi login, minimal 32 karakter, wajib di production |
| `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Akun System Admin pertama, dibuat hanya bila belum ada pengguna. Username bawaan `admin` |
| `INFRA_USERNAME`, `INFRA_PASSWORD`, `INFRA_EMAIL` | Akun Infra Admin untuk developer, dibuat bila username itu belum ada |
| `COOKIE_SECURE` | `true` bila diakses lewat HTTPS |
| `MAX_UPLOAD_MB` | Ukuran maksimal file bukti (bawaan 20) |
| `SMTP_*`, `REMINDER_HOUR` | Email pengingat harian, nonaktif bila `SMTP_HOST` kosong |
