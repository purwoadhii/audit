// Menambah peran infraadmin. Batasan CHECK lama pada kolom role dicari lewat information_schema
// karena namanya berbeda di MySQL (users_chk_1) dan MariaDB (role). Di MariaDB, CHECK milik kolom
// hanya bisa dilepas dengan mendefinisikan ulang kolomnya.
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
  if (/mariadb/i.test(v)) {
    if (checks.length) await conn.query('ALTER TABLE users MODIFY COLUMN role VARCHAR(20) NOT NULL');
  } else {
    for (const c of checks) await conn.query(`ALTER TABLE users DROP CHECK \`${c.name}\``);
  }
  await conn.query(
    "ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('infraadmin','admin','auditor','auditee','manajemen'))",
  );
}
