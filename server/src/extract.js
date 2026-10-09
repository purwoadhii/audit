import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import { query } from './db.js';
import { openStored } from './storage.js';
import { getSettings } from './settings.js';

// Mengambil teks dari file bukti supaya isinya bisa dicari (termasuk oleh Asisten AI).
// - Teks, CSV: dibaca langsung.
// - PDF: teks diambil dari PDF; halaman hasil scan (tanpa teks) dibaca dengan OCR.
// - Word, Excel, PowerPoint (format baru .docx/.xlsx/.pptx): teks diambil dari isi file.
// - Gambar: dibaca dengan OCR (bahasa Indonesia dan Inggris).
// Proses berjalan di belakang satu per satu, jadi unggahan tidak perlu menunggu.

const require = createRequire(import.meta.url);
const MAX_TEXT = 500_000; // karakter yang disimpan per file
const MAX_OCR_PAGES = 30;

const clean = (s) => s.replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT);
const decodeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
const xmlText = (xml, breakTags) => decodeXml(
  xml.replace(new RegExp(`</(${breakTags})>`, 'g'), '\n').replace(/<w:tab\/>|<a:tab\/>/g, '\t').replace(/<[^>]+>/g, ''),
);
const byNumber = (a, b) => Number(a.match(/(\d+)\.xml$/)?.[1] || 0) - Number(b.match(/(\d+)\.xml$/)?.[1] || 0);

async function officeText(buf, mime) {
  const zip = await JSZip.loadAsync(buf);
  const read = (name) => zip.file(name)?.async('string');
  if (mime.includes('wordprocessingml')) {
    const parts = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*|footnotes)\.xml$/.test(n));
    const xml = await Promise.all(parts.map(read));
    return xml.map((x) => xmlText(x, 'w:p|w:tr')).join('\n');
  }
  if (mime.includes('spreadsheetml')) {
    const shared = [];
    const sst = await read('xl/sharedStrings.xml');
    if (sst) for (const si of sst.match(/<si>[\s\S]*?<\/si>/g) || []) shared.push(xmlText(si, 'never'));
    const sheets = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort(byNumber);
    const out = [];
    for (const name of sheets) {
      const xml = await read(name);
      for (const row of xml.match(/<row[\s\S]*?<\/row>/g) || []) {
        const cells = [];
        for (const c of row.match(/<c [^>]*?(\/>|>[\s\S]*?<\/c>)/g) || []) {
          const type = c.match(/ t="(\w+)"/)?.[1];
          const v = c.match(/<v>([\s\S]*?)<\/v>/)?.[1];
          if (type === 's' && v !== undefined) cells.push(shared[Number(v)] ?? '');
          else if (type === 'inlineStr') cells.push(xmlText(c, 'never'));
          else if (v !== undefined) cells.push(decodeXml(v));
        }
        if (cells.length) out.push(cells.join('\t'));
      }
      out.push('');
    }
    return out.join('\n');
  }
  if (mime.includes('presentationml')) {
    const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(byNumber);
    const xml = await Promise.all(slides.map(read));
    return xml.map((x, i) => `[Slide ${i + 1}]\n${xmlText(x, 'a:p')}`).join('\n');
  }
  return '';
}

// ---- OCR ----
let worker = null;
let workerIdle = null;
let langDir = null;

