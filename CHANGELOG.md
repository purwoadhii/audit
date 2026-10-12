# Riwayat versi

Nomor versi: MAYOR.MINOR.PERBAIKAN. Versi minor naik saat ada fitur baru, versi perbaikan naik saat ada perbaikan tanpa fitur baru.

## 1.2.0 - 2026-10-12
- Tiga pintu masuk terpisah: pengguna di /, System Admin di /sysAdmin, Infra Admin di /infraAdmin. Setiap pintu punya halaman login dan sesi sendiri.
- Infra Admin mengatur lisensi, akun System Admin, keamanan login, dan memantau aktivitas admin.
- System Admin mengatur akun pengguna, template, tampilan, data master, penyimpanan, dan Asisten AI.
- Lisensi aplikasi: nama pelanggan, batas jumlah pengguna, dan masa berlaku. Tanpa lisensi, aplikasi berjalan 30 hari masa uji coba.
- Nomor versi tampil di halaman login dan di setiap halaman, riwayat versi di Infra Admin.
- Tampilan baru: menu dengan ikon, kartu ringkasan berwarna, dan menu samping untuk System Admin dan Infra Admin.
- Gambar latar untuk halaman setelah login, dengan tombol Simpan dan Hapus.
- Logo OTI di samping nama aplikasi.

## 1.1.0 - 2026-10-08
- OCR: isi PDF, Word, Excel, PowerPoint, dan gambar dibaca otomatis supaya bisa dicari.
- Menu OCR untuk membaca teks dari file tanpa menyimpannya.
- Asisten AI untuk mencari audit, temuan, dan isi file, memakai Cohere.

## 1.0.0 - 2026-10-07
- Versi pertama: audit, program kerja, temuan, tindak lanjut, laporan, dan ringkasan.
- Peran auditor, auditee, manajemen, System Admin, dan Infra Admin.
- Riwayat login, sesi aktif, log aktivitas, dan mode perbaikan.
- Penyimpanan file bukti di folder lokal atau S3.
- Tema warna dan teks halaman login bisa diatur.
