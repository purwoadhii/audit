import bcrypt from 'bcryptjs';
import { query, tx, logActivity } from './db.js';
import { badRequest } from './errors.js';
import { getSettings, saveInternal } from './settings.js';
import { assertUserSlot } from './license.js';
import { nextCode } from './codes.js';
import { removeFilesOf } from './files.js';

// Data contoh untuk mencoba aplikasi: empat akun, empat audit di tiga unit, program kerja, temuan, dan isu.
// Id yang dibuat disimpan di pengaturan sample_data, jadi semuanya bisa dihapus lagi sekaligus.
export const SAMPLE_PASSWORD = 'contoh12345';

const USERS = [
  { key: 'auditor', name: 'Andi Auditor (contoh)', username: 'contoh.auditor', role: 'auditor', unit: null },
  { key: 'keuangan', name: 'Kartika Keuangan (contoh)', username: 'contoh.keuangan', role: 'auditee', unit: 'Divisi Keuangan' },
  { key: 'pengadaan', name: 'Prasetyo Pengadaan (contoh)', username: 'contoh.pengadaan', role: 'auditee', unit: 'Divisi Pengadaan' },
  { key: 'manajemen', name: 'Maya Manajemen (contoh)', username: 'contoh.manajemen', role: 'manajemen', unit: null },
];

