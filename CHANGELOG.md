# Riwayat versi

Nomor versi: MAYOR.MINOR.PERBAIKAN. Versi minor naik saat ada fitur baru, versi perbaikan naik saat ada perbaikan tanpa fitur baru.

## 1.16.0 - 2026-10-16
- Menu Pengaturan menu baru di System Admin: setiap menu aplikasi pengguna dan sub-menunya (Perencanaan dan Timesheet) bisa dinyalakan atau dimatikan dengan sakelar. Menu yang dimatikan tidak tampil dan halamannya tidak bisa dibuka, tetapi datanya tetap tersimpan.
- Penilaian risiko di menu Perencanaan dan menu Analitik dimatikan untuk sementara. Keduanya bisa dinyalakan lagi di Pengaturan menu.

## 1.15.0 - 2026-10-16
- Timesheet: auditor mencatat jam kerja harian per audit (perencanaan, pekerjaan lapangan, pelaporan, tindak lanjut) atau kegiatan lain seperti pelatihan dan rapat. Ringkasan per tahun menunjukkan realisasi jam dibanding anggaran di rencana audit, per auditor dan per audit, dan bisa diekspor ke Excel.
- Rencana audit tahunan dan halaman audit kini menampilkan realisasi jam dari timesheet di samping anggaran jam.
- Menu Analitik baru: tren temuan baru dan ditutup per bulan, umur temuan terbuka yang terlambat, rata-rata lama penyelesaian dan ketepatan waktu per tingkat risiko, kategori temuan dan akar masalah, temuan berulang di unit yang sama, dan perbandingan antarunit.
- Tanda tangan elektronik: setiap pengguna bisa membuat tanda tangan di Akun saya. Saat ketua tim meneruskan laporan dan saat penyetuju menyetujui, laporan ditandatangani dengan gambar tanda tangan, sidik isi laporan, dan kode verifikasi. Laporan dan dokumen Word menampilkan tanda tangan dan kode QR yang bisa dicek siapa saja di halaman verifikasi, termasuk apakah isi laporan berubah setelah ditandatangani. System Admin bisa mewajibkan tanda tangan dan kata sandi saat menandatangani.
- Login SSO dengan Google Workspace, Microsoft Entra ID (Microsoft 365), atau penyedia OpenID Connect lain. Akun dicocokkan dengan email, domain email bisa dibatasi, akun baru bisa dibuat otomatis, dan login dengan kata sandi bisa dimatikan. Diatur di System Admin → Login SSO.
- Multi-entitas untuk grup usaha: audit, pengguna, area audit, dan rencana audit dikaitkan ke perusahaan induk atau anak usaha. Pengguna yang diberi perusahaan hanya melihat audit perusahaannya, dan pengguna lain bisa memilih perusahaan di bilah atas. Diaktifkan di System Admin → Pengaturan → Multi-entitas.
- Mode offline: aplikasi bisa dipasang di komputer atau ponsel, dan halaman yang pernah dibuka tetap bisa dilihat saat koneksi terputus. Perubahan baru bisa disimpan setelah terhubung lagi.
- Data awal kini berisi 10 audit (termasuk audit yang sudah selesai sejak awal tahun), kategori temuan, timesheet tim audit sejak Januari, tanda tangan elektronik, dan laporan yang sudah ditandatangani.

## 1.14.0 - 2026-10-16
- Menu Perencanaan baru untuk auditor, Super User, dan manajemen, berisi audit universe, penilaian risiko, dan rencana audit tahunan.
- Audit universe: daftar semua area yang bisa diaudit (proses bisnis, sistem informasi, vendor, lokasi, unit organisasi) dengan unit, pemilik proses, dan tanggal audit terakhirnya. Jenis area diatur di System Admin → Pengaturan → Perencanaan audit.
- Penilaian risiko tahunan dengan matriks 5×5 (kemungkinan × dampak) sesuai praktik umum IIA dan COSO. Skor 1 sampai 25 dibagi menjadi Rendah, Sedang, Tinggi, dan Sangat tinggi, dan aplikasi menyarankan kapan area perlu diaudit lagi: risiko Tinggi ke atas setiap tahun, Sedang setiap 2 tahun, Rendah setiap 3 tahun.
- Rencana audit tahunan per triwulan dengan ketua tim, alokasi auditor, dan anggaran jam. Beban kerja setiap auditor dibandingkan dengan kapasitas jam per tahun, dan rencana bisa diekspor ke Excel.
- Audit bisa dibuat langsung dari rencana, dan audit bisa dihubungkan ke area di audit universe.
- Ringkasan menampilkan progres rencana audit tahun ini.
- Data awal kini berisi audit universe, penilaian risiko, dan rencana audit tahun ini.

