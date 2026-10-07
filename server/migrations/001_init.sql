-- Skema awal Jejak Audit (MySQL 8 / MariaDB 10.4+)

CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  email         VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role          VARCHAR(20)  NOT NULL CHECK (role IN ('admin','auditor','auditee','manajemen')),
  unit          VARCHAR(150) NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE templates (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(150) NOT NULL UNIQUE,
  steps      LONGTEXT NOT NULL, -- daftar langkah dalam format JSON
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Penghitung nomor urut per tahun (AUD-2026-001, TMN-2026-001).
CREATE TABLE counters (
  prefix VARCHAR(10) NOT NULL,
  year   INT NOT NULL,
  value  INT NOT NULL,
  PRIMARY KEY (prefix, year)
) ENGINE=InnoDB;

CREATE TABLE audits (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(30) NOT NULL UNIQUE,
  title       VARCHAR(255) NOT NULL,
  unit        VARCHAR(150) NOT NULL,
  type        VARCHAR(50) NOT NULL,
  lead_id     INT NULL,
  team        TEXT NULL,
  start_date  DATE NULL,
  end_date    DATE NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'Perencanaan'
              CHECK (status IN ('Perencanaan','Pelaksanaan','Pelaporan','Selesai')),
  scope       TEXT NULL,
  created_by  INT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT audits_lead_fk FOREIGN KEY (lead_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT audits_creator_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_steps (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  audit_id   INT NOT NULL,
  position   INT NOT NULL DEFAULT 0,
  text       TEXT NOT NULL,
  result     VARCHAR(20) NOT NULL DEFAULT 'Belum diuji'
             CHECK (result IN ('Belum diuji','Sesuai','Tidak sesuai','Tidak berlaku')),
  note       TEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX audit_steps_audit_idx (audit_id, position),
  CONSTRAINT audit_steps_audit_fk FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE findings (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  code           VARCHAR(30) NOT NULL UNIQUE,
  audit_id       INT NOT NULL,
  step_id        INT NULL,
  title          VARCHAR(255) NOT NULL,
  risk           VARCHAR(10) NOT NULL CHECK (risk IN ('Tinggi','Sedang','Rendah')),
  `condition`    TEXT NOT NULL,
  criteria       TEXT NOT NULL,
  cause          TEXT NOT NULL,
  effect         TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  owner_id       INT NULL,
  due_date       DATE NULL,
  status         VARCHAR(25) NOT NULL DEFAULT 'Terbuka'
                 CHECK (status IN ('Terbuka','Dalam proses','Menunggu verifikasi','Selesai')),
  response       TEXT NOT NULL,
  created_by     INT NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX findings_audit_idx (audit_id),
  INDEX findings_owner_idx (owner_id),
  CONSTRAINT findings_audit_fk FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE,
  CONSTRAINT findings_step_fk FOREIGN KEY (step_id) REFERENCES audit_steps(id) ON DELETE SET NULL,
  CONSTRAINT findings_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT findings_creator_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE finding_logs (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  finding_id INT NOT NULL,
  user_id    INT NULL,
  text       TEXT NOT NULL,
  status     VARCHAR(25) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX finding_logs_finding_idx (finding_id),
  CONSTRAINT finding_logs_finding_fk FOREIGN KEY (finding_id) REFERENCES findings(id) ON DELETE CASCADE,
  CONSTRAINT finding_logs_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE attachments (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  audit_id     INT NULL,
  finding_id   INT NULL,
  filename     VARCHAR(255) NOT NULL,
  mime         VARCHAR(150) NOT NULL,
  size         INT NOT NULL,
  storage_name VARCHAR(64) NOT NULL UNIQUE,
  uploaded_by  INT NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT attachments_audit_fk FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE,
  CONSTRAINT attachments_finding_fk FOREIGN KEY (finding_id) REFERENCES findings(id) ON DELETE CASCADE,
  CONSTRAINT attachments_user_fk FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE activity_log (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NULL,
  action     VARCHAR(20) NOT NULL,
  entity     VARCHAR(20) NOT NULL,
  entity_id  INT NULL,
  detail     LONGTEXT NULL, -- JSON
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX activity_log_created_idx (created_at),
  CONSTRAINT activity_log_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO templates (name, steps) VALUES
 ('Keuangan', '["Rekonsiliasi kas dan bank dilakukan setiap bulan","Bukti pengeluaran disetujui pejabat berwenang","Pencatatan pendapatan sesuai periode","Saldo piutang dikonfirmasi dan umur piutang dianalisis","Penutupan buku bulanan tepat waktu"]'),
 ('Pengadaan', '["Rencana pengadaan disetujui","Minimal tiga penawaran untuk nilai di atas batas","Evaluasi vendor terdokumentasi","Kontrak ditandatangani sebelum pekerjaan dimulai","Barang diterima sesuai spesifikasi dan berita acara"]'),
 ('Operasional', '["SOP tersedia dan diperbarui","Pembagian tugas (segregation of duties) memadai","Target kinerja dipantau berkala","Persediaan dihitung fisik secara periodik","Keluhan pelanggan ditindaklanjuti"]'),
 ('Teknologi Informasi', '["Hak akses pengguna ditinjau berkala","Akun karyawan keluar dinonaktifkan","Backup data diuji pemulihannya","Perubahan sistem melalui persetujuan","Log keamanan dipantau"]'),
 ('Kepatuhan', '["Izin usaha dan lisensi masih berlaku","Laporan ke regulator tepat waktu","Kebijakan anti-fraud disosialisasikan","Pelatihan kepatuhan karyawan terdokumentasi"]');
