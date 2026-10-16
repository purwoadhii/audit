// Ekspor ke Excel dan Word. File dibuat di browser dari data yang sudah tampil di layar, jadi isinya
// mengikuti hak akses pengguna. Pustakanya baru dimuat saat tombol ekspor diklik.
import { FINDING_KINDS, approvalSigns, fmtDate } from './util.js';
import { t } from './i18n.jsx';

const today = () => new Date().toISOString().slice(0, 10);

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Tanggal 'YYYY-MM-DD' menjadi tanggal Excel asli, supaya bisa diurutkan dan disaring di Excel.
const asDate = (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00Z`) : null);

// sheets: [{ name, columns: [{ header, key, width, date?, wrap? }], rows: [{...}] }]
export async function exportExcel(base, sheets) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  for (const s of sheets) {
    // Nama sheet Excel maksimal 31 karakter dan tidak boleh memuat : \ / ? * [ ]
    const ws = wb.addWorksheet(s.name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31), { views: [{ state: 'frozen', ySplit: s.title ? 3 : 1 }] });
    if (s.title) {
      ws.addRow([s.title]).font = { bold: true, size: 13 };
      ws.addRow([]);
    }
    const head = ws.addRow(s.columns.map((c) => c.header));
    head.font = { bold: true };
    head.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF2' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFB0BCC5' } } };
    });
    s.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = c.width || 14;
      if (c.date) col.numFmt = 'dd/mm/yyyy';
      if (c.wrap) col.alignment = { wrapText: true, vertical: 'top' };
    });
    for (const r of s.rows) ws.addRow(s.columns.map((c) => (c.date ? asDate(r[c.key]) : r[c.key] ?? '')));
    if (s.rows.length) {
      const top = s.title ? 3 : 1;
      ws.autoFilter = { from: { row: top, column: 1 }, to: { row: top + s.rows.length, column: s.columns.length } };
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${base}-${today()}.xlsx`);
}

// withCompany: kolom perusahaan untuk multi-entitas.
export const auditColumns = (withCompany = false) => [
  { header: t('No.'), key: 'code', width: 15 },
  { header: t('Judul audit'), key: 'title', width: 40, wrap: true },
  ...(withCompany ? [{ header: t('Perusahaan'), key: 'company', width: 26 }] : []),
  { header: t('Unit'), key: 'unit', width: 24 },
  { header: t('Jenis audit'), key: 'type', width: 18 },
  { header: t('Ketua tim'), key: 'lead_name', width: 20 },
  { header: t('Anggota tim'), key: 'members', width: 30, wrap: true },
  { header: t('Tanggal mulai'), key: 'start_date', width: 13, date: true },
  { header: t('Tanggal selesai'), key: 'end_date', width: 13, date: true },
  { header: t('Status'), key: 'status', width: 14 },
  { header: t('Langkah diuji'), key: 'steps_done', width: 10 },
  { header: t('Jumlah langkah'), key: 'steps_total', width: 10 },
  { header: t('Temuan'), key: 'findings_total', width: 9 },
  { header: t('Temuan terbuka'), key: 'findings_open', width: 10 },
  { header: t('Isu'), key: 'issues_total', width: 8 },
  { header: t('Isu terbuka'), key: 'issues_open', width: 10 },
];

export const auditRow = (a) => ({
  ...a, company: a.company || '', type: t(a.type), status: t(a.status), lead_name: a.lead_name || '',
  members: [...(a.members || []).map((m) => m.name), a.team].filter(Boolean).join(', '),
});

export const findingColumns = () => [
  { header: t('No.'), key: 'code', width: 15 },
  { header: t('Jenis'), key: 'kind', width: 9 },
  { header: t('Judul'), key: 'title', width: 40, wrap: true },
  { header: t('Audit'), key: 'audit', width: 36, wrap: true },
  { header: t('Unit'), key: 'audit_unit', width: 22 },
  { header: t('Kategori temuan'), key: 'category', width: 20 },
  { header: t('Kategori akar masalah'), key: 'root_cause', width: 20 },
  { header: t('Risiko'), key: 'risk', width: 9 },
  { header: t('Status'), key: 'status', width: 18 },
  { header: t('PIC'), key: 'owner_name', width: 20 },
  { header: t('Batas waktu'), key: 'due_date', width: 13, date: true },
  { header: t('Terlambat'), key: 'overdue', width: 10 },
  { header: t('Kondisi'), key: 'condition', width: 45, wrap: true },
  { header: t('Kriteria'), key: 'criteria', width: 40, wrap: true },
  { header: t('Sebab'), key: 'cause', width: 40, wrap: true },
  { header: t('Akibat'), key: 'effect', width: 40, wrap: true },
  { header: t('Rekomendasi'), key: 'recommendation', width: 40, wrap: true },
  { header: t('Tanggapan auditee'), key: 'response', width: 40, wrap: true },
];

