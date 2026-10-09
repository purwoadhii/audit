import { createApp } from './app.js';
import { migrate } from './migrate.js';
import { config } from './config.js';
import { scheduleReminders } from './reminders.js';
import { queuePending } from './extract.js';

await migrate();
createApp().listen(config.port, () => {
  console.log(`Audit Management berjalan di port ${config.port}`);
});
scheduleReminders();
// Baca teks file yang belum pernah diproses, termasuk file yang diunggah sebelum fitur ini ada.
queuePending().catch((err) => console.error('Gagal memulai pembacaan teks file:', err.message));