// Data bahasa disertakan lewat paket npm, jadi OCR tetap jalan tanpa internet.
function prepareLanguages() {
  if (langDir) return langDir;
  langDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-ocr-'));
  for (const lang of ['ind', 'eng']) {
    const dir = path.dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`));
    fs.copyFileSync(path.join(dir, '4.0.0_best_int', `${lang}.traineddata.gz`), path.join(langDir, `${lang}.traineddata.gz`));
  }
  return langDir;
}

async function ocrWorker() {
  clearTimeout(workerIdle);
  if (!worker) {
    const { createWorker } = await import('tesseract.js');
    worker = await createWorker(['ind', 'eng'], 1, { langPath: prepareLanguages(), cachePath: langDir, gzip: true });
  }
  // Lepaskan memori bila tidak ada OCR selama 5 menit.
  workerIdle = setTimeout(() => { const w = worker; worker = null; w?.terminate().catch(() => {}); }, 5 * 60000);
  workerIdle.unref?.();
  return worker;
}

async function ocrImage(image) {
  const w = await ocrWorker();
  const { data } = await w.recognize(image);
  return data.text || '';
}

async function pdfText(buf, allowOcr) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf), disableFontFace: true, useSystemFonts: false, isEvalSupported: false, verbosity: 0 });
  const doc = await loadingTask.promise;
  const pages = [];
  let ocrPages = 0;
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) text += (item.str || '') + (item.hasEOL ? '\n' : ' ');
      // Halaman tanpa teks biasanya hasil scan: baca dengan OCR.
      if (text.replace(/\s/g, '').length < 20 && allowOcr && ocrPages < MAX_OCR_PAGES) {
        const viewport = page.getViewport({ scale: 2 });
        const { canvas, context } = doc.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        text = await ocrImage(canvas.toBuffer('image/png'));
        ocrPages++;
      }
      pages.push(text);
      page.cleanup();
    }
  } finally {
    await doc.cleanup?.();
    await loadingTask.destroy();
  }
  return { text: pages.join('\n\n'), ocr: ocrPages > 0 };
}

export async function extractText(buf, mime, { ocr = true } = {}) {
  if (/^text\//.test(mime)) return { text: buf.toString('utf8'), ocr: false };
  if (mime === 'application/pdf') return pdfText(buf, ocr);
  if (/openxmlformats/.test(mime)) return { text: await officeText(buf, mime), ocr: false };
  if (/^image\/(png|jpeg|gif|webp)$/.test(mime)) {
    if (!ocr) return { text: '', ocr: false, skipped: true };
    let image = buf;
    // tesseract tidak membaca webp/gif di Node: ubah dulu ke PNG.
    if (/webp|gif/.test(mime)) {
      const { loadImage, createCanvas } = await import('@napi-rs/canvas');
      const img = await loadImage(buf);
      const c = createCanvas(img.width, img.height);
      c.getContext('2d').drawImage(img, 0, 0);
      image = c.toBuffer('image/png');
    }
    return { text: await ocrImage(image), ocr: true };
  }
  return null; // format lama (.doc/.xls/.ppt) dan ZIP tidak dibaca
}

async function readStream(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

// ---- Antrian di belakang layar ----
const queue = [];
let running = false;
const state = { processed: 0, failed: 0, last_error: null, current: null };

export function queueExtraction(id) {
  if (!queue.includes(id)) queue.push(id);
  if (!running) run();
}

async function run() {
  running = true;
  try {
    while (queue.length) {
      const id = queue.shift();
      state.current = id;
      await extractOne(id);
    }
  } finally {
    running = false;
    state.current = null;
  }
}

async function extractOne(id) {
  const { rows } = await query('SELECT * FROM attachments WHERE id = ?', [id]);
  const att = rows[0];
  if (!att) return;
  try {
    const settings = await getSettings();
    const stream = await openStored(att);
    if (!stream) throw new Error('File tidak ditemukan di penyimpanan.');
    const result = await extractText(await readStream(stream), att.mime, { ocr: settings.ocr_enabled });
    const text = result?.text ? clean(result.text) : '';
    const status = !result || result.skipped ? 'none' : result.ocr ? 'ocr' : 'done';
    await query('UPDATE attachments SET text_content = ?, text_status = ? WHERE id = ?', [text || null, status, id]);
    state.processed++;
  } catch (err) {
    state.failed++;
    state.last_error = { at: new Date().toISOString(), file: att.filename, message: String(err?.message || err).slice(0, 300) };
    await query("UPDATE attachments SET text_status = 'failed' WHERE id = ?", [id]).catch(() => {});
  }
}

// Saat aplikasi jalan, proses file yang belum pernah dibaca (termasuk file lama).
export async function queuePending() {
  const { rows } = await query("SELECT id FROM attachments WHERE text_status = 'pending' ORDER BY id");
  for (const r of rows) queueExtraction(r.id);
}

// Baca ulang semua file, misalnya setelah OCR dinyalakan.
export async function requeueAll(statuses = ['none', 'failed']) {
  const { rows } = await query(`SELECT id FROM attachments WHERE text_status IN (${statuses.map(() => '?').join(',')}) ORDER BY id`, statuses);
  for (const r of rows) queueExtraction(r.id);
  return rows.length;
}

export const extractionState = () => ({ ...state, queued: queue.length });

// Untuk tes dan saat aplikasi berhenti: hentikan antrian dan worker OCR.
export async function stopExtraction() {
  queue.length = 0;
  clearTimeout(workerIdle);
  const w = worker;
  worker = null;
  await w?.terminate().catch(() => {});
}
