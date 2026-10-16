-- Jenis catatan audit: temuan atau isu. Keduanya punya isian dan alur tindak lanjut yang sama.
ALTER TABLE findings ADD COLUMN kind VARCHAR(10) NOT NULL DEFAULT 'temuan';
ALTER TABLE findings ADD CONSTRAINT findings_kind_check CHECK (kind IN ('temuan','isu'));
