-- Teks hasil pembacaan file (termasuk OCR) supaya isi dokumen bisa dicari.
-- text_status: pending (belum dibaca), done, ocr (dibaca dengan OCR), none (format tidak dibaca), failed.
ALTER TABLE attachments
  ADD COLUMN text_content MEDIUMTEXT NULL,
  ADD COLUMN text_status VARCHAR(10) NOT NULL DEFAULT 'pending';

-- Catatan pemakaian Asisten AI per permintaan ke penyedia.
CREATE TABLE ai_usage (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NULL,
  provider   VARCHAR(20) NOT NULL,
  model      VARCHAR(120) NOT NULL,
  ok         TINYINT(1) NOT NULL,
  status     INT NULL,
  error      VARCHAR(300) NULL,
  tokens_in  INT NULL,
  tokens_out INT NULL,
  ms         INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX ai_usage_created_idx (created_at),
  CONSTRAINT ai_usage_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