## 1.13.0 - 2026-10-16
- Persetujuan laporan berjenjang: tim audit mengajukan, ketua tim mereview, lalu penyetuju menyetujui. Penyetuju dipilih di setiap audit dari akun Manajemen (Manager) atau auditee di unit yang diaudit (Kepala unit). Ketua tim atau penyetuju bisa mengembalikan laporan dengan alasan.
- Audit baru bisa berstatus Selesai setelah laporannya disetujui. Selama menunggu persetujuan atau sesudah disetujui, isi audit dan temuan terkunci, tetapi tindak lanjut tetap berjalan. Aturan ini bisa dimatikan di System Admin → Pengaturan → Persetujuan laporan.
- Ketua tim mereview (sign-off) setiap langkah program kerja dan setiap temuan, atau semuanya sekaligus. Langkah atau temuan yang diubah sesudahnya harus direview ulang.
- File bukti punya versi: unggah versi baru tanpa menghapus yang lama, dan lihat riwayat versinya.
- Notifikasi di dalam aplikasi (ikon lonceng) untuk pengajuan, persetujuan, pengembalian laporan, penunjukan PIC, dan tanggapan auditee.
- Laporan dan dokumen Word menampilkan tanggal review ketua tim dan tanggal persetujuan.
- Data awal kini berisi penyetuju dan contoh audit di setiap tahap persetujuan.

## 1.12.0 - 2026-10-16
- Temuan dan isu punya kategori temuan dan kategori akar masalah. Daftar pilihannya diatur di System Admin → Pengaturan → Data master, dan daftar temuan bisa difilter per kategori.
- Daftar audit dan daftar temuan bisa diekspor ke Excel, dan laporan audit bisa diunduh sebagai dokumen Word.
- Halaman Rekap baru merangkum semua audit dalam satu periode (tahun, semester, atau tanggal bebas): per unit, risiko dan status, kategori temuan, dan akar masalah. Rekap bisa dicetak ke PDF atau diekspor ke Excel.
- Log aktivitas kini mencatat nilai sebelum dan sesudah setiap perubahan pada audit, temuan, akun, dan pengaturan.
- Backup database otomatis setiap hari (bawaan jam 02.00, 14 file terakhir disimpan). Infra Admin → Backup database untuk mengatur jadwal, membuat backup sekarang, dan mengunduh atau menghapus file backup.

## 1.11.2 - 2026-10-15
- Daftar pilihan unit (dan model di Asisten AI) kini selalu putih seperti dropdown lain. Sebelumnya daftar ini ikut tema gelap Windows sehingga tampil hitam.

## 1.11.1 - 2026-10-15
- Di bilah atas halaman pengguna, di bawah nama kini hanya tampil divisi atau unit, tanpa peran.

## 1.11.0 - 2026-10-14
- Daftar audit dan daftar temuan punya kolom Aksi untuk mengubah dan menghapus langsung dari tabel, dengan konfirmasi sebelum menghapus.
- Daftar panjang dibagi per halaman (10, 25, 50, atau 100 baris): audit, temuan, log aktivitas, pengguna, riwayat login, dan sesi aktif.
- Filter daftar temuan kini satu baris, termasuk pilihan Terlambat saja.
- Papan tindak lanjut punya pencarian dan filter (jenis, risiko, audit, terlambat), dan setiap kolom menampilkan 5 kartu per halaman.
- Log aktivitas punya pencarian dan filter pengguna, aktivitas, dan jenis data, serta menampilkan hingga 1000 aktivitas terakhir. Daftar pengguna punya pencarian dan filter peran serta status.

## 1.10.0 - 2026-10-14
- Data contoh diganti menjadi Data awal yang realistis: 12 akun (tim audit internal, direksi, dan kepala divisi), 7 audit di 6 divisi, lengkap dengan temuan, isu, dan riwayat tindak lanjut. Tidak ada lagi nama atau username contoh.
- Semua akun data awal memakai kata sandi awal acak yang tampil di menu Data awal, bersama daftar akunnya. Tombol Hapus data awal menghapus semuanya lagi.

## 1.9.0 - 2026-10-14
- Audit tidak lagi dibatasi per unit secara bawaan: semua auditor dan manajemen melihat audit semua unit. Batas per unit bisa dinyalakan lagi di System Admin → Pengaturan → Data master.
- Data contoh punya menu sendiri di System Admin, dan kini ada akun contoh Super User.

## 1.8.0 - 2026-10-14
- Data contoh di System Admin → Data contoh: sekali klik mengisi 5 akun pengguna (satu untuk setiap peran), 4 audit di tiga unit, program kerja, temuan, dan isu. Tombol Hapus data contoh menghapus semuanya lagi.
- Akun pengguna bisa dihapus dari form ubah akun. Temuan dan riwayatnya tetap ada tanpa nama pengguna.
- Menghapus audit atau temuan sekarang ikut menghapus file buktinya dari penyimpanan.

## 1.7.2 - 2026-10-14
- Database dibuat otomatis saat aplikasi dijalankan bila belum ada, jadi tidak lagi berhenti dengan pesan Unknown database.

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
