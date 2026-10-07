-- Akun admin bisa juga dipakai untuk bekerja (misalnya sebagai auditor) dengan login yang sama.
-- users.work_role: peran saat mode kerja (NULL berarti hanya mode admin).
-- sessions.work_mode: 1 bila sesi ini sedang memakai mode kerja.
ALTER TABLE users ADD COLUMN work_role VARCHAR(20) NULL;
ALTER TABLE sessions ADD COLUMN work_mode TINYINT(1) NOT NULL DEFAULT 0;
