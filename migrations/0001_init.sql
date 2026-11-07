-- Harukaze48 — skema D1.
-- Worker juga menjalankan skema ini otomatis (CREATE IF NOT EXISTS) saat request
-- pertama, jadi file ini opsional: berguna kalau mau apply manual via
--   npx wrangler d1 migrations apply DB --remote

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Satu baris = satu hak akses untuk satu email.
--   kind = 'show' → hanya untuk show_slug tertentu, berlaku s/d expires_at
--   kind = 'pass' → semua show selama rentang starts_at..expires_at
CREATE TABLE IF NOT EXISTS grants (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('show', 'pass')),
  show_slug    TEXT,
  show_title   TEXT,
  starts_at    INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  max_devices  INTEGER NOT NULL DEFAULT 1,
  note         TEXT,
  revoked      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_grants_email ON grants (email);
CREATE INDEX IF NOT EXISTS idx_grants_expires ON grants (expires_at);

CREATE TABLE IF NOT EXISTS grant_devices (
  grant_id    TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  first_seen  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  PRIMARY KEY (grant_id, device_id)
);

CREATE TABLE IF NOT EXISTS entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  grant_id   TEXT NOT NULL,
  email      TEXT NOT NULL,
  show_slug  TEXT NOT NULL,
  at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_at ON entries (at);

-- Satu baris = satu link bypass tanpa perlu input email.
--   max_devices = batas perangkat per IP
--   max_ips     = batas jumlah IP berbeda (0 = tanpa batas IP)
CREATE TABLE IF NOT EXISTS bypass_links (
  id           TEXT PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,
  kind         TEXT NOT NULL DEFAULT 'show' CHECK (kind IN ('show', 'pass')),
  show_slug    TEXT,
  show_title   TEXT,
  starts_at    INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  max_devices  INTEGER NOT NULL DEFAULT 1,
  max_ips      INTEGER NOT NULL DEFAULT 1,
  note         TEXT,
  revoked      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bypass_code ON bypass_links (code);
CREATE INDEX IF NOT EXISTS idx_bypass_expires ON bypass_links (expires_at);

CREATE TABLE IF NOT EXISTS bypass_devices (
  bypass_id   TEXT NOT NULL,
  ip          TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  first_seen  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  PRIMARY KEY (bypass_id, ip, device_id)
);
CREATE INDEX IF NOT EXISTS idx_bypass_devices_id ON bypass_devices (bypass_id);

