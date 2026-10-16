-- Tahap 4: multi-entitas (perusahaan induk dan anak usaha dalam satu aplikasi).
-- Nama perusahaan disimpan sebagai teks dari daftar di pengaturan, seperti unit.
ALTER TABLE users ADD COLUMN company VARCHAR(150) NULL;
ALTER TABLE audits ADD COLUMN company VARCHAR(150) NULL;
CREATE INDEX audits_company ON audits (company);
ALTER TABLE auditable_entities ADD COLUMN company VARCHAR(150) NULL;
ALTER TABLE plan_items ADD COLUMN company VARCHAR(150) NULL;
