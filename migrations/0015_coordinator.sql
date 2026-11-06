-- Buku kerja koordinator (Hermes sebagai koordinator pipeline Playdesign).
--
-- Dua tabel kecil, tanpa byte media:
--   coordinator_alerts  : masalah yang sedang terbuka (satu baris per kind+ref),
--                         dipakai untuk mencegah alert yang sama dikirim berulang.
--   coordinator_actions : catatan tindakan otomatis (audit), append-only.
--
-- Alert yang sudah hilang diisi resolved_at, bukan dihapus, supaya riwayat tetap ada.

CREATE TABLE IF NOT EXISTS coordinator_alerts (
  id          TEXT PRIMARY KEY,              -- "<kind>:<ref>"
  kind        TEXT NOT NULL,
  ref         TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'critical')),
  message     TEXT NOT NULL,
  first_seen  TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen   TEXT NOT NULL DEFAULT (datetime('now')),
  count       INTEGER NOT NULL DEFAULT 1,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_coordinator_alerts_open
  ON coordinator_alerts (resolved_at, severity, last_seen DESC);

CREATE TABLE IF NOT EXISTS coordinator_actions (
  id     TEXT PRIMARY KEY,
  at     TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT NOT NULL,
  ref    TEXT,
  note   TEXT
);

CREATE INDEX IF NOT EXISTS idx_coordinator_actions_at
  ON coordinator_actions (at DESC);
