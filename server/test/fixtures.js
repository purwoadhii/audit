// Membuat file contoh untuk menguji pembacaan teks dan OCR (tanpa file biner di repo).
import JSZip from 'jszip';
import { createCanvas } from '@napi-rs/canvas';

export function imageWithText(lines, type = 'image/png') {
  const c = createCanvas(1400, 120 + lines.length * 90);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#000';
  g.font = '56px sans-serif';
  lines.forEach((l, i) => g.fillText(l, 60, 110 + i * 90));
  return { buf: c.toBuffer(type), width: c.width, height: c.height };
}

// PDF satu halaman: teks biasa, atau hanya gambar JPEG (seperti hasil scan).
export function pdf({ text, jpeg }) {
  const objs = [];
  let content;
  let resources;
  if (jpeg) {
    content = `q ${jpeg.width * 0.4} 0 0 ${jpeg.height * 0.4} 20 400 cm /Im1 Do Q`;
    resources = '<< /XObject << /Im1 5 0 R >> >>';
  } else {
    content = `BT /F1 14 Tf 50 750 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
    resources = '<< /Font << /F1 5 0 R >> >>';
  }
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources ${resources} /Contents 4 0 R >>`);
  objs.push(Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  objs.push(jpeg
    ? Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${jpeg.width} /Height ${jpeg.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.buf.length} >>\nstream\n`), jpeg.buf, Buffer.from('\nendstream')])
    : '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const parts = [Buffer.from('%PDF-1.4\n')];
  const offsets = [];
  let pos = parts[0].length;
  objs.forEach((o, i) => {
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), Buffer.isBuffer(o) ? o : Buffer.from(o), Buffer.from('\nendobj\n')]);
    offsets.push(pos);
    pos += b.length;
    parts.push(b);
  });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF`;
  parts.push(Buffer.from(xref));
  return Buffer.concat(parts);
}

export async function docx(text) {
  const z = new JSZip();
  z.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${text.split('\n').map((l) => `<w:p><w:r><w:t>${l}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`);
  return z.generateAsync({ type: 'nodebuffer' });
}

export async function xlsx(rows) {
  const z = new JSZip();
  const strings = [...new Set(rows.flat().filter((v) => typeof v === 'string'))];
  z.file('xl/sharedStrings.xml', `<sst>${strings.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`);
  z.file('xl/worksheets/sheet1.xml', `<worksheet><sheetData>${rows.map((r) => `<row>${r.map((v) => (typeof v === 'string' ? `<c r="A1" t="s"><v>${strings.indexOf(v)}</v></c>` : `<c r="A1"><v>${v}</v></c>`)).join('')}</row>`).join('')}</sheetData></worksheet>`);
  return z.generateAsync({ type: 'nodebuffer' });
}

export async function pptx(slides) {
  const z = new JSZip();
  slides.forEach((s, i) => z.file(`ppt/slides/slide${i + 1}.xml`, `<p:sld><a:p><a:r><a:t>${s}</a:t></a:r></a:p></p:sld>`));
  return z.generateAsync({ type: 'nodebuffer' });
}
