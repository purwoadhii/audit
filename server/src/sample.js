import crypto from 'node:crypto';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { query, tx, logActivity } from './db.js';
import { badRequest, N_ } from './errors.js';
import { getSettings, saveInternal } from './settings.js';
import { assertUserSlot } from './license.js';
import { nextCode } from './codes.js';
import { removeFilesOf } from './files.js';
import { signApproval } from './esign.js';

// Tanda tangan elektronik setiap akun data awal (gambar PNG), dipakai saat menandatangani laporan.
const SIGNATURES = JSON.parse(fs.readFileSync(new URL('./sample-signatures.json', import.meta.url), 'utf8'));

// Data awal yang realistis untuk mulai memakai aplikasi: tim Satuan Pengawasan Intern (SPI), direksi,
// PIC di enam divisi, tujuh audit lengkap dengan program kerja, temuan, isu, dan riwayat tindak lanjut,
// serta audit universe, penilaian risiko, dan rencana audit tahunan.
// Id yang dibuat disimpan di pengaturan sample_data, jadi semuanya bisa dihapus lagi sekaligus.

const USERS = [
  { key: 'hendra', name: 'Hendra Wijaya', username: 'hendra.wijaya', role: 'superadmin', unit: 'Satuan Pengawasan Intern', title: 'Kepala SPI' },
  { key: 'rina', name: 'Rina Wulandari', username: 'rina.wulandari', role: 'auditor', unit: null, title: 'Auditor Senior' },
  { key: 'fajar', name: 'Fajar Nugroho', username: 'fajar.nugroho', role: 'auditor', unit: null, title: 'Auditor' },
  { key: 'dewi', name: 'Dewi Lestari', username: 'dewi.lestari', role: 'auditor', unit: null, title: 'Auditor TI' },
  { key: 'bambang', name: 'Bambang Sutrisno', username: 'bambang.sutrisno', role: 'manajemen', unit: null, title: 'Direktur Utama' },
  { key: 'sri', name: 'Sri Rahayu', username: 'sri.rahayu', role: 'manajemen', unit: null, title: 'Direktur Keuangan' },
  { key: 'keuangan', name: 'Agus Setiawan', username: 'agus.setiawan', role: 'auditee', unit: 'Divisi Keuangan', title: 'Kepala Divisi Keuangan' },
  { key: 'pengadaan', name: 'Yuliana Putri', username: 'yuliana.putri', role: 'auditee', unit: 'Divisi Pengadaan', title: 'Kepala Divisi Pengadaan' },
  { key: 'ti', name: 'Rudi Hartono', username: 'rudi.hartono', role: 'auditee', unit: 'Divisi Teknologi Informasi', title: 'Kepala Divisi TI' },
  { key: 'sdm', name: 'Nurul Hidayah', username: 'nurul.hidayah', role: 'auditee', unit: 'Divisi SDM', title: 'Kepala Divisi SDM' },
  { key: 'operasional', name: 'Eko Prasetyo', username: 'eko.prasetyo', role: 'auditee', unit: 'Divisi Operasional', title: 'Kepala Divisi Operasional' },
  { key: 'pemasaran', name: 'Maria Kristina', username: 'maria.kristina', role: 'auditee', unit: 'Divisi Pemasaran', title: 'Kepala Divisi Pemasaran' },
];
const UNITS = ['Divisi Keuangan', 'Divisi Pengadaan', 'Divisi Teknologi Informasi', 'Divisi SDM', 'Divisi Operasional', 'Divisi Pemasaran'];

// Tanggal relatif terhadap hari ini supaya data selalu terlihat baru (ada yang berjalan dan ada yang terlambat).
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const at = (n, time = '09:00:00') => `${day(Math.min(0, n))} ${time}`;

