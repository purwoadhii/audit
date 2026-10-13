// Menambah peran superadmin: pengguna yang melihat dan mengerjakan audit semua unit.
// Batasan users_role_check dari 003 dilepas lalu dibuat ulang dengan daftar peran baru.
export async function up(conn) {
  const [checks] = await conn.query(
    `SELECT tc.CONSTRAINT_NAME AS name
       FROM information_schema.TABLE_CONSTRAINTS tc
       JOIN information_schema.CHECK_CONSTRAINTS cc
         ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
      WHERE tc.TABLE_SCHEMA = DATABASE() AND tc.TABLE_NAME = 'users' AND tc.CONSTRAINT_TYPE = 'CHECK'
        AND cc.CHECK_CLAUSE LIKE '%auditee%'`,
  );
  const [[{ v }]] = await conn.query('SELECT VERSION() AS v');
  const drop = /mariadb/i.test(v) ? 'DROP CONSTRAINT' : 'DROP CHECK';
  for (const c of checks) await conn.query(`ALTER TABLE users ${drop} \`${c.name}\``);
  await conn.query(
    "ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('infraadmin','admin','superadmin','auditor','auditee','manajemen'))",
  );
}
