-- Login bisa memakai username selain email.
ALTER TABLE users ADD COLUMN username VARCHAR(60) NULL UNIQUE AFTER name;
-- Isi username awal dari bagian depan email; yang bentrok dilewati dan bisa diisi admin.
UPDATE IGNORE users SET username = LOWER(SUBSTRING_INDEX(email, '@', 1));
