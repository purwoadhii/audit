-- Tahap 2: persetujuan berjenjang, review ketua tim, versi file bukti, dan notifikasi di dalam aplikasi.

-- Penyetuju laporan (Manager atau Kepala unit) dan posisi audit di alur persetujuan.
-- approval: NULL (belum diajukan), 'review' (menunggu ketua tim), 'persetujuan' (menunggu penyetuju),
-- 'disetujui', atau 'dikembalikan'.
ALTER TABLE audits ADD COLUMN approver_id INT NULL;
ALTER TABLE audits ADD COLUMN approval VARCHAR(20) NULL;
ALTER TABLE audits ADD CONSTRAINT audits_approver_fk FOREIGN KEY (approver_id) REFERENCES users(id) ON DELETE SET NULL;

-- Riwayat persetujuan satu audit: siapa mengajukan, mereview, menyetujui, atau mengembalikan.
CREATE TABLE audit_approvals (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  audit_id   INT NOT NULL,
  user_id    INT NULL,
  action     VARCHAR(20) NOT NULL,
  note       TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX audit_approvals_audit_idx (audit_id),
  CONSTRAINT audit_approvals_audit_fk FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE,
  CONSTRAINT audit_approvals_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tanda review (sign-off) ketua tim untuk langkah program kerja dan temuan.
ALTER TABLE audit_steps ADD COLUMN reviewed_by INT NULL;
ALTER TABLE audit_steps ADD COLUMN reviewed_at DATETIME(3) NULL;
ALTER TABLE audit_steps ADD CONSTRAINT audit_steps_reviewer_fk FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE findings ADD COLUMN reviewed_by INT NULL;
ALTER TABLE findings ADD COLUMN reviewed_at DATETIME(3) NULL;
ALTER TABLE findings ADD CONSTRAINT findings_reviewer_fk FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

-- Versi file bukti. root_id menunjuk versi pertama (NULL untuk versi pertama itu sendiri),
-- superseded_by terisi bila sudah ada versi yang lebih baru.
ALTER TABLE attachments ADD COLUMN version INT NOT NULL DEFAULT 1;
ALTER TABLE attachments ADD COLUMN root_id INT NULL;
ALTER TABLE attachments ADD COLUMN superseded_by INT NULL;
CREATE INDEX attachments_root_idx ON attachments (root_id);

-- Notifikasi di dalam aplikasi. text adalah kalimat bahasa Indonesia yang diterjemahkan di browser, vars isinya (JSON).
CREATE TABLE notifications (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  text       VARCHAR(255) NOT NULL,
  vars       TEXT NULL,
  link       VARCHAR(255) NULL,
  read_at    DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX notifications_user_idx (user_id, read_at, id),
  CONSTRAINT notifications_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
