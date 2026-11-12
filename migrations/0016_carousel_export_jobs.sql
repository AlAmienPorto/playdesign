-- 0016_carousel_export_jobs.sql
-- Antrean ekspor carousel. Yang disimpan hanya spesifikasi dokumen, status, dan
-- pointer Drive — byte gambar/caption tidak pernah masuk D1 atau Cloudflare.
-- Runner lokal yang merender PNG 1080x1350 dan mengunggahnya ke Drive.

CREATE TABLE IF NOT EXISTS carousel_export_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'rendering', 'uploading', 'done', 'failed', 'canceled')),
  document TEXT NOT NULL DEFAULT '{}',
  slide_count INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER,
  drive_folder_id TEXT,
  drive_folder_link TEXT,
  manifest_file_id TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  requested_by TEXT,
  publish_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (publish_status IN ('idle', 'queued', 'scheduling', 'scheduled', 'failed')),
  publish_at TEXT,
  publish_accounts TEXT NOT NULL DEFAULT '["instagram"]',
  tebar_post_id TEXT,
  publish_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_carousel_jobs_workspace_status
  ON carousel_export_jobs (workspace_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_carousel_jobs_publish
  ON carousel_export_jobs (workspace_id, publish_status, created_at);

CREATE INDEX IF NOT EXISTS idx_carousel_jobs_post
  ON carousel_export_jobs (post_id, created_at);
