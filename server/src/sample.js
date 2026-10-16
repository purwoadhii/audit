import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query, tx, logActivity } from './db.js';
import { badRequest, N_ } from './errors.js';
import { getSettings, saveInternal } from './settings.js';
import { assertUserSlot } from './license.js';
import { nextCode } from './codes.js';
import { removeFilesOf } from './files.js';

// Data awal yang realistis untuk mulai memakai aplikasi: tim Satuan Pengawasan Intern (SPI), direksi,
// PIC di enam divisi, dan tujuh audit lengkap dengan program kerja, temuan, isu, dan riwayat tindak lanjut.
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
      { kind: 'temuan', title: 'Pengadaan di atas Rp50 juta tanpa tiga penawaran', risk: 'Tinggi', step: 1, due: -10, status: 'Dalam proses',
        condition: '4 dari 12 PO bernilai di atas Rp50 juta hanya memiliki satu penawaran harga.', criteria: 'SOP Pengadaan bab 4.2: minimal tiga penawaran untuk nilai di atas Rp50 juta.',
        cause: 'Permintaan mendesak dari pengguna dan belum ada daftar vendor cadangan.', effect: 'Risiko harga tidak wajar dan konflik kepentingan.',
        recommendation: 'Wajibkan tiga penawaran atau persetujuan direksi untuk pengecualian, dan susun daftar vendor cadangan.',
        response: 'Setuju. Daftar vendor cadangan sedang disusun.', logs: ['Rapat pembahasan dengan Kepala Divisi Pengadaan sudah dilakukan.'] },
      { kind: 'temuan', title: 'Dokumen legalitas vendor kedaluwarsa', risk: 'Sedang', step: 3, due: 20, status: 'Terbuka',
        condition: 'NPWP dan NIB tiga vendor aktif sudah tidak berlaku.', criteria: 'Kebijakan Manajemen Vendor: dokumen legalitas diperbarui setiap tahun.',
        cause: 'Tidak ada pengingat masa berlaku dokumen.', effect: 'Transaksi dengan vendor yang tidak memenuhi syarat.',
        recommendation: 'Perbarui dokumen ketiga vendor dan buat pengingat masa berlaku di sistem.', response: '', logs: [] },
      { kind: 'isu', title: 'Belum ada pelatihan SOP pengadaan untuk staf baru', risk: 'Rendah', due: 45, status: 'Terbuka',
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
      { kind: 'temuan', title: 'Rekonsiliasi bank terlambat dan belum disetujui', risk: 'Sedang', step: 1, due: -5, status: 'Menunggu verifikasi',
        condition: 'Rekonsiliasi bank bulan Agustus selesai 25 hari setelah tutup buku dan belum ditandatangani manajer.',
        criteria: 'SOP Keuangan: rekonsiliasi selesai paling lambat 10 hari kerja setelah tutup buku.',
        cause: 'Staf rekonsiliasi merangkap tugas pelaporan pajak.', effect: 'Selisih kas terlambat terdeteksi.',
        recommendation: 'Tetapkan penanggung jawab cadangan dan pantau tenggat rekonsiliasi setiap bulan.',
        response: 'Rekonsiliasi sudah ditandatangani dan penanggung jawab cadangan ditunjuk.', logs: ['Bukti rekonsiliasi yang sudah ditandatangani dikirim lewat email.'] },
      { kind: 'temuan', title: 'Pemisahan tugas maker dan approver di internet banking', risk: 'Tinggi', step: 3, due: 7, status: 'Dalam proses',
        condition: 'Satu pengguna internet banking memiliki hak membuat sekaligus menyetujui transaksi.',
        criteria: 'Kebijakan Otorisasi: pembuat dan penyetuju transaksi harus orang yang berbeda.',
        cause: 'Pengaturan hak akses tidak ditinjau setelah rotasi pegawai.', effect: 'Risiko pembayaran tanpa persetujuan.',
        recommendation: 'Cabut hak approver dari akun maker dan tinjau hak akses setiap enam bulan.', response: 'Permintaan perubahan hak akses sudah dikirim ke bank.', logs: [] },
      { kind: 'isu', title: 'Saldo kas kecil sering mendekati batas', risk: 'Rendah', due: 30, status: 'Terbuka',
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
      { kind: 'temuan', title: 'Gaji masih dibayarkan kepada karyawan yang sudah resign', risk: 'Tinggi', step: 0, due: 5, status: 'Dalam proses',
        condition: 'Dua karyawan yang resign pada Agustus masih menerima gaji September sebesar total Rp18,4 juta.',
        criteria: 'SOP Penggajian: data karyawan keluar diperbarui paling lambat tanggal 20 setiap bulan.',
        cause: 'Formulir pengunduran diri tidak diteruskan ke bagian penggajian.', effect: 'Kerugian perusahaan dan risiko kecurangan.',
        recommendation: 'Tagih kembali kelebihan bayar dan buat checklist offboarding yang melibatkan bagian penggajian.',
        response: 'Penagihan sudah dikirim ke kedua mantan karyawan.', logs: ['Satu mantan karyawan sudah mengembalikan kelebihan bayar.'] },
      { kind: 'temuan', title: 'Setoran iuran BPJS terlambat', risk: 'Sedang', step: 3, due: 25, status: 'Terbuka',
        condition: 'Iuran BPJS Ketenagakerjaan bulan Agustus disetor 6 hari setelah batas waktu.',
        criteria: 'Peraturan BPJS: iuran disetor paling lambat tanggal 15 bulan berikutnya.', cause: 'Persetujuan pembayaran menunggu direktur yang sedang dinas.',
        effect: 'Denda keterlambatan dan risiko layanan peserta terganggu.', recommendation: 'Tetapkan pejabat pengganti untuk persetujuan pembayaran rutin.', response: '', logs: [] },
      { kind: 'isu', title: 'Data rekening karyawan belum diverifikasi ulang', risk: 'Sedang', due: 40, status: 'Terbuka',
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
      { kind: 'temuan', title: 'Selisih hasil stock opname dengan kartu stok', risk: 'Sedang', step: 0, due: -60, status: 'Selesai',
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
      { kind: 'temuan', title: 'Klaim perjalanan dinas tanpa bukti lengkap', risk: 'Rendah', step: 0, due: -100, status: 'Selesai',
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
      { kind: 'temuan', title: 'Pertanggungjawaban event tidak lengkap', risk: 'Sedang', step: 1, due: 14, status: 'Dalam proses',
        condition: 'Dua event senilai Rp95 juta tidak dilengkapi laporan kegiatan dan daftar hadir.', criteria: 'Pedoman Biaya Pemasaran: laporan kegiatan wajib diserahkan 7 hari setelah event.',
        cause: 'Tim event langsung menangani kegiatan berikutnya.', effect: 'Biaya tidak dapat dinilai manfaatnya.',
        recommendation: 'Lengkapi laporan kedua event dan jadikan laporan kegiatan syarat pencairan termin akhir.',
        response: 'Laporan sedang disusun oleh tim event.', logs: [] },
      { kind: 'isu', title: 'Belum ada ukuran efektivitas promosi', risk: 'Rendah', due: 60, status: 'Terbuka',
        condition: 'Divisi belum mengukur hasil promosi terhadap penjualan.', criteria: '', cause: '', effect: 'Anggaran promosi sulit dievaluasi.',
        recommendation: 'Tetapkan indikator efektivitas untuk setiap kegiatan promosi.', response: '', logs: [] },
    ],
  },
];

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
    planned: { users: USERS.length, audits: AUDITS.length, units: UNITS.length },
  };
}