export const findingRow = (f) => ({
  ...f, kind: FINDING_KINDS[f.kind], audit: `${f.audit_code} · ${f.audit_title}`, category: f.category ? t(f.category) : '',
  root_cause: f.root_cause ? t(f.root_cause) : '', risk: t(f.risk), status: t(f.status), owner_name: f.owner_name || '',
  overdue: f.overdue ? t('Ya') : '',
});

// Laporan satu audit dalam format Word, isinya sama dengan halaman Laporan.
export async function exportAuditDocx(a) {
  const d = await import('docx');
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType, BorderStyle } = d;
  const p = (text, opts = {}) => new Paragraph({ children: [new TextRun({ text: String(text ?? ''), ...opts })], spacing: { after: 80 } });
  // Teks dengan baris baru dijadikan beberapa baris dalam satu paragraf.
  const multi = (text) => new Paragraph({
    children: String(text || '—').split('\n').map((line, i) => new TextRun({ text: line, break: i ? 1 : 0 })),
    spacing: { after: 60 },
  });
  const h = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 } });
  const cell = (content, width, bold) => new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    children: [typeof content === 'string' || content == null ? p(content || '—', { bold }) : content],
  });
  const table = (widths, rows) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((r, i) => new TableRow({ tableHeader: i === 0, children: r.map((c, j) => cell(c, widths[j], i === 0)) })),
  });
  const kv = (pairs) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
    rows: pairs.map(([k, v]) => new TableRow({ children: [cell(k, 28, true), cell(v, 72)] })),
  });
  const count = (list, r) => list.filter((f) => f.risk === r).length;
  const findings = a.findings.filter((f) => f.kind !== 'isu');
  const issues = a.findings.filter((f) => f.kind === 'isu');
  const done = a.steps.filter((s) => s.result !== 'Belum diuji').length;
  const items = (list) => list.flatMap((f, i) => [
    new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${f.title}`, bold: true }), new TextRun({ text: `  ${f.code} · ${t('Risiko {risk}', { risk: t(f.risk) })} · ${t(f.status)}`, color: '666666', size: 18 })], spacing: { before: 200, after: 80 } }),
    kv([
      [t('Kategori'), f.category ? t(f.category) : '—'],
      [t('Kondisi'), multi(f.condition)],
      [t('Kriteria'), multi(f.criteria)],
      [t('Sebab'), multi(f.cause)],
      [t('Kategori akar masalah'), f.root_cause ? t(f.root_cause) : '—'],
      [t('Akibat'), multi(f.effect)],
      [t('Rekomendasi'), multi(f.recommendation)],
      [t('Tanggapan'), multi(f.response)],
      [t('PIC / batas'), `${f.owner_name || '—'} / ${fmtDate(f.due_date)}`],
    ]),
  ]);
  const signs = approvalSigns(a);
  // Gambar tanda tangan dan QR verifikasi untuk tanda tangan elektronik.
  const { default: QRCode } = await import('qrcode');
  const { verifyUrl } = await import('./components/SignBlock.jsx');
  const art = {};
  for (const g of [signs.lead, signs.approver]) {
    const e = g.entry;
    art[g.title] = {
      sig: e?.signature ? await imageOf(e.signature, 150, 60) : null,
      qr: e?.sign_code ? await imageOf(await QRCode.toDataURL(verifyUrl(e.sign_code), { margin: 0, width: 160 }), 56, 56) : null,
      code: e?.sign_code,
    };
  }
  const img = (x) => new d.ImageRun({ type: x.type, data: x.data, transformation: { width: x.w, height: x.h } });
  const sign = ({ title, name, note }) => {
    const { sig, qr, code } = art[title];
    return new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      children: [
        new Paragraph({ text: t(title), alignment: AlignmentType.CENTER, spacing: { after: sig ? 80 : note ? 300 : 1100 } }),
        ...(sig ? [new Paragraph({ children: [img(sig)], alignment: AlignmentType.CENTER })] : []),
        ...(note ? [new Paragraph({ children: [new TextRun({ text: sig ? note : `✓ ${note}`, color: sig ? '666666' : '2C7643', bold: !sig, size: sig ? 18 : undefined })], alignment: AlignmentType.CENTER, spacing: { after: sig ? 80 : 500 } })] : []),
        new Paragraph({ text: name ? `( ${name} )` : '( .............................. )', alignment: AlignmentType.CENTER }),
        ...(code ? [
          new Paragraph({ children: [img(qr)], alignment: AlignmentType.CENTER, spacing: { before: 120 } }),
          new Paragraph({ children: [new TextRun({ text: `${t('Ditandatangani secara elektronik')} · ${t('Kode verifikasi')}: ${code}`, size: 15, color: '666666' })], alignment: AlignmentType.CENTER }),
          new Paragraph({ children: [new TextRun({ text: verifyUrl(code), size: 15, color: '666666' })], alignment: AlignmentType.CENTER }),
        ] : []),
      ],
    });
  };

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
    sections: [{
      children: [
        p(a.code, { color: '666666' }),
        new Paragraph({ text: t('Laporan Hasil Audit: {title}', { title: a.title }), heading: HeadingLevel.HEADING_1, spacing: { after: 80 } }),
        p(t('Dicetak {date}', { date: fmtDate(new Date().toISOString()) }), { color: '666666', size: 18 }),
        h(t('Informasi audit')),
        kv([
          ...(a.company ? [[t('Perusahaan'), a.company]] : []),
          [t('Auditee'), a.unit],
          [t('Jenis audit'), t(a.type)],
          [t('Ketua tim'), a.lead_name || '—'],
          [t('Anggota tim'), (a.members || []).map((m) => m.name).join(', ') || '—'],
          [t('Anggota eksternal'), a.team || '—'],
          [t('Periode'), t('{start} s.d. {end}', { start: fmtDate(a.start_date), end: fmtDate(a.end_date) })],
          [t('Status'), t(a.status)],
          [t('Persetujuan'), `${t(signs.status)}${signs.approver.note ? ` · ${signs.approver.name}, ${signs.approver.note}` : ''}`],
        ]),
        h(t('Ruang lingkup dan tujuan')),
        multi(a.scope),
        h(t('Program kerja ({done}/{total} langkah diuji)', { done, total: a.steps.length })),
        a.steps.length
          ? table([8, 52, 15, 25], [[t('No.'), t('Langkah pengujian'), t('Hasil'), t('Catatan')], ...a.steps.map((s, i) => [String(i + 1), s.text, t(s.result), multi(s.note)])])
          : p('—'),
        h(t('Temuan dan rekomendasi')),
        p(t('{n} temuan: risiko tinggi {high}, sedang {med}, rendah {low}.', { n: findings.length, high: count(findings, 'Tinggi'), med: count(findings, 'Sedang'), low: count(findings, 'Rendah') })),
        ...items(findings),
        ...(issues.length ? [
          h(t('Isu')),
          p(t('{n} isu: risiko tinggi {high}, sedang {med}, rendah {low}.', { n: issues.length, high: count(issues, 'Tinggi'), med: count(issues, 'Sedang'), low: count(issues, 'Rendah') })),
          ...items(issues),
        ] : []),
        new Paragraph({ text: '', spacing: { before: 480 } }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
          rows: [new TableRow({ children: [sign(signs.lead), sign(signs.approver)] })],
        }),
      ],
    }],
  });
  download(await Packer.toBlob(doc), `laporan-${a.code}.docx`);
}

// Data URL gambar menjadi isi biner dan ukuran tampil yang muat dalam kotak maxW × maxH (piksel).
async function imageOf(dataUrl, maxW, maxH) {
  const type = dataUrl.startsWith('data:image/jpeg') ? 'jpg' : 'png';
  const bin = atob(dataUrl.split(',')[1]);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  const { width, height } = await new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve({ width: im.naturalWidth || maxW, height: im.naturalHeight || maxH });
    im.onerror = () => resolve({ width: maxW, height: maxH });
    im.src = dataUrl;
  });
  const k = Math.min(maxW / width, maxH / height, 1.5);
  return { type, data, w: Math.round(width * k), h: Math.round(height * k) };
}
