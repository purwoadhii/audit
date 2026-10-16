import fs from 'node:fs';

// Nomor versi aplikasi dari server/package.json dan riwayat versi dari CHANGELOG.md di folder utama.
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
export const APP_VERSION = pkg.version;

// CHANGELOG.md berisi bagian "## 1.2.0 - 2026-10-12" diikuti butir "- ...".
export function changelog() {
  let text = '';
  try { text = fs.readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8'); } catch { return []; }
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const head = line.match(/^##\s+(\S+)(?:\s+-\s+(\d{4}-\d{2}-\d{2}))?/);
    if (head) { out.push({ version: head[1], date: head[2] || null, items: [] }); continue; }
    const item = line.match(/^[-*]\s+(.*)/);
    if (item && out.length) out.at(-1).items.push(item[1].trim());
  }
  return out;
}