export async function createSample(admin) {
  if ((await sampleStatus()).exists) throw badRequest('Data awal sudah ada. Hapus dulu sebelum mengisi ulang.');
  const taken = await query(`SELECT username FROM users WHERE username IN (${USERS.map(() => '?').join(',')})`, USERS.map((u) => u.username));
  if (taken.rowCount) throw badRequest('Username {name} sudah dipakai. Ganti atau hapus akun itu dulu.', { name: taken.rows[0].username });

  const password = crypto.randomBytes(8).toString('base64url').slice(0, 10);
  const settings = await getSettings();
  const addedUnits = UNITS.filter((u) => !settings.units.some((x) => x.toLowerCase() === u.toLowerCase()));
  const created = { users: [], audits: [], units: addedUnits };
  try {
    const ids = {};
    const hash = await bcrypt.hash(password, 10);
    for (const u of USERS) {
      await assertUserSlot(u.role);
      const { insertId } = await query(
        'INSERT INTO users (name, username, email, password_hash, role, unit) VALUES (?,?,?,?,?,?)',
        [u.name, u.username, aliasEmail(admin.email, u.username), hash, u.role, u.unit],
      );
      ids[u.key] = insertId;
      created.users.push(insertId);
    }
    for (const a of AUDITS) {
      const auditId = await tx(async (c) => {
        const code = await nextCode(c, 'AUD');
        const { insertId } = await c.query(
          `INSERT INTO audits (code, title, unit, type, status, lead_id, approver_id, approval, team, scope, start_date, end_date, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [code, a.title, a.unit, pickType(settings.audit_types, a.type), a.status, ids[a.lead], ids[approverOf(a)], approvalOf(a), null, a.scope,
            day(a.start), day(a.end), ids.hendra],
        );
        for (const m of [a.lead, ...a.members]) await c.query('INSERT INTO audit_members (audit_id, user_id) VALUES (?,?)', [insertId, ids[m]]);
        const stepIds = [];
        for (let i = 0; i < a.steps.length; i++) {
          const [text, result, note] = a.steps[i];
          const s = await c.query('INSERT INTO audit_steps (audit_id, position, text, result, note) VALUES (?,?,?,?,?)', [insertId, i, text, result, note]);
          stepIds.push(s.insertId);
        }
        for (const f of a.findings) {
          const fcode = await nextCode(c, f.kind === 'isu' ? 'ISU' : 'TMN');
          const r = await c.query(
            `INSERT INTO findings (code, kind, audit_id, step_id, title, risk, status, due_date, owner_id,
               \`condition\`, criteria, cause, effect, recommendation, response, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [fcode, f.kind, insertId, f.step !== undefined ? stepIds[f.step] : null, f.title, f.risk, f.status, day(f.due), ids[a.owner],
              f.condition, f.criteria, f.cause, f.effect, f.recommendation, f.response, ids[a.lead]],
          );
          await c.query('INSERT INTO finding_logs (finding_id, user_id, text, status) VALUES (?,?,?,?)',
            [r.insertId, ids[a.lead], f.kind === 'isu' ? 'Isu dicatat' : 'Temuan dicatat', 'Terbuka']);
          for (const text of f.logs) {
            await c.query('INSERT INTO finding_logs (finding_id, user_id, text, status) VALUES (?,?,?,?)', [r.insertId, ids[a.owner], text, f.status]);
          }
        }
        await sampleApproval(c, insertId, code, a, ids);
        return insertId;
      });
      created.audits.push(auditId);
    }
  } catch (err) {
    await removeIds(created);
    throw err;
  }
  if (addedUnits.length) await saveInternal(admin, 'units', [...settings.units, ...addedUnits]);
  await saveInternal(admin, 'sample_data', { ...created, password, created_at: new Date().toISOString() });
  await logActivity({ query }, admin.id, 'create', 'sample_data', null, { users: created.users.length, audits: created.audits.length });
  return sampleStatus();
}

// Riwayat persetujuan dan tanda review yang sesuai dengan posisi audit di alur persetujuan.
async function sampleApproval(c, auditId, code, a, ids) {
  const approval = approvalOf(a);
  if (!approval) return;
  const lead = ids[a.lead];
  const member = ids[a.members.find((m) => m !== a.lead)] || lead;
  const approver = ids[approverOf(a)];
  const log = (user, action, note = null) => c.query('INSERT INTO audit_approvals (audit_id, user_id, action, note) VALUES (?,?,?,?)', [auditId, user, action, note]);
  if (approval === 'review') {
    await log(member, 'ajukan', 'Kertas kerja dan temuan sudah lengkap.');
    await c.query('INSERT INTO notifications (user_id, text, vars, link) VALUES (?,?,?,?)',
      [lead, N_('{user} mengajukan laporan audit {code} untuk direview.'), JSON.stringify({ code, title: a.title, user: USERS.find((u) => ids[u.key] === member)?.name }), `/audit/${auditId}`]);
    return;
  }
  // Sudah lewat review ketua tim: semua langkah yang diuji dan semua temuan ditandai direview.
  await c.query("UPDATE audit_steps SET reviewed_by = ?, reviewed_at = NOW(3) WHERE audit_id = ? AND result <> 'Belum diuji'", [lead, auditId]);
  await c.query('UPDATE findings SET reviewed_by = ?, reviewed_at = NOW(3) WHERE audit_id = ?', [lead, auditId]);
  await log(lead, 'ajukan');
  if (approval === 'persetujuan') {
    await c.query('INSERT INTO notifications (user_id, text, vars, link) VALUES (?,?,?,?)',
      [approver, N_('Laporan audit {code} menunggu persetujuan Anda.'), JSON.stringify({ code, title: a.title }), `/audit/${auditId}`]);
  } else {
    await log(approver, 'setujui', 'Laporan disetujui. Pantau tindak lanjut sampai selesai.');
  }
}

async function removeIds({ users = [], audits = [] }) {
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
