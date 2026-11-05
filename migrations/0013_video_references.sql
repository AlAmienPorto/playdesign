-- 0013_video_references.sql
-- Pustaka referensi video: hanya metadata + penunjuk berkas.
-- Tidak ada byte media di D1: kolom `url` berisi https:// atau `local:` (path di
-- mesin runner). Runner mengunduh/menyalin berkas saat render lalu menghapusnya.

CREATE TABLE IF NOT EXISTS video_references (
  id          TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('image', 'video', 'audio')),
  role        TEXT NOT NULL CHECK (role IN ('style', 'motion', 'subject', 'music', 'sfx')),
  url         TEXT NOT NULL,
  strength    REAL NOT NULL DEFAULT 0.6,
  tags        TEXT NOT NULL DEFAULT '',
  note        TEXT,
  palette     TEXT,
  width       INTEGER,
  height      INTEGER,
  duration_ms INTEGER,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_video_references_ws
  ON video_references (workspace_id, created_at DESC);
