-- Tahap 4: tanda tangan elektronik pada persetujuan laporan audit.
-- Tanda tangan pengguna (gambar PNG sebagai data URL) disalin ke riwayat persetujuan saat menandatangani,
-- bersama sidik isi laporan (SHA-256) dan kode verifikasi yang bisa dicek siapa saja.
ALTER TABLE users ADD COLUMN signature MEDIUMTEXT NULL;
ALTER TABLE audit_approvals ADD COLUMN signature MEDIUMTEXT NULL;
ALTER TABLE audit_approvals ADD COLUMN content_hash CHAR(64) NULL;
ALTER TABLE audit_approvals ADD COLUMN sign_code VARCHAR(20) NULL;
CREATE UNIQUE INDEX audit_approvals_sign_code ON audit_approvals (sign_code);
