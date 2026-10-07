import { createApp } from './app.js';
import { migrate } from './migrate.js';
import { config } from './config.js';
import { scheduleReminders } from './reminders.js';

await migrate();
createApp().listen(config.port, () => {
  console.log(`Audit Management berjalan di port ${config.port}`);
});
scheduleReminders();