const AUDITS = [
  {
    title: 'Audit Pengadaan Barang dan Jasa Semester II', unit: 'Divisi Pengadaan', type: 'Pengadaan', status: 'Pelaksanaan', start: -45, end: 30,
    lead: 'rina', members: ['fajar'], owner: 'pengadaan',
    scope: 'Menilai kepatuhan proses pengadaan terhadap SOP, mulai dari permintaan pembelian sampai pembayaran ke vendor.',
    steps: [
      ['Periksa kelengkapan permintaan pembelian dan persetujuannya', 'Sesuai', 'Sampel 25 PR, semua sudah disetujui atasan.'],
      ['Uji pemilihan vendor: minimal tiga penawaran untuk nilai di atas Rp50 juta', 'Tidak sesuai', '4 dari 12 PO hanya punya satu penawaran.'],
      ['Cocokkan PO, berita acara serah terima, dan faktur', 'Sesuai', ''],
      ['Periksa daftar vendor aktif dan dokumen legalitasnya', 'Tidak sesuai', 'NPWP 3 vendor sudah tidak berlaku.'],
      ['Uji pemisahan tugas antara pemesan dan penerima barang', 'Belum diuji', ''],
      ['Analisis pembelian berulang ke vendor yang sama', 'Belum diuji', ''],
    ],
    findings: [
      { kind: 'temuan', title: 'Pengadaan di atas Rp50 juta tanpa tiga penawaran', category: 'Kepatuhan', root_cause: 'Proses atau prosedur', risk: 'Tinggi', step: 1, due: -10, status: 'Dalam proses',
        condition: '4 dari 12 PO bernilai di atas Rp50 juta hanya memiliki satu penawaran harga.', criteria: 'SOP Pengadaan bab 4.2: minimal tiga penawaran untuk nilai di atas Rp50 juta.',
        cause: 'Permintaan mendesak dari pengguna dan belum ada daftar vendor cadangan.', effect: 'Risiko harga tidak wajar dan konflik kepentingan.',
        recommendation: 'Wajibkan tiga penawaran atau persetujuan direksi untuk pengecualian, dan susun daftar vendor cadangan.',
        response: 'Setuju. Daftar vendor cadangan sedang disusun.', logs: ['Rapat pembahasan dengan Kepala Divisi Pengadaan sudah dilakukan.'] },
      { kind: 'temuan', title: 'Dokumen legalitas vendor kedaluwarsa', category: 'Pengendalian internal', root_cause: 'Sistem atau teknologi', risk: 'Sedang', step: 3, due: 20, status: 'Terbuka',
        condition: 'NPWP dan NIB tiga vendor aktif sudah tidak berlaku.', criteria: 'Kebijakan Manajemen Vendor: dokumen legalitas diperbarui setiap tahun.',
        cause: 'Tidak ada pengingat masa berlaku dokumen.', effect: 'Transaksi dengan vendor yang tidak memenuhi syarat.',
        recommendation: 'Perbarui dokumen ketiga vendor dan buat pengingat masa berlaku di sistem.', response: '', logs: [] },
      { kind: 'isu', title: 'Belum ada pelatihan SOP pengadaan untuk staf baru', category: 'Operasional', root_cause: 'Manusia', risk: 'Rendah', due: 45, status: 'Terbuka',
        condition: 'Dua staf baru belum pernah mengikuti sosialisasi SOP pengadaan.', criteria: '', cause: '', effect: 'Kesalahan prosedur berulang.',
        recommendation: 'Jadwalkan sosialisasi SOP setiap ada staf baru.', response: '', logs: [] },
    ],
  },
  {
    title: 'Audit Kas dan Bank Triwulan III', unit: 'Divisi Keuangan', type: 'Keuangan', status: 'Pelaporan', start: -90, end: -20,
    approval: 'review',
    lead: 'fajar', members: ['rina'], owner: 'keuangan',
    scope: 'Memeriksa pengelolaan kas kecil, rekonsiliasi bank, dan otorisasi pembayaran.',
    steps: [
      ['Lakukan cash opname kas kecil', 'Sesuai', 'Selisih Rp0.'],
      ['Periksa rekonsiliasi bank tiga bulan terakhir', 'Tidak sesuai', 'Rekonsiliasi Agustus belum ditandatangani.'],
      ['Uji otorisasi pembayaran di atas Rp100 juta', 'Sesuai', ''],
      ['Periksa pembatasan akses internet banking', 'Tidak sesuai', 'Satu akun maker juga punya hak approver.'],
      ['Konfirmasi saldo bank ke pihak bank', 'Tidak berlaku', 'Dilakukan auditor eksternal.'],
    ],
    findings: [
      { kind: 'temuan', title: 'Rekonsiliasi bank terlambat dan belum disetujui', category: 'Keuangan', root_cause: 'Manusia', risk: 'Sedang', step: 1, due: -5, status: 'Menunggu verifikasi',
        condition: 'Rekonsiliasi bank bulan Agustus selesai 25 hari setelah tutup buku dan belum ditandatangani manajer.',
        criteria: 'SOP Keuangan: rekonsiliasi selesai paling lambat 10 hari kerja setelah tutup buku.',
        cause: 'Staf rekonsiliasi merangkap tugas pelaporan pajak.', effect: 'Selisih kas terlambat terdeteksi.',
        recommendation: 'Tetapkan penanggung jawab cadangan dan pantau tenggat rekonsiliasi setiap bulan.',
        response: 'Rekonsiliasi sudah ditandatangani dan penanggung jawab cadangan ditunjuk.', logs: ['Bukti rekonsiliasi yang sudah ditandatangani dikirim lewat email.'] },
      { kind: 'temuan', title: 'Pemisahan tugas maker dan approver di internet banking', category: 'Pengendalian internal', root_cause: 'Proses atau prosedur', risk: 'Tinggi', step: 3, due: 7, status: 'Dalam proses',
        condition: 'Satu pengguna internet banking memiliki hak membuat sekaligus menyetujui transaksi.',
        criteria: 'Kebijakan Otorisasi: pembuat dan penyetuju transaksi harus orang yang berbeda.',
        cause: 'Pengaturan hak akses tidak ditinjau setelah rotasi pegawai.', effect: 'Risiko pembayaran tanpa persetujuan.',
        recommendation: 'Cabut hak approver dari akun maker dan tinjau hak akses setiap enam bulan.', response: 'Permintaan perubahan hak akses sudah dikirim ke bank.', logs: [] },
      { kind: 'isu', title: 'Saldo kas kecil sering mendekati batas', category: 'Keuangan', root_cause: 'Kebijakan', risk: 'Rendah', due: 30, status: 'Terbuka',
        condition: 'Dalam tiga bulan, kas kecil lima kali habis sebelum pengisian ulang.', criteria: '', cause: '', effect: 'Pembayaran operasional tertunda.',
        recommendation: 'Tinjau ulang plafon kas kecil.', response: '', logs: [] },
    ],
  },
  {
    title: 'Audit Keamanan Sistem Informasi', unit: 'Divisi Teknologi Informasi', type: 'Teknologi Informasi', status: 'Perencanaan', start: 10, end: 60,
    lead: 'dewi', members: [], owner: 'ti',
    scope: 'Menilai pengelolaan hak akses, backup, dan penanganan insiden keamanan.',
    steps: [
      ['Tinjau daftar akun aktif dan hak aksesnya', 'Belum diuji', ''],
      ['Uji pemulihan dari backup', 'Belum diuji', ''],
      ['Periksa log insiden keamanan enam bulan terakhir', 'Belum diuji', ''],
      ['Periksa kebijakan kata sandi di aplikasi utama', 'Belum diuji', ''],
    ],
    findings: [],
  },
  {
    title: 'Audit Penggajian dan Tunjangan Karyawan', unit: 'Divisi SDM', type: 'Kepatuhan', status: 'Pelaksanaan', start: -30, end: 15,
    lead: 'dewi', members: ['fajar'], owner: 'sdm',
    scope: 'Menguji ketepatan perhitungan gaji, tunjangan, dan pemotongan BPJS serta PPh 21, termasuk data karyawan masuk dan keluar.',
    steps: [
      ['Cocokkan daftar gaji dengan data karyawan aktif', 'Tidak sesuai', '2 karyawan yang sudah resign masih tercantum di daftar gaji September.'],
      ['Uji perhitungan PPh 21 untuk 30 sampel karyawan', 'Sesuai', ''],
      ['Periksa persetujuan perubahan gaji dan promosi', 'Sesuai', ''],
      ['Periksa setoran iuran BPJS Kesehatan dan Ketenagakerjaan', 'Tidak sesuai', 'Setoran Agustus terlambat 6 hari.'],
      ['Uji pembayaran lembur terhadap surat perintah lembur', 'Belum diuji', ''],
    ],
    findings: [
      { kind: 'temuan', title: 'Gaji masih dibayarkan kepada karyawan yang sudah resign', category: 'Keuangan', root_cause: 'Proses atau prosedur', risk: 'Tinggi', step: 0, due: 5, status: 'Dalam proses',
        condition: 'Dua karyawan yang resign pada Agustus masih menerima gaji September sebesar total Rp18,4 juta.',
        criteria: 'SOP Penggajian: data karyawan keluar diperbarui paling lambat tanggal 20 setiap bulan.',
        cause: 'Formulir pengunduran diri tidak diteruskan ke bagian penggajian.', effect: 'Kerugian perusahaan dan risiko kecurangan.',
        recommendation: 'Tagih kembali kelebihan bayar dan buat checklist offboarding yang melibatkan bagian penggajian.',
        response: 'Penagihan sudah dikirim ke kedua mantan karyawan.', logs: ['Satu mantan karyawan sudah mengembalikan kelebihan bayar.'] },
      { kind: 'temuan', title: 'Setoran iuran BPJS terlambat', category: 'Kepatuhan', root_cause: 'Proses atau prosedur', risk: 'Sedang', step: 3, due: 25, status: 'Terbuka',
        condition: 'Iuran BPJS Ketenagakerjaan bulan Agustus disetor 6 hari setelah batas waktu.',
        criteria: 'Peraturan BPJS: iuran disetor paling lambat tanggal 15 bulan berikutnya.', cause: 'Persetujuan pembayaran menunggu direktur yang sedang dinas.',
        effect: 'Denda keterlambatan dan risiko layanan peserta terganggu.', recommendation: 'Tetapkan pejabat pengganti untuk persetujuan pembayaran rutin.', response: '', logs: [] },
      { kind: 'isu', title: 'Data rekening karyawan belum diverifikasi ulang', category: 'Pengendalian internal', root_cause: 'Proses atau prosedur', risk: 'Sedang', due: 40, status: 'Terbuka',
        condition: 'Perubahan nomor rekening karyawan cukup lewat email tanpa verifikasi.', criteria: '', cause: '', effect: 'Risiko pengalihan gaji ke rekening yang salah.',
        recommendation: 'Wajibkan formulir bertanda tangan dan verifikasi telepon untuk perubahan rekening.', response: '', logs: [] },
    ],
  },
  {
    title: 'Audit Persediaan Gudang Pusat', unit: 'Divisi Operasional', type: 'Operasional', status: 'Selesai', start: -120, end: -75,
    lead: 'rina', members: ['dewi'], owner: 'operasional',
    scope: 'Menguji keberadaan dan pencatatan persediaan di gudang pusat melalui stock opname dan penelusuran dokumen keluar masuk barang.',
    steps: [
      ['Lakukan stock opname untuk 50 item bernilai tertinggi', 'Tidak sesuai', 'Selisih 3 item senilai Rp12 juta.'],
      ['Telusuri dokumen penerimaan barang ke kartu stok', 'Sesuai', ''],
      ['Periksa barang rusak dan kedaluwarsa', 'Sesuai', ''],
      ['Periksa pembatasan akses ke gudang', 'Sesuai', ''],
    ],
    findings: [
      { kind: 'temuan', title: 'Selisih hasil stock opname dengan kartu stok', category: 'Operasional', root_cause: 'Manusia', risk: 'Sedang', step: 0, due: -60, closed: -64, status: 'Selesai',
        condition: 'Tiga item suku cadang kurang dari catatan kartu stok dengan nilai Rp12 juta.', criteria: 'SOP Gudang: selisih stock opname ditindaklanjuti dalam 14 hari.',
        cause: 'Pengeluaran barang darurat tidak segera dicatat.', effect: 'Laporan persediaan tidak akurat.',
        recommendation: 'Catat setiap pengeluaran darurat paling lambat hari kerja berikutnya dan lakukan opname bulanan.',
        response: 'Selisih sudah ditelusuri dan dijurnal koreksi.', logs: ['Jurnal koreksi sudah dibuat.', 'Ditutup setelah bukti diperiksa auditor.'] },
    ],
  },
  {
    title: 'Audit Kepatuhan Perjalanan Dinas', unit: 'Divisi Keuangan', type: 'Kepatuhan', status: 'Selesai', start: -180, end: -130,
    lead: 'fajar', members: [], owner: 'keuangan',
    scope: 'Memeriksa kepatuhan klaim perjalanan dinas terhadap kebijakan perusahaan.',
    steps: [
      ['Periksa kelengkapan bukti klaim perjalanan dinas', 'Tidak sesuai', '3 klaim tanpa boarding pass.'],
      ['Uji kesesuaian tarif hotel dengan batas jabatan', 'Sesuai', ''],
    ],
    findings: [
      { kind: 'temuan', title: 'Klaim perjalanan dinas tanpa bukti lengkap', category: 'Kepatuhan', root_cause: 'Manusia', risk: 'Rendah', step: 0, due: -100, closed: -95, status: 'Selesai',
        condition: 'Tiga klaim dibayar tanpa boarding pass.', criteria: 'Kebijakan Perjalanan Dinas pasal 7.', cause: 'Verifikator tidak memakai daftar periksa.',
        effect: 'Pembayaran klaim yang tidak dapat dibuktikan.', recommendation: 'Gunakan daftar periksa saat verifikasi klaim.',
        response: 'Daftar periksa sudah dipakai sejak bulan lalu.', logs: ['Daftar periksa verifikasi klaim sudah diterapkan.', 'Ditutup setelah bukti diperiksa auditor.'] },
    ],
  },
  {
    title: 'Audit Biaya Promosi dan Event', unit: 'Divisi Pemasaran', type: 'Operasional', status: 'Pelaporan', start: -60, end: -10,
    approver: 'pemasaran', approval: 'persetujuan',
    lead: 'rina', members: ['fajar'], owner: 'pemasaran',
    scope: 'Menilai kewajaran dan kelengkapan bukti biaya promosi, sponsor, dan penyelenggaraan event tahun berjalan.',
    steps: [
      ['Periksa anggaran dan realisasi biaya promosi', 'Sesuai', 'Realisasi 82% dari anggaran.'],
      ['Uji bukti pertanggungjawaban event', 'Tidak sesuai', '2 event tanpa laporan kegiatan.'],
      ['Periksa kontrak sponsor dan pemenuhan kewajiban mitra', 'Sesuai', ''],
    ],
    findings: [
      { kind: 'temuan', title: 'Pertanggungjawaban event tidak lengkap', category: 'Kepatuhan', root_cause: 'Manusia', risk: 'Sedang', step: 1, due: 14, status: 'Dalam proses',
        condition: 'Dua event senilai Rp95 juta tidak dilengkapi laporan kegiatan dan daftar hadir.', criteria: 'Pedoman Biaya Pemasaran: laporan kegiatan wajib diserahkan 7 hari setelah event.',
        cause: 'Tim event langsung menangani kegiatan berikutnya.', effect: 'Biaya tidak dapat dinilai manfaatnya.',
        recommendation: 'Lengkapi laporan kedua event dan jadikan laporan kegiatan syarat pencairan termin akhir.',
        response: 'Laporan sedang disusun oleh tim event.', logs: [] },
      { kind: 'isu', title: 'Belum ada ukuran efektivitas promosi', category: 'Tata kelola', root_cause: 'Kebijakan', risk: 'Rendah', due: 60, status: 'Terbuka',
        condition: 'Divisi belum mengukur hasil promosi terhadap penjualan.', criteria: '', cause: '', effect: 'Anggaran promosi sulit dievaluasi.',
        recommendation: 'Tetapkan indikator efektivitas untuk setiap kegiatan promosi.', response: '', logs: [] },
    ],
  },
  // Audit yang sudah selesai sejak awal tahun dan akhir tahun lalu, supaya analitik punya riwayat
  // (tren, lama penyelesaian, dan temuan berulang di unit yang sama).
  {
    title: 'Audit Pengadaan Barang dan Jasa Semester I', unit: 'Divisi Pengadaan', type: 'Pengadaan', status: 'Selesai', start: -300, end: -255,
    lead: 'fajar', members: ['rina'], owner: 'pengadaan', entity: 'Proses pengadaan barang dan jasa',
    scope: 'Menguji proses pengadaan semester I, khususnya pemilihan vendor dan pengendalian kontrak.',
    steps: [
      ['Uji pemilihan vendor untuk 20 PO bernilai terbesar', 'Tidak sesuai', '5 PO tanpa pembanding harga.'],
      ['Periksa kontrak dan tanggal mulai pekerjaan', 'Tidak sesuai', '2 pekerjaan dimulai sebelum kontrak ditandatangani.'],
      ['Cocokkan penerimaan barang dengan PO', 'Sesuai', ''],
    ],
    findings: [
      { kind: 'temuan', title: 'Pemilihan vendor tanpa pembanding harga', risk: 'Tinggi', step: 0, due: -220, closed: -205, status: 'Selesai',
        category: 'Kepatuhan', root_cause: 'Proses atau prosedur',
        condition: 'Lima PO bernilai di atas Rp50 juta diterbitkan tanpa pembanding harga dari vendor lain.', criteria: 'SOP Pengadaan bab 4.2.',
        cause: 'Pengguna meminta proses dipercepat.', effect: 'Harga pembelian berpotensi lebih tinggi dari harga pasar.',
        recommendation: 'Terapkan formulir pengecualian yang disetujui direksi bila pembanding harga tidak tersedia.',
        response: 'Formulir pengecualian sudah diterapkan.', logs: ['Formulir pengecualian disahkan Direktur Utama.', 'Ditutup setelah bukti diperiksa auditor.'] },
      { kind: 'temuan', title: 'Pekerjaan dimulai sebelum kontrak ditandatangani', risk: 'Sedang', step: 1, due: -230, closed: -236, status: 'Selesai',
        category: 'Pengendalian internal', root_cause: 'Manusia',
        condition: 'Dua pekerjaan renovasi dimulai 9 dan 14 hari sebelum kontrak ditandatangani.', criteria: 'Kebijakan Kontrak: pekerjaan dimulai setelah kontrak sah.',
        cause: 'Koordinasi antara pengguna dan bagian legal kurang.', effect: 'Perusahaan tidak terlindungi bila terjadi sengketa.',
        recommendation: 'Bagian legal memberi tanda selesai kontrak sebelum surat perintah kerja terbit.',
        response: 'Alur persetujuan surat perintah kerja sudah diubah.', logs: ['Ditutup setelah bukti diperiksa auditor.'] },
    ],
  },
  {
    title: 'Audit Kas dan Bank Semester I', unit: 'Divisi Keuangan', type: 'Keuangan', status: 'Selesai', start: -260, end: -215,
    lead: 'rina', members: ['fajar'], owner: 'keuangan', entity: 'Pengelolaan kas dan bank',
    scope: 'Memeriksa rekonsiliasi bank dan pengelolaan kas kecil semester I.',
    steps: [
      ['Periksa rekonsiliasi bank Januari sampai Juni', 'Tidak sesuai', 'Rekonsiliasi Maret dan April terlambat.'],
      ['Lakukan cash opname kas kecil', 'Tidak sesuai', 'Saldo kas kecil melebihi plafon.'],
      ['Uji otorisasi pembayaran', 'Sesuai', ''],
    ],
    findings: [
      { kind: 'temuan', title: 'Rekonsiliasi bank Maret dan April terlambat', risk: 'Sedang', step: 0, due: -185, closed: -160, status: 'Selesai',
        category: 'Keuangan', root_cause: 'Proses atau prosedur',
        condition: 'Rekonsiliasi bank Maret dan April selesai lebih dari 20 hari setelah tutup buku.', criteria: 'SOP Keuangan: paling lambat 10 hari kerja.',
        cause: 'Belum ada jadwal tutup buku yang mengikat.', effect: 'Selisih kas terlambat terdeteksi.',
        recommendation: 'Susun kalender tutup buku dan pantau tenggat rekonsiliasi.', response: 'Kalender tutup buku sudah dibuat.',
        logs: ['Kalender tutup buku dibagikan ke tim keuangan.', 'Ditutup setelah bukti diperiksa auditor.'] },
      { kind: 'temuan', title: 'Saldo kas kecil melebihi plafon', risk: 'Rendah', step: 1, due: -195, closed: -200, status: 'Selesai',
        category: 'Keuangan', root_cause: 'Manusia',
        condition: 'Saldo kas kecil Rp27 juta, di atas plafon Rp20 juta.', criteria: 'Kebijakan Kas Kecil: plafon Rp20 juta.',
        cause: 'Pengisian ulang dilakukan sebelum saldo menipis.', effect: 'Risiko kehilangan uang tunai lebih besar.',
        recommendation: 'Setor kelebihan saldo ke bank dan isi ulang hanya sampai plafon.', response: 'Kelebihan saldo sudah disetor.',
        logs: ['Ditutup setelah bukti setoran diperiksa auditor.'] },
    ],
  },
  {
    title: 'Audit Pengelolaan Hak Akses Aplikasi', unit: 'Divisi Teknologi Informasi', type: 'Teknologi Informasi', status: 'Selesai', start: -230, end: -190,
    lead: 'dewi', members: [], owner: 'ti', entity: 'Sistem ERP dan keamanan jaringan',
    scope: 'Menilai pemberian, perubahan, dan pencabutan hak akses di ERP dan aplikasi penjualan.',
    steps: [
      ['Cocokkan akun aktif ERP dengan data karyawan aktif', 'Tidak sesuai', '7 akun milik karyawan yang sudah keluar masih aktif.'],
      ['Periksa penggantian kata sandi akun administrator', 'Tidak sesuai', 'Kata sandi admin tidak diganti sejak 2023.'],
      ['Uji persetujuan permintaan hak akses baru', 'Sesuai', ''],
    ],
    findings: [
      { kind: 'temuan', title: 'Akun karyawan yang sudah keluar masih aktif di ERP', risk: 'Tinggi', step: 0, due: -175, closed: -178, status: 'Selesai',
        category: 'Teknologi Informasi', root_cause: 'Proses atau prosedur',
        condition: 'Tujuh akun ERP milik karyawan yang sudah keluar masih aktif.', criteria: 'Kebijakan Keamanan Informasi: akses dicabut di hari terakhir kerja.',
        cause: 'Divisi SDM tidak memberi tahu Divisi TI saat karyawan keluar.', effect: 'Akses tidak sah ke data perusahaan.',
        recommendation: 'Nonaktifkan akun dan hubungkan proses offboarding SDM dengan permintaan pencabutan akses.',
        response: 'Semua akun sudah dinonaktifkan.', logs: ['Ditutup setelah bukti diperiksa auditor.'] },
      { kind: 'temuan', title: 'Kata sandi akun administrator tidak pernah diganti', risk: 'Sedang', step: 1, due: -170, closed: -140, status: 'Selesai',
        category: 'Teknologi Informasi', root_cause: 'Sistem atau teknologi',
        condition: 'Kata sandi akun administrator ERP dan server basis data tidak diganti sejak 2023.', criteria: 'Kebijakan Kata Sandi: akun istimewa diganti setiap 90 hari.',
        cause: 'Belum ada aplikasi pengelola kata sandi bersama.', effect: 'Risiko penyalahgunaan akun istimewa.',
        recommendation: 'Gunakan pengelola kata sandi dan jadwalkan penggantian berkala.', response: 'Pengelola kata sandi sudah dipasang.',
        logs: ['Pengadaan pengelola kata sandi selesai.', 'Ditutup setelah bukti diperiksa auditor.'] },
    ],
  },
];

