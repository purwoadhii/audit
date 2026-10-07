-- Pengaturan aplikasi (tampilan, data master, keamanan) dalam bentuk kunci dan nilai JSON.
CREATE TABLE settings (
  k          VARCHAR(60) PRIMARY KEY,
  v          TEXT NOT NULL,
  updated_by INT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT settings_user_fk FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Setiap percobaan masuk, berhasil maupun gagal.
CREATE TABLE login_history (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NULL,
  login      VARCHAR(190) NOT NULL,
  success    BOOLEAN NOT NULL,
  reason     VARCHAR(40) NULL,
  ip         VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX login_history_created_idx (created_at),
  INDEX login_history_user_idx (user_id, created_at),
  CONSTRAINT login_history_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sesi login yang aktif, supaya admin bisa melihat dan memaksa keluar.
CREATE TABLE sessions (
  id           CHAR(32) PRIMARY KEY,
  user_id      INT NOT NULL,
  remember     BOOLEAN NOT NULL DEFAULT FALSE,
  ip           VARCHAR(64) NULL,
  user_agent   VARCHAR(255) NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at   DATETIME(3) NOT NULL,
  ended_at     DATETIME(3) NULL,
  ended_reason VARCHAR(30) NULL,
  INDEX sessions_user_idx (user_id),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users ADD COLUMN last_login_at DATETIME(3) NULL;
