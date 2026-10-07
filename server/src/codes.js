// Nomor urut per tahun, misalnya AUD-2026-001. Dipanggil di dalam transaksi
// yang sudah mengunci tabel agar dua pengguna tidak mendapat nomor yang sama.
export async function nextCode(client, table, prefix) {
  const year = new Date().getFullYear();
  await client.query(`LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE`);
  const { rows } = await client.query(
    `SELECT code FROM ${table} WHERE code LIKE $1 ORDER BY code DESC LIMIT 1`,
    [`${prefix}-${year}-%`],
  );
  const last = rows[0] ? Number(rows[0].code.split('-').pop()) : 0;
  return `${prefix}-${year}-${String(last + 1).padStart(3, '0')}`;
}