// Audit universe dengan penilaian risiko tahun ini (kemungkinan × dampak). Area yang punya audit di atas
// terhubung ke audit itu lewat judulnya dan masuk rencana tahunan; dua area lain direncanakan tapi belum dimulai.
const ENTITIES = [
  { name: 'Proses pengadaan barang dan jasa', kind: 'Proses bisnis', unit: 'Divisi Pengadaan', owner: 'Kepala Divisi Pengadaan', risk: [4, 4],
    notes: 'Nilai transaksi besar dan temuan berulang soal pemilihan vendor.', audit: 'Audit Pengadaan Barang dan Jasa Semester II',
    description: 'Permintaan pembelian, pemilihan vendor, PO, penerimaan barang, sampai pembayaran.' },
  { name: 'Pengelolaan kas dan bank', kind: 'Proses bisnis', unit: 'Divisi Keuangan', owner: 'Kepala Divisi Keuangan', risk: [3, 5],
    notes: 'Risiko penyalahgunaan dana dan selisih rekonsiliasi berdampak langsung ke laporan keuangan.', audit: 'Audit Kas dan Bank Triwulan III',
    description: 'Kas kecil, rekening operasional, rekonsiliasi bank, dan otorisasi pembayaran.' },
  { name: 'Sistem ERP dan keamanan jaringan', kind: 'Sistem informasi', unit: 'Divisi Teknologi Informasi', owner: 'Kepala Divisi TI', risk: [4, 5],
    notes: 'Serangan siber meningkat dan hak akses belum pernah ditinjau menyeluruh.', audit: 'Audit Keamanan Sistem Informasi',
    description: 'Hak akses pengguna, backup, perubahan sistem, dan perlindungan jaringan.' },
  { name: 'Penggajian dan tunjangan', kind: 'Proses bisnis', unit: 'Divisi SDM', owner: 'Kepala Divisi SDM', risk: [3, 3],
    notes: 'Perhitungan otomatis, tetapi masih ada penyesuaian manual setiap bulan.', audit: 'Audit Penggajian dan Tunjangan Karyawan' },
  { name: 'Gudang pusat', kind: 'Lokasi', unit: 'Divisi Operasional', owner: 'Kepala Gudang Pusat', risk: [3, 4],
    notes: 'Nilai persediaan tinggi dan ada selisih stok opname tahun lalu.', audit: 'Audit Persediaan Gudang Pusat' },
  { name: 'Perjalanan dinas', kind: 'Proses bisnis', unit: 'Divisi Keuangan', owner: 'Kepala Divisi Keuangan', risk: [2, 2],
    notes: 'Nilai kecil dan kebijakan sudah jelas.', audit: 'Audit Kepatuhan Perjalanan Dinas' },
  { name: 'Promosi dan event', kind: 'Proses bisnis', unit: 'Divisi Pemasaran', owner: 'Kepala Divisi Pemasaran', risk: [3, 3],
    notes: 'Anggaran promosi naik dan efektivitasnya belum diukur.', audit: 'Audit Biaya Promosi dan Event' },
  { name: 'Vendor jasa logistik dan ekspedisi', kind: 'Vendor', unit: 'Divisi Operasional', owner: 'Kepala Divisi Operasional', risk: [3, 4],
    notes: 'Kontrak besar dan keluhan keterlambatan pengiriman.', plan: { quarter: 4, lead: 'fajar', members: ['dewi'] },
    description: 'Kontrak, tarif, dan kinerja vendor pengiriman barang ke cabang.' },
  { name: 'Rekrutmen dan pelatihan karyawan', kind: 'Proses bisnis', unit: 'Divisi SDM', owner: 'Kepala Divisi SDM', risk: [2, 3],
    notes: 'Belum pernah diaudit.', plan: { quarter: 4, lead: 'rina', members: [] } },
  { name: 'Aplikasi penjualan dan CRM', kind: 'Sistem informasi', unit: 'Divisi Pemasaran', owner: 'Kepala Divisi Pemasaran', risk: [2, 3],
    notes: 'Aplikasi baru dipakai sejak awal tahun.' },
  { name: 'Kantor cabang Surabaya', kind: 'Lokasi', unit: 'Divisi Operasional', owner: 'Kepala Cabang Surabaya' },
];
// Anggaran jam per penugasan di rencana tahunan.
const LEAD_HOURS = 160;
const MEMBER_HOURS = 120;

