// Mengumpulkan semua teks yang perlu diterjemahkan dan memeriksa kamus di src/locales.
//
//   node scripts/i18n-keys.mjs              ringkasan: jumlah kunci, yang belum diterjemahkan, yang tidak dipakai
//   node scripts/i18n-keys.mjs --missing ja tulis kunci yang belum ada di ja.json (JSON) ke layar
//   node scripts/i18n-keys.mjs --prune      hapus kunci yang tidak dipakai lagi dari semua kamus
//
// Sumber teks: t(teks), N_(teks), dan <T k=teks> di web/src, pesan error dan label di server/src, dan butir CHANGELOG.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCALES = path.join(root, 'web/src/locales');
const LANGS = ['en', 'ms', 'zh', 'ja', 'ko'];

const files = (dir, ext) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'locales' || e.name === 'node_modules' ? [] : files(p, ext);
  return ext.test(e.name) ? [p] : [];
});

const LIT = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|\x60(?:[^\x60\\$]|\\.)*\x60`;
const unquote = (lit) => (lit[0] === '`' ? lit.slice(1, -1) : JSON.parse(lit[0] === "'" ? `"${lit.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"')}"` : lit));
const textLike = (s) => /[A-Za-z]/.test(s) && (/\s/.test(s) || /[A-Z]/.test(s));

const keys = new Map(); // kunci -> file pertama
const add = (k, file) => { if (k && !keys.has(k)) keys.set(k, path.relative(root, file)); };

// Web: t('...') dan N_('...').
for (const f of files(path.join(root, 'web/src'), /\.(jsx?|mjs)$/)) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(new RegExp(String.raw`\b(?:t|N_)\(\s*(${LIT})`, 'g'))) add(unquote(m[1]), f);
  for (const m of src.matchAll(new RegExp(String.raw`<T\s+k=(${LIT})`, 'g'))) add(unquote(m[1]), f);
}

// Server: teks di dalam panggilan error dan validasi, serta label dan pesan.
const CALLS = /\b(badRequest|forbidden|notFound|HttpError|requireText|oneOf|dateOrNull|msg|N_|fail)\(/g;
function callSpan(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      for (i++; i < src.length && src[i] !== q; i++) if (src[i] === '\\') i++;
    } else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return src.slice(start, i + 1);
  }
  return '';
}
for (const f of files(path.join(root, 'server/src'), /\.js$/)) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(CALLS)) {
    const span = callSpan(src, m.index + m[0].length - 1);
    for (const l of span.matchAll(new RegExp(LIT, 'g'))) { const s = unquote(l[0]); if (textLike(s)) add(s, f); }
  }
  for (const m of src.matchAll(new RegExp(String.raw`\b(?:label|message|def|i18n):\s*(${LIT})`, 'g'))) {
    const s = unquote(m[1]);
    if (textLike(s) && !/^(SELECT|INSERT|UPDATE|DELETE)\b/.test(s)) add(s, f);
  }
}
// Daftar bawaan di pengaturan (misalnya jenis audit) tampil apa adanya bila belum diubah admin.
for (const m of fs.readFileSync(path.join(root, 'server/src/settings.js'), 'utf8').matchAll(/\bdef:\s*\[([^\]]*)\]/g)) {
  for (const l of m[1].matchAll(new RegExp(LIT, 'g'))) { const s = unquote(l[0]); if (textLike(s)) add(s, 'server/src/settings.js'); }
}
// Pesan bawaan yang dipakai di errors.js.
for (const m of fs.readFileSync(path.join(root, 'server/src/errors.js'), 'utf8').matchAll(new RegExp(String.raw`msg = (${LIT})`, 'g'))) add(unquote(m[1]), 'server/src/errors.js');

// Riwayat versi.
for (const line of fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').split('\n')) {
  if (/^[-*] /.test(line)) add(line.slice(2).trim(), 'CHANGELOG.md');
}

const all = [...keys.keys()].sort();
const read = (l) => { try { return JSON.parse(fs.readFileSync(path.join(LOCALES, `${l}.json`), 'utf8')); } catch { return {}; } };
const args = process.argv.slice(2);

if (args[0] === '--missing') {
  const d = read(args[1]);
  console.log(JSON.stringify(Object.fromEntries(all.filter((k) => !d[k]).map((k) => [k, ''])), null, 2));
} else if (args[0] === '--prune') {
  for (const l of LANGS) {
    const d = read(l);
    const kept = Object.fromEntries(Object.keys(d).filter((k) => keys.has(k)).sort().map((k) => [k, d[k]]));
    fs.writeFileSync(path.join(LOCALES, `${l}.json`), `${JSON.stringify(kept, null, 2)}\n`);
  }
  console.log('Kunci yang tidak dipakai sudah dihapus.');
} else {
  console.log(`${all.length} teks.`);
  let bad = false;
  for (const l of LANGS) {
    const d = read(l);
    const missing = all.filter((k) => !d[k]);
    const unused = Object.keys(d).filter((k) => !keys.has(k));
    // Isian {nama} di terjemahan harus sama dengan teks asli.
    const vars = (s) => [...String(s).matchAll(/\{(\w+)(?::[^}]*)?\}/g)].map((m) => m[1]).sort().join(',');
    const broken = all.filter((k) => d[k] && vars(k) !== [...new Set(vars(d[k]).split(','))].filter(Boolean).sort().join(','));
    if (missing.length || broken.length) bad = true;
    console.log(`${l}: ${missing.length} belum diterjemahkan, ${unused.length} tidak dipakai, ${broken.length} isian tidak cocok${broken.length ? `: ${broken.slice(0, 5).join(' | ')}` : ''}`);
  }
  if (args[0] === '--check' && bad) process.exit(1);
}
