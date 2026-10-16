-- Kategori temuan dan kategori akar masalah. Pilihannya diatur di System Admin → Pengaturan → Data master.
ALTER TABLE findings ADD COLUMN category VARCHAR(150) NULL;
ALTER TABLE findings ADD COLUMN root_cause VARCHAR(150) NULL;
