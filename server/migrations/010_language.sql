-- Bahasa tampilan per pengguna. Bawaan bahasa Inggris.
ALTER TABLE users ADD COLUMN language VARCHAR(8) NOT NULL DEFAULT 'en';
