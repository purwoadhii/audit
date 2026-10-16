-- Tahap 3: perencanaan audit berbasis risiko (IIA), dengan matriks risiko 5×5 (kemungkinan × dampak) ala COSO.

-- Audit universe: semua area yang bisa diaudit (proses bisnis, sistem, vendor, lokasi, unit organisasi).
CREATE TABLE auditable_entities (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  kind        VARCHAR(100) NOT NULL,
  unit        VARCHAR(150) NULL,
  owner       VARCHAR(150) NULL,
  description TEXT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  INT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT entities_creator_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Penilaian risiko satu area per tahun. Skor = kemungkinan × dampak (1 sampai 25).
CREATE TABLE risk_assessments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  entity_id   INT NOT NULL,
  year        INT NOT NULL,
  likelihood  TINYINT NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
  impact      TINYINT NOT NULL CHECK (impact BETWEEN 1 AND 5),
  notes       TEXT NULL,
  assessed_by INT NULL,
  assessed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY risk_entity_year (entity_id, year),
  CONSTRAINT risk_entity_fk FOREIGN KEY (entity_id) REFERENCES auditable_entities(id) ON DELETE CASCADE,
  CONSTRAINT risk_assessor_fk FOREIGN KEY (assessed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rencana audit tahunan: satu baris per penugasan yang direncanakan, dengan triwulan, ketua tim, dan anggaran jam.
CREATE TABLE plan_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  year        INT NOT NULL,
  entity_id   INT NULL,
  title       VARCHAR(255) NOT NULL,
  unit        VARCHAR(150) NOT NULL,
  type        VARCHAR(50) NOT NULL,
  quarter     TINYINT NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  lead_id     INT NULL,
  notes       TEXT NULL,
  cancelled   BOOLEAN NOT NULL DEFAULT FALSE,
  audit_id    INT NULL,
  created_by  INT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX plan_items_year_idx (year),
  CONSTRAINT plan_entity_fk FOREIGN KEY (entity_id) REFERENCES auditable_entities(id) ON DELETE SET NULL,
  CONSTRAINT plan_lead_fk FOREIGN KEY (lead_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT plan_audit_fk FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE SET NULL,
  CONSTRAINT plan_creator_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Alokasi auditor dan anggaran jam per penugasan.
CREATE TABLE plan_item_members (
  plan_item_id INT NOT NULL,
  user_id      INT NOT NULL,
  hours        INT NOT NULL DEFAULT 0,
  PRIMARY KEY (plan_item_id, user_id),
  CONSTRAINT plan_members_item_fk FOREIGN KEY (plan_item_id) REFERENCES plan_items(id) ON DELETE CASCADE,
  CONSTRAINT plan_members_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit bisa dikaitkan ke area di audit universe.
ALTER TABLE audits ADD COLUMN entity_id INT NULL;
ALTER TABLE audits ADD CONSTRAINT audits_entity_fk FOREIGN KEY (entity_id) REFERENCES auditable_entities(id) ON DELETE SET NULL;