// Tanggal relatif terhadap hari ini supaya data selalu terlihat baru (ada yang berjalan dan ada yang terlambat).
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const AUDITS = [
  {
    title: 'Audit Pengadaan Barang dan Jasa', unit: 'Divisi Pengadaan', type: 'Pengadaan', status: 'Pelaksanaan', start: -45, end: 30,
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
      { kind: 'temuan', title: 'Pengadaan di atas Rp50 juta tanpa tiga penawaran', risk: 'Tinggi', step: 1, owner: 'pengadaan', due: -10, status: 'Dalam proses',
        condition: '4 dari 12 PO bernilai di atas Rp50 juta hanya memiliki satu penawaran harga.', criteria: 'SOP Pengadaan bab 4.2: minimal tiga penawaran untuk nilai di atas Rp50 juta.',
        cause: 'Permintaan mendesak dari pengguna dan belum ada daftar vendor cadangan.', effect: 'Risiko harga tidak wajar dan konflik kepentingan.',
        recommendation: 'Wajibkan tiga penawaran atau persetujuan direksi untuk pengecualian, dan susun daftar vendor cadangan.',
        response: 'Setuju. Daftar vendor cadangan sedang disusun.', logs: ['Rapat pembahasan dengan Kepala Divisi Pengadaan sudah dilakukan.'] },
      { kind: 'temuan', title: 'Dokumen legalitas vendor kedaluwarsa', risk: 'Sedang', step: 3, owner: 'pengadaan', due: 20, status: 'Terbuka',
        condition: 'NPWP dan NIB tiga vendor aktif sudah tidak berlaku.', criteria: 'Kebijakan Manajemen Vendor: dokumen legalitas diperbarui setiap tahun.',
        cause: 'Tidak ada pengingat masa berlaku dokumen.', effect: 'Transaksi dengan vendor yang tidak memenuhi syarat.',
        recommendation: 'Perbarui dokumen ketiga vendor dan buat pengingat masa berlaku di sistem.', response: '', logs: [] },
      { kind: 'isu', title: 'Belum ada pelatihan SOP pengadaan untuk staf baru', risk: 'Rendah', owner: 'pengadaan', due: 45, status: 'Terbuka',
        condition: 'Dua staf baru belum pernah mengikuti sosialisasi SOP pengadaan.', criteria: '', cause: '', effect: 'Kesalahan prosedur berulang.',
        recommendation: 'Jadwalkan sosialisasi SOP setiap ada staf baru.', response: '', logs: [] },
    ],
  },
  {
    title: 'Audit Kas dan Bank', unit: 'Divisi Keuangan', type: 'Keuangan', status: 'Pelaporan', start: -90, end: -20,
    scope: 'Memeriksa pengelolaan kas kecil, rekonsiliasi bank, dan otorisasi pembayaran.',
    steps: [
      ['Lakukan cash opname kas kecil', 'Sesuai', 'Selisih Rp0.'],
      ['Periksa rekonsiliasi bank tiga bulan terakhir', 'Tidak sesuai', 'Rekonsiliasi Agustus belum ditandatangani.'],
      ['Uji otorisasi pembayaran di atas Rp100 juta', 'Sesuai', ''],
      ['Periksa pembatasan akses internet banking', 'Tidak sesuai', 'Satu akun maker juga punya hak approver.'],
      ['Konfirmasi saldo bank ke pihak bank', 'Tidak berlaku', 'Dilakukan auditor eksternal.'],
    ],
    findings: [
      { kind: 'temuan', title: 'Rekonsiliasi bank terlambat dan belum disetujui', risk: 'Sedang', step: 1, owner: 'keuangan', due: -5, status: 'Menunggu verifikasi',
        condition: 'Rekonsiliasi bank bulan Agustus selesai 25 hari setelah tutup buku dan belum ditandatangani manajer.',
        criteria: 'SOP Keuangan: rekonsiliasi selesai paling lambat 10 hari kerja setelah tutup buku.',
        cause: 'Staf rekonsiliasi merangkap tugas pelaporan pajak.', effect: 'Selisih kas terlambat terdeteksi.',
        recommendation: 'Tetapkan penanggung jawab cadangan dan pantau tenggat rekonsiliasi setiap bulan.',
        response: 'Rekonsiliasi sudah ditandatangani dan penanggung jawab cadangan ditunjuk.', logs: ['Bukti rekonsiliasi yang sudah ditandatangani dikirim lewat email.'] },
      { kind: 'temuan', title: 'Pemisahan tugas maker dan approver di internet banking', risk: 'Tinggi', step: 3, owner: 'keuangan', due: 7, status: 'Dalam proses',
        condition: 'Satu pengguna internet banking memiliki hak membuat sekaligus menyetujui transaksi.',
        criteria: 'Kebijakan Otorisasi: pembuat dan penyetuju transaksi harus orang yang berbeda.',
        cause: 'Pengaturan hak akses tidak ditinjau setelah rotasi pegawai.', effect: 'Risiko pembayaran tanpa persetujuan.',
        recommendation: 'Cabut hak approver dari akun maker dan tinjau hak akses setiap enam bulan.', response: 'Permintaan perubahan hak akses sudah dikirim ke bank.', logs: [] },
      { kind: 'isu', title: 'Saldo kas kecil sering mendekati batas', risk: 'Rendah', owner: 'keuangan', due: 30, status: 'Terbuka',
        condition: 'Dalam tiga bulan, kas kecil lima kali habis sebelum pengisian ulang.', criteria: '', cause: '', effect: 'Pembayaran operasional tertunda.',
        recommendation: 'Tinjau ulang plafon kas kecil.', response: '', logs: [] },
    ],
  },
  {
    title: 'Audit Keamanan Sistem Informasi', unit: 'Divisi IT', type: 'Teknologi Informasi', status: 'Perencanaan', start: 10, end: 60,
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
    title: 'Audit Kepatuhan Perjalanan Dinas', unit: 'Divisi Keuangan', type: 'Kepatuhan', status: 'Selesai', start: -180, end: -130,
    scope: 'Memeriksa kepatuhan klaim perjalanan dinas terhadap kebijakan perusahaan.',
    steps: [
      ['Periksa kelengkapan bukti klaim perjalanan dinas', 'Tidak sesuai', '3 klaim tanpa boarding pass.'],
      ['Uji kesesuaian tarif hotel dengan batas jabatan', 'Sesuai', ''],
    ],
    findings: [
      { kind: 'temuan', title: 'Klaim perjalanan dinas tanpa bukti lengkap', risk: 'Rendah', step: 0, owner: 'keuangan', due: -100, status: 'Selesai',
        condition: 'Tiga klaim dibayar tanpa boarding pass.', criteria: 'Kebijakan Perjalanan Dinas pasal 7.', cause: 'Verifikator tidak memakai daftar periksa.',
        effect: 'Pembayaran klaim yang tidak dapat dibuktikan.', recommendation: 'Gunakan daftar periksa saat verifikasi klaim.',
        response: 'Daftar periksa sudah dipakai sejak bulan lalu.', logs: ['Daftar periksa verifikasi klaim sudah diterapkan.', 'Ditutup setelah bukti diperiksa auditor.'] },
    ],
  },
];

