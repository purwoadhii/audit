-- Folder tempat file lokal disimpan. NULL berarti folder UPLOAD_DIR.
ALTER TABLE attachments ADD COLUMN storage_dir VARCHAR(500) NULL;