// Penyetuju laporan: Direktur Keuangan untuk audit Divisi Keuangan, Direktur Utama untuk yang lain,
// kecuali audit yang menyebut penyetuju sendiri (misalnya kepala divisi yang diaudit).
const approverOf = (a) => a.approver || (a.unit === 'Divisi Keuangan' ? 'sri' : 'bambang');
// Posisi di alur persetujuan: audit Selesai sudah disetujui.
const approvalOf = (a) => (a.status === 'Selesai' ? 'disetujui' : a.approval || null);

const pickType = (types, wanted) => types.find((x) => x.toLowerCase() === wanted.toLowerCase()) || types[0] || wanted;

// Email akun baru memakai alias "+" dari email admin, supaya unik dan tetap sampai ke kotak masuk admin.
function aliasEmail(adminEmail, username) {
  const [local, domain] = String(adminEmail || '').toLowerCase().split('@');
  if (!local || !domain) return `${username}@perusahaan.local`;
  return `${local.split('+')[0]}+${username}@${domain}`;
}

export async function sampleStatus() {
  const s = (await getSettings()).sample_data;
  const ids = s?.users || [];
  const { rows } = ids.length
    ? await query(`SELECT id, name, username, role, unit FROM users WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids)
    : { rows: [] };
  const titles = Object.fromEntries(USERS.map((u) => [u.username, u.title]));
  return {
    exists: Boolean(s && (s.users?.length || s.audits?.length)),
    users: rows.map((u) => ({ ...u, title: titles[u.username] || '' })),
    audits: s?.audits?.length || 0,
    password: s?.password || null,
    created_at: s?.created_at || null,
    planned: { users: USERS.length, audits: AUDITS.length, units: UNITS.length, entities: ENTITIES.length },
  };
}

export async function createSample(admin) {
  if ((await sampleStatus()).exists) throw badRequest('Data awal sudah ada. Hapus dulu sebelum mengisi ulang.');
  const taken = await query(`SELECT username FROM users WHERE username IN (${USERS.map(() => '?').join(',')})`, USERS.map((u) => u.username));
  if (taken.rowCount) throw badRequest('Username {name} sudah dipakai. Ganti atau hapus akun itu dulu.', { name: taken.rows[0].username });

  const password = crypto.randomBytes(8).toString('base64url').slice(0, 10);
  const settings = await getSettings();
  const addedUnits = UNITS.filter((u) => !settings.units.some((x) => x.toLowerCase() === u.toLowerCase()));
  const created = { users: [], audits: [], units: addedUnits, entities: [], plan: [] };
  try {
    const ids = {};
    const hash = await bcrypt.hash(password, 10);
    for (const u of USERS) {
      await assertUserSlot(u.role);
      const { insertId } = await query(
        'INSERT INTO users (name, username, email, password_hash, role, unit, signature) VALUES (?,?,?,?,?,?,?)',
        [u.name, u.username, aliasEmail(admin.email, u.username), hash, u.role, u.unit, SIGNATURES[u.key] || null],
      );
      ids[u.key] = insertId;
      created.users.push(insertId);
    }
    const year = new Date().getFullYear();
    const entityOf = {};
    const entityByName = {};
    const timeline = [];
    for (const e of ENTITIES) {
      const { insertId } = await query(
        'INSERT INTO auditable_entities (name, kind, unit, owner, description, created_by) VALUES (?,?,?,?,?,?)',
        [e.name, e.kind, e.unit, e.owner, e.description || null, ids.hendra]);
      created.entities.push(insertId);
      entityByName[e.name] = insertId;
      if (e.audit) entityOf[e.audit] = insertId;
      if (e.risk) {
        await query('INSERT INTO risk_assessments (entity_id, year, likelihood, impact, notes, assessed_by) VALUES (?,?,?,?,?,?)',
          [insertId, year, e.risk[0], e.risk[1], e.notes, ids.hendra]);
      }
      if (e.plan) {
        created.plan.push(await samplePlan({ year, quarter: e.plan.quarter, entity: insertId, title: `Audit ${e.name}`, unit: e.unit,
          type: pickType(settings.audit_types, e.kind === 'Vendor' ? 'Operasional' : 'Kepatuhan'), lead: ids[e.plan.lead],
          members: e.plan.members.map((m) => ids[m]), by: ids.hendra }));
      }
    }
    // Diurutkan dari yang paling lama supaya nomor audit dan temuan mengikuti urutan waktu.
    for (const a of [...AUDITS].sort((x, y) => x.start - y.start)) {
      const auditId = await tx(async (c) => {
        const code = await nextCode(c, 'AUD');
        const { insertId } = await c.query(
          `INSERT INTO audits (code, title, unit, type, status, lead_id, approver_id, approval, entity_id, team, scope, start_date, end_date, created_by, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [code, a.title, a.unit, pickType(settings.audit_types, a.type), a.status, ids[a.lead], ids[approverOf(a)], approvalOf(a),
            entityOf[a.title] ?? entityByName[a.entity] ?? null, null, a.scope, day(a.start), day(a.end), ids.hendra, at(a.start - 14)],
        );
        for (const m of [a.lead, ...a.members]) await c.query('INSERT INTO audit_members (audit_id, user_id) VALUES (?,?)', [insertId, ids[m]]);
        const stepIds = [];
        for (let i = 0; i < a.steps.length; i++) {
          const [text, result, note] = a.steps[i];
          const s = await c.query('INSERT INTO audit_steps (audit_id, position, text, result, note) VALUES (?,?,?,?,?)', [insertId, i, text, result, note]);
          stepIds.push(s.insertId);
        }
        for (const [idx, f] of a.findings.entries()) {
          const fcode = await nextCode(c, f.kind === 'isu' ? 'ISU' : 'TMN');
          // Temuan dicatat beberapa hari setelah pekerjaan lapangan dimulai; temuan Selesai punya tanggal ditutup.
          const opened = Math.min(-1, a.start + 8 + idx * 4);
          const closed = f.status === 'Selesai' ? f.closed ?? f.due : null;
          const r = await c.query(
            `INSERT INTO findings (code, kind, audit_id, step_id, title, risk, status, due_date, owner_id, category, root_cause,
               \`condition\`, criteria, cause, effect, recommendation, response, created_by, created_at, updated_at, closed_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [fcode, f.kind, insertId, f.step !== undefined ? stepIds[f.step] : null, f.title, f.risk, f.status, day(f.due), ids[a.owner],
              f.category || null, f.root_cause || null, f.condition, f.criteria, f.cause, f.effect, f.recommendation, f.response, ids[a.lead],
              at(opened, '10:15:00'), at(closed ?? -1, '15:30:00'), closed === null ? null : at(closed, '15:30:00')],
          );
          await c.query('INSERT INTO finding_logs (finding_id, user_id, text, status, created_at) VALUES (?,?,?,?,?)',
            [r.insertId, ids[a.lead], f.kind === 'isu' ? 'Isu dicatat' : 'Temuan dicatat', 'Terbuka', at(opened, '10:15:00')]);
          // Catatan tindak lanjut tersebar di antara tanggal dicatat dan tanggal ditutup (atau kemarin).
          const last = closed ?? -1;
          for (const [k, text] of f.logs.entries()) {
            const when = Math.round(opened + ((last - opened) * (k + 1)) / f.logs.length);
            await c.query('INSERT INTO finding_logs (finding_id, user_id, text, status, created_at) VALUES (?,?,?,?,?)',
              [r.insertId, ids[a.owner], text, f.status, at(when, '14:00:00')]);
          }
        }
        await sampleApproval(c, insertId, code, a, ids);
        return insertId;
      });
      created.audits.push(auditId);
      timeline.push({ ...a, id: auditId });
      // Audit ini juga tercatat di rencana tahunan, pada triwulan tanggal mulainya.
      const start = new Date(`${day(a.start)}T00:00:00Z`);
      created.plan.push(await samplePlan({ year: start.getUTCFullYear(), quarter: Math.floor(start.getUTCMonth() / 3) + 1, entity: entityOf[a.title] ?? null,
        title: a.title, unit: a.unit, type: pickType(settings.audit_types, a.type), lead: ids[a.lead], members: a.members.map((m) => ids[m]),
        by: ids.hendra, audit: auditId }));
    }
    await sampleTimesheets(timeline, ids);
  } catch (err) {
    await removeIds(created);
    throw err;
  }
  if (addedUnits.length) await saveInternal(admin, 'units', [...settings.units, ...addedUnits]);
  await saveInternal(admin, 'sample_data', { ...created, password, created_at: new Date().toISOString() });
  await logActivity({ query }, admin.id, 'create', 'sample_data', null, { users: created.users.length, audits: created.audits.length });
  return sampleStatus();
}

// Satu penugasan di rencana audit tahunan beserta alokasi jam timnya.
async function samplePlan({ year, quarter, entity, title, unit, type, lead, members, by, audit = null }) {
  const { insertId } = await query(
    'INSERT INTO plan_items (year, entity_id, title, unit, type, quarter, lead_id, audit_id, created_by) VALUES (?,?,?,?,?,?,?,?,?)',
    [year, entity, title, unit, type, quarter, lead, audit, by]);
  for (const [user, hours] of [[lead, LEAD_HOURS], ...members.filter((m) => m !== lead).map((m) => [m, MEMBER_HOURS])]) {
    await query('INSERT INTO plan_item_members (plan_item_id, user_id, hours) VALUES (?,?,?)', [insertId, user, hours]);
  }
  return insertId;
}

// Riwayat persetujuan dan tanda review yang sesuai dengan posisi audit di alur persetujuan.
// Ketua tim yang meneruskan laporan ke penyetuju dan penyetuju yang menyetujui ikut menandatangani secara elektronik.
async function sampleApproval(c, auditId, code, a, ids) {
  const approval = approvalOf(a);
  if (!approval) return;
  const lead = ids[a.lead];
  const member = ids[a.members.find((m) => m !== a.lead)] || lead;
  const approver = ids[approverOf(a)];
  const log = async (user, action, when, note = null) => (await c.query(
    'INSERT INTO audit_approvals (audit_id, user_id, action, note, created_at) VALUES (?,?,?,?,?)', [auditId, user, action, note, when])).insertId;
  if (approval === 'review') {
    await log(member, 'ajukan', at(a.end + 2, '16:10:00'), 'Kertas kerja dan temuan sudah lengkap.');
    await c.query('INSERT INTO notifications (user_id, text, vars, link) VALUES (?,?,?,?)',
      [lead, N_('{user} mengajukan laporan audit {code} untuk direview.'), JSON.stringify({ code, title: a.title, user: USERS.find((u) => ids[u.key] === member)?.name }), `/audit/${auditId}`]);
    return;
  }
  // Sudah lewat review ketua tim: semua langkah yang diuji dan semua temuan ditandai direview.
  const sent = approval === 'persetujuan' ? a.end + 3 : a.end - 2;
  await c.query("UPDATE audit_steps SET reviewed_by = ?, reviewed_at = ? WHERE audit_id = ? AND result <> 'Belum diuji'", [lead, at(sent - 1, '11:00:00'), auditId]);
  await c.query('UPDATE findings SET reviewed_by = ?, reviewed_at = ? WHERE audit_id = ?', [lead, at(sent - 1, '11:30:00'), auditId]);
  await signApproval(c, await log(lead, 'ajukan', at(sent, '15:45:00')), auditId, { id: lead });
  if (approval === 'persetujuan') {
    await c.query('INSERT INTO notifications (user_id, text, vars, link) VALUES (?,?,?,?)',
      [approver, N_('Laporan audit {code} menunggu persetujuan Anda.'), JSON.stringify({ code, title: a.title }), `/audit/${auditId}`]);
  } else {
    const id = await log(approver, 'setujui', at(a.end + 3, '10:20:00'), 'Laporan disetujui. Pantau tindak lanjut sampai selesai.');
    await signApproval(c, id, auditId, { id: approver });
  }
}

// Timesheet tim audit sejak awal tahun sampai kemarin, mengikuti jadwal setiap audit:
// 20% awal perencanaan, lalu pekerjaan lapangan, 20% akhir pelaporan, dan tindak lanjut sebulan sesudahnya.
// Ditambah rapat internal setiap Senin, pelatihan sebulan sekali, dan administrasi di hari tanpa audit.
// Angka acak memakai benih tetap supaya hasilnya selalu sama.
async function sampleTimesheets(audits, ids) {
  let seed = 20261016;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const quarter = (h) => Math.max(0.25, Math.round(h * 4) / 4);
  const today = new Date(`${day(0)}T00:00:00Z`);
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const first = Math.round((yearStart - today) / 86400000);
  const team = ['rina', 'fajar', 'dewi'];
  const rows = [];
  const add = (user, n, audit, activity, hours, note) => rows.push([ids[user], audit, day(n), activity, quarter(hours), note]);
  for (let n = first; n < 0; n++) {
    const weekday = new Date(today.getTime() + n * 86400000).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    if (weekday === 1) {
      for (const u of ['hendra', ...team]) add(u, n, null, 'Rapat internal', 1, 'Rapat mingguan SPI: progres audit dan tindak lanjut');
    }
    add('hendra', n, null, 'Administrasi', 1.5 + rand(), 'Review kertas kerja dan administrasi SPI');
    for (const u of team) {
      if (new Date(today.getTime() + n * 86400000).getUTCDate() === 12 + team.indexOf(u)) {
        add(u, n, null, 'Pelatihan', 7, ['Pelatihan audit berbasis risiko', 'Pelatihan analisis data audit', 'Pelatihan keamanan informasi'][team.indexOf(u)]);
        continue;
      }
      let left = weekday === 1 ? 4.5 : 5.5;
      const mine = audits.filter((a) => a.lead === u || a.members.includes(u));
      const active = mine.filter((a) => n >= a.start && n <= a.end);
      for (const a of active) {
        const pos = (n - a.start) / Math.max(1, a.end - a.start);
        const share = left / (active.length - active.indexOf(a));
        const hours = Math.min(left, share * (0.75 + rand() * 0.25));
        if (hours < 0.25) continue;
        const tested = a.steps.filter((x) => x[1] !== 'Belum diuji');
        const step = tested[Math.floor(rand() * tested.length)];
        const [activity, note] = pos < 0.2 ? ['Perencanaan', 'Memahami proses dan menyusun program kerja']
          : pos > 0.8 ? ['Pelaporan', 'Menyusun draf laporan dan membahas temuan dengan auditee']
          : ['Pekerjaan lapangan', step ? step[0] : 'Pengujian lapangan'];
        add(u, n, a.id, activity, hours, note);
        left -= quarter(hours);
      }
      // Tindak lanjut: dua kali seminggu selama sebulan setelah audit selesai, untuk audit yang ia pimpin.
      const follow = mine.filter((a) => a.lead === u && n > a.end && n <= a.end + 30 && (weekday === 2 || weekday === 4));
      for (const a of follow) {
        add(u, n, a.id, 'Tindak lanjut', 1 + rand(), 'Memeriksa bukti tindak lanjut dari auditee');
        left -= 1;
      }
      if (!active.length && left > 2) add(u, n, null, 'Administrasi', 2 + rand() * 2, 'Pemutakhiran dokumentasi dan arsip kertas kerja');
    }
  }
  for (let i = 0; i < rows.length; i += 200) {
    const part = rows.slice(i, i + 200);
    await query(`INSERT INTO timesheets (user_id, audit_id, work_date, activity, hours, note) VALUES ${part.map(() => '(?,?,?,?,?,?)').join(',')}`, part.flat());
  }
}

async function removeIds({ users = [], audits = [], entities = [], plan = [] }) {
  if (plan.length) await query(`DELETE FROM plan_items WHERE id IN (${plan.map(() => '?').join(',')})`, plan);
  if (entities.length) await query(`DELETE FROM auditable_entities WHERE id IN (${entities.map(() => '?').join(',')})`, entities);
  if (audits.length) {
    const marks = audits.map(() => '?').join(',');
    await removeFilesOf(`t.audit_id IN (${marks}) OR t.finding_id IN (SELECT id FROM findings WHERE audit_id IN (${marks}))`, [...audits, ...audits]);
    await query(`DELETE FROM audits WHERE id IN (${marks})`, audits);
  }
  if (users.length) await query(`DELETE FROM users WHERE id IN (${users.map(() => '?').join(',')})`, users);
}

// Menghapus semua data awal: audit beserta temuan, isu, program kerja, dan file buktinya, akun yang dibuat,
// dan unit yang ditambahkan ke data master (selama tidak dipakai audit atau pengguna lain).
export async function removeSample(admin) {
  const s = (await getSettings()).sample_data;
  if (!s) throw badRequest('Tidak ada data awal untuk dihapus.');
  await removeIds(s);
  if (s.units?.length) {
    const used = new Set();
    for (const u of s.units) {
      const { rowCount } = await query('SELECT 1 FROM audits WHERE unit = ? UNION SELECT 1 FROM users WHERE unit = ? LIMIT 1', [u, u]);
      if (rowCount) used.add(u);
    }
    const units = (await getSettings()).units;
    await saveInternal(admin, 'units', units.filter((u) => !s.units.includes(u) || used.has(u)));
  }
  await saveInternal(admin, 'sample_data', null);
  await logActivity({ query }, admin.id, 'delete', 'sample_data', null, { users: s.users?.length || 0, audits: s.audits?.length || 0 });
  return sampleStatus();
}
