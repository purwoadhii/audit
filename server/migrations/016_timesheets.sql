-- Tahap 4: timesheet auditor. Jam kerja harian per audit (atau kegiatan non-audit) untuk dibandingkan
-- dengan anggaran jam di rencana audit tahunan.
CREATE TABLE timesheets (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  audit_id   INT NULL,
  work_date  DATE NOT NULL,
  activity   VARCHAR(60) NOT NULL,
  hours      DECIMAL(4,2) NOT NULL,
  note       VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY timesheets_user_date (user_id, work_date),
  KEY timesheets_audit (audit_id),
  CONSTRAINT timesheets_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT timesheets_audit_fk FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tanggal temuan ditutup (status Selesai), untuk analitik lama penyelesaian dan ketepatan waktu.
ALTER TABLE findings ADD COLUMN closed_at DATETIME(3) NULL;
UPDATE findings f SET f.closed_at = COALESCE(
  (SELECT MAX(l.created_at) FROM finding_logs l WHERE l.finding_id = f.id AND l.status = 'Selesai'), f.updated_at)
WHERE f.status = 'Selesai';
