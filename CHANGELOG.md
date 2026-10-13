# Riwayat versi

Nomor versi: MAYOR.MINOR.PERBAIKAN. Versi minor naik saat ada fitur baru, versi perbaikan naik saat ada perbaikan tanpa fitur baru.

## 1.7.1 - 2026-10-13
- Peran Super Admin berganti nama menjadi Super User. Hak aksesnya tidak berubah.

## 1.7.0 - 2026-10-13
- Jenis catatan baru: Isu, di samping Temuan. Isu bernomor ISU-tahun-urut dan punya isian serta tindak lanjut yang sama dengan temuan.
- Tombol Tambah temuan dan Tambah isu di halaman audit membuka form dengan tab Temuan dan Isu. Beberapa temuan dan isu bisa diisi lalu disimpan sekaligus.
- Daftar audit dan halaman audit menampilkan jumlah temuan dan jumlah isu. Laporan audit memisahkan bagian temuan dan isu.

## 1.6.0 - 2026-10-13
- Peran baru Super Admin untuk akun pengguna: melihat dan mengerjakan audit semua unit seperti auditor, walaupun akunnya punya unit.
- Super Admin masuk di halaman pengguna dan diatur oleh System Admin. Ia tidak mengatur akun atau pengaturan aplikasi.

## 1.5.0 - 2026-10-13
- Audit hanya terlihat oleh pengguna di unit yang sama. Auditor dan manajemen tanpa unit melihat audit semua unit.
- Pengguna yang punya unit hanya bisa membuat audit untuk unitnya sendiri. Anggota tim dari unit lain tetap bisa melihat audit yang ia ikuti.

## 1.4.1 - 2026-10-13
- Daftar pilihan bahasa di bilah atas tidak lagi terpotong, jadi semua bahasa bisa dipilih.

## 1.4.0 - 2026-10-12
- Pilihan bahasa per pengguna: English, Bahasa Indonesia, Bahasa Melayu, 简体中文, 日本語, dan 한국어. Bahasa bawaan English.
- Tombol bahasa ada di bilah atas setiap halaman dan di halaman login. Pilihan disimpan di akun masing-masing.
- Asisten AI menjawab dalam bahasa pengguna.

## 1.3.0 - 2026-10-12
- Paket lisensi Standar dan Pro. OCR dan Asisten AI hanya ada di paket Pro; menu keduanya tidak muncul di paket Standar.
- Batas pengguna lisensi menghitung semua akun aktif kecuali Infra Admin dan satu System Admin. System Admin tambahan ikut dihitung.
- Halaman lisensi menampilkan paket, fitur, dan rincian hitungan pengguna. Peringatan lisensi langsung hilang setelah lisensi dipasang.
- Pembuat lisensi tanpa perintah: server/scripts/pembuat-lisensi.html, dibuka di Chrome atau Edge.

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