const pickType = (types, wanted) => types.find((x) => x.toLowerCase() === wanted.toLowerCase()) || types[0] || wanted;

export async function sampleStatus() {
  const s = (await getSettings()).sample_data;
  return { exists: Boolean(s && (s.users?.length || s.audits?.length)), users: USERS.map((u) => u.username), password: SAMPLE_PASSWORD, created_at: s?.created_at || null };
}

export async function createSample(admin) {
  if ((await sampleStatus()).exists) throw badRequest('Data contoh sudah ada. Hapus dulu sebelum mengisi ulang.');
  const taken = await query(`SELECT username FROM users WHERE username IN (${USERS.map(() => '?').join(',')})`, USERS.map((u) => u.username));
  if (taken.rowCount) throw badRequest('Username {name} sudah dipakai. Ganti atau hapus akun itu dulu.', { name: taken.rows[0].username });

  const created = { users: [], audits: [] };
  try {
    const ids = {};
    const hash = await bcrypt.hash(SAMPLE_PASSWORD, 10);
    for (const u of USERS) {
      await assertUserSlot(u.role);
      const { insertId } = await query(
        'INSERT INTO users (name, username, email, password_hash, role, unit) VALUES (?,?,?,?,?,?)',
        [u.name, u.username, `${u.username}@contoh.local`, hash, u.role, u.unit],
      );
      ids[u.key] = insertId;
      created.users.push(insertId);
    }
    const types = (await getSettings()).audit_types;
    for (const a of AUDITS) {
      const auditId = await tx(async (c) => {
        const code = await nextCode(c, 'AUD');
        const { insertId } = await c.query(
          `INSERT INTO audits (code, title, unit, type, status, lead_id, team, scope, start_date, end_date, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [code, a.title, a.unit, pickType(types, a.type), a.status, ids.auditor, null, a.scope, day(a.start), day(a.end), admin.id],
        );
        await c.query('INSERT INTO audit_members (audit_id, user_id) VALUES (?,?)', [insertId, ids.auditor]);
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
            [fcode, f.kind, insertId, f.step !== undefined ? stepIds[f.step] : null, f.title, f.risk, f.status, day(f.due), ids[f.owner],
              f.condition, f.criteria, f.cause, f.effect, f.recommendation, f.response, ids.auditor],
          );
          await c.query('INSERT INTO finding_logs (finding_id, user_id, text, status) VALUES (?,?,?,?)',
            [r.insertId, ids.auditor, f.kind === 'isu' ? 'Isu dicatat' : 'Temuan dicatat', 'Terbuka']);
          for (const text of f.logs) {
            await c.query('INSERT INTO finding_logs (finding_id, user_id, text, status) VALUES (?,?,?,?)', [r.insertId, ids[f.owner], text, f.status]);
          }
        }
        return insertId;
      });
      created.audits.push(auditId);
    }
  } catch (err) {
    await removeIds(created);
    throw err;
  }
  await saveInternal(admin, 'sample_data', { ...created, created_at: new Date().toISOString() });
  await logActivity({ query }, admin.id, 'create', 'sample_data', null, { users: created.users.length, audits: created.audits.length });
  return sampleStatus();
}

async function removeIds({ users = [], audits = [] }) {
  if (audits.length) {
    const marks = audits.map(() => '?').join(',');
    await removeFilesOf(`t.audit_id IN (${marks}) OR t.finding_id IN (SELECT id FROM findings WHERE audit_id IN (${marks}))`, [...audits, ...audits]);
    await query(`DELETE FROM audits WHERE id IN (${marks})`, audits);
  }
  if (users.length) await query(`DELETE FROM users WHERE id IN (${users.map(() => '?').join(',')})`, users);
}

// Menghapus semua data contoh: audit beserta temuan, isu, program kerja, dan file buktinya, lalu akun contoh.
export async function removeSample(admin) {
  const s = (await getSettings()).sample_data;
  if (!s) throw badRequest('Tidak ada data contoh untuk dihapus.');
  await removeIds(s);
  await saveInternal(admin, 'sample_data', null);
  await logActivity({ query }, admin.id, 'delete', 'sample_data', null, { users: s.users?.length || 0, audits: s.audits?.length || 0 });
  return sampleStatus();
}
