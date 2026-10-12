// Membuat kunci lisensi Audit Management. Hanya untuk penyedia aplikasi yang memegang kunci privat.
//
//   node scripts/buat-lisensi.mjs --kunci kunci-privat-lisensi.pem --pelanggan "PT Contoh" --pengguna 50 --sampai 2027-12-31
//
// --pengguna 0 berarti tanpa batas jumlah pengguna. Tanpa --sampai, lisensi berlaku selamanya.
// Membuat pasangan kunci baru (sekali saja, lalu kunci publiknya dipasang di server/src/license.js):
//   node scripts/buat-lisensi.mjs --kunci-baru kunci-privat-lisensi.pem
import crypto from 'node:crypto';
import fs from 'node:fs';
import { parseLicense, signLicense } from '../src/license.js';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];

if (args['kunci-baru']) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(args['kunci-baru'], privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  console.log(`Kunci privat disimpan di ${args['kunci-baru']}. Simpan baik-baik dan jangan dibagikan.`);
  console.log('Kunci publik untuk server/src/license.js:\n');
  console.log(publicKey.export({ type: 'spki', format: 'pem' }));
  process.exit(0);
}

const fail = (msg) => { console.error(msg); process.exit(1); };
if (!args.kunci || !args.pelanggan) fail('Wajib: --kunci <file kunci privat> --pelanggan "<nama pelanggan>". Opsional: --pengguna <jumlah> --sampai <YYYY-MM-DD>.');
const maxUsers = Number(args.pengguna ?? 0);
if (!Number.isInteger(maxUsers) || maxUsers < 0) fail('--pengguna harus angka 0 atau lebih (0 = tanpa batas).');
if (args.sampai && !/^\d{4}-\d{2}-\d{2}$/.test(args.sampai)) fail('--sampai harus berformat YYYY-MM-DD.');

const privateKey = crypto.createPrivateKey(fs.readFileSync(args.kunci));
const key = signLicense({
  v: 1,
  id: crypto.randomBytes(6).toString('hex'),
  customer: args.pelanggan,
  max_users: maxUsers,
  expires: args.sampai || null,
  issued: new Date().toISOString().slice(0, 10),
}, privateKey);

// Pastikan kunci cocok dengan kunci publik di aplikasi.
try { parseLicense(key); } catch { fail('Kunci privat ini tidak cocok dengan kunci publik di server/src/license.js.'); }
console.log(key);
