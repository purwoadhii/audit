// Nomor urut per tahun, misalnya AUD-2026-001. Penghitung dinaikkan secara atomik
// di tabel counters, jadi dua pengguna tidak pernah mendapat nomor yang sama.
export async function nextCode(client, prefix) {
  const year = new Date().getFullYear();
  await client.query(
    `INSERT INTO counters (prefix, year, value) VALUES (?, ?, LAST_INSERT_ID(1))
     ON DUPLICATE KEY UPDATE value = LAST_INSERT_ID(value + 1)`,
    [prefix, year],
  );
  const { rows } = await client.query('SELECT LAST_INSERT_ID() AS n');
  return `${prefix}-${year}-${String(rows[0].n).padStart(3, '0')}`;
}
