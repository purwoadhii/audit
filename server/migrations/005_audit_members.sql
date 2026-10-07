-- Anggota tim audit dari pengguna terdaftar. Kolom audits.team tetap dipakai untuk anggota eksternal.
CREATE TABLE audit_members (
  audit_id INT NOT NULL,
  user_id  INT NOT NULL,
  PRIMARY KEY (audit_id, user_id),
  INDEX audit_members_user_idx (user_id),
  CONSTRAINT audit_members_audit_fk FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE,
  CONSTRAINT audit_members_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
