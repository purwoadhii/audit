-- Lokasi penyimpanan tiap file bukti: 'local' (disk server) atau 's3' (object storage).
-- File lama tetap dibaca dari tempat asalnya walau pengaturan penyimpanan diganti.
ALTER TABLE attachments ADD COLUMN storage VARCHAR(10) NOT NULL DEFAULT 'local';
