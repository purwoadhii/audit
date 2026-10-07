-- Skema awal Jejak Audit

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','auditor','auditee','manajemen')),
  unit          TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE templates (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  steps      JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audits (
  id          SERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  unit        TEXT NOT NULL,
  type        TEXT NOT NULL,
  lead_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  team        TEXT,
  start_date  DATE,
  end_date    DATE,
  status      TEXT NOT NULL DEFAULT 'Perencanaan'
              CHECK (status IN ('Perencanaan','Pelaksanaan','Pelaporan','Selesai')),
  scope       TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_steps (
  id         SERIAL PRIMARY KEY,
  audit_id   INTEGER NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  text       TEXT NOT NULL,
  result     TEXT NOT NULL DEFAULT 'Belum diuji'
             CHECK (result IN ('Belum diuji','Sesuai','Tidak sesuai','Tidak berlaku')),
  note       TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_steps_audit_idx ON audit_steps(audit_id, position);

CREATE TABLE findings (
  id             SERIAL PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  audit_id       INTEGER NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  step_id        INTEGER REFERENCES audit_steps(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  risk           TEXT NOT NULL CHECK (risk IN ('Tinggi','Sedang','Rendah')),
  condition      TEXT NOT NULL DEFAULT '',
  criteria       TEXT NOT NULL DEFAULT '',
  cause          TEXT NOT NULL DEFAULT '',
  effect         TEXT NOT NULL DEFAULT '',
  recommendation TEXT NOT NULL DEFAULT '',
  owner_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date       DATE,
  status         TEXT NOT NULL DEFAULT 'Terbuka'
                 CHECK (status IN ('Terbuka','Dalam proses','Menunggu verifikasi','Selesai')),
  response       TEXT NOT NULL DEFAULT '',
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX findings_audit_idx ON findings(audit_id);
CREATE INDEX findings_owner_idx ON findings(owner_id);

CREATE TABLE finding_logs (
  id         SERIAL PRIMARY KEY,
  finding_id INTEGER NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  text       TEXT NOT NULL,
  status     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX finding_logs_finding_idx ON finding_logs(finding_id);

CREATE TABLE attachments (
  id           SERIAL PRIMARY KEY,
  audit_id     INTEGER REFERENCES audits(id) ON DELETE CASCADE,
  finding_id   INTEGER REFERENCES findings(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  mime         TEXT NOT NULL,
  size         INTEGER NOT NULL,
  storage_name TEXT NOT NULL UNIQUE,
  uploaded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (audit_id IS NOT NULL OR finding_id IS NOT NULL)
);

CREATE TABLE activity_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  INTEGER,
  detail     JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_created_idx ON activity_log(created_at DESC);

INSERT INTO templates (name, steps) VALUES
 ('Keuangan', '["Rekonsiliasi kas dan bank dilakukan setiap bulan","Bukti pengeluaran disetujui pejabat berwenang","Pencatatan pendapatan sesuai periode","Saldo piutang dikonfirmasi dan umur piutang dianalisis","Penutupan buku bulanan tepat waktu"]'),
 ('Pengadaan', '["Rencana pengadaan disetujui","Minimal tiga penawaran untuk nilai di atas batas","Evaluasi vendor terdokumentasi","Kontrak ditandatangani sebelum pekerjaan dimulai","Barang diterima sesuai spesifikasi dan berita acara"]'),
 ('Operasional', '["SOP tersedia dan diperbarui","Pembagian tugas (segregation of duties) memadai","Target kinerja dipantau berkala","Persediaan dihitung fisik secara periodik","Keluhan pelanggan ditindaklanjuti"]'),
 ('Teknologi Informasi', '["Hak akses pengguna ditinjau berkala","Akun karyawan keluar dinonaktifkan","Backup data diuji pemulihannya","Perubahan sistem melalui persetujuan","Log keamanan dipantau"]'),
 ('Kepatuhan', '["Izin usaha dan lisensi masih berlaku","Laporan ke regulator tepat waktu","Kebijakan anti-fraud disosialisasikan","Pelatihan kepatuhan karyawan terdokumentasi"]');
