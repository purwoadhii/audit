import nodemailer from 'nodemailer';
import { config } from './config.js';
import { query } from './db.js';

// Mengirim satu email ringkasan per PIC berisi temuan yang lewat batas waktu
// atau jatuh tempo dalam 7 hari. Aktif hanya bila SMTP_HOST diisi.
export async function sendReminders() {
  if (!config.smtp.host) return { sent: 0, skipped: 'SMTP belum diatur' };
  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  const { rows } = await query(
    `SELECT u.email, u.name, f.code, f.title, f.due_date, f.status, (f.due_date < CURRENT_DATE) AS overdue
     FROM findings f JOIN users u ON u.id = f.owner_id
     WHERE u.active AND f.status NOT IN ('Selesai','Menunggu verifikasi') AND f.due_date <= CURRENT_DATE + 7
     ORDER BY u.email, f.due_date`);
  const byUser = new Map();
  for (const row of rows) {
    if (!byUser.has(row.email)) byUser.set(row.email, { name: row.name, items: [] });
    byUser.get(row.email).items.push(row);
  }
  let sent = 0;
  for (const [email, { name, items }] of byUser) {
    const lines = items.map((i) => `- ${i.code} ${i.title} (batas ${i.due_date}${i.overdue ? ', TERLAMBAT' : ''})`);
    await transport.sendMail({
      from: config.smtp.from,
      to: email,
      subject: `Pengingat tindak lanjut audit: ${items.length} temuan`,
      text: `Halo ${name},\n\nTemuan berikut perlu ditindaklanjuti:\n${lines.join('\n')}\n\nBuka ${config.appUrl} untuk memperbarui progres.\n\nJejak Audit`,
    });
    sent++;
  }
  return { sent };
}

export function scheduleReminders() {
  if (!config.smtp.host) return;
  let lastRun = '';
  setInterval(async () => {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    if (now.getHours() !== config.reminderHour || lastRun === day) return;
    lastRun = day;
    try {
      const r = await sendReminders();
      console.log(`Pengingat terkirim ke ${r.sent} PIC`);
    } catch (err) {
      console.error('Gagal mengirim pengingat:', err.message);
    }
  }, 5 * 60 * 1000).unref();
}
