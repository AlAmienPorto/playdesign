-- Video Studio: jobs & templates.
-- Hard rule: no video bytes ever land in D1. Rows only carry pointers
-- (drive_file_id) plus small JSON props used to re-render.

CREATE TABLE IF NOT EXISTS video_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  composition_id TEXT NOT NULL,
  aspect TEXT NOT NULL,
  props_schema TEXT NOT NULL DEFAULT '{"fields":[]}',
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS video_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  title TEXT NOT NULL,
  props TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued',
  engine TEXT NOT NULL DEFAULT 'runner',
  fps INTEGER NOT NULL DEFAULT 30,
  duration_frames INTEGER NOT NULL DEFAULT 450,
  width INTEGER NOT NULL DEFAULT 1080,
  height INTEGER NOT NULL DEFAULT 1920,
  bytes INTEGER,
  drive_file_id TEXT,
  drive_web_link TEXT,
  drive_folder_id TEXT,
  error TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT,
  idempotency_key TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_video_jobs_idem ON video_jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_video_jobs_status ON video_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_jobs_ws ON video_jobs(workspace_id, created_at DESC);

INSERT OR IGNORE INTO video_templates (id, name, composition_id, aspect, props_schema) VALUES
  ('promo-916', 'Promo Sosial 9:16', 'PromoVertical', '9:16',
   '{"fields":[{"key":"title","label":"Judul","type":"text","default":"Catering Sehat Tiap Hari"},{"key":"subtitle","label":"Subjudul","type":"text","default":"Masak fresh, antar tepat waktu"},{"key":"cta","label":"Ajakan","type":"text","default":"Pesan via WhatsApp"},{"key":"brand","label":"Nama brand","type":"text","default":"Playdesign"},{"key":"accent","label":"Warna aksen","type":"color","default":"#22d3ee"},{"key":"bg","label":"Warna latar","type":"color","default":"#0b1020"},{"key":"durationSec","label":"Durasi (detik)","type":"number","default":15}]}'),
  ('promo-11', 'Feed Persegi 1:1', 'PromoSquare', '1:1',
   '{"fields":[{"key":"title","label":"Judul","type":"text","default":"Desain yang Menjual"},{"key":"subtitle","label":"Subjudul","type":"text","default":"Branding + konten, satu tim"},{"key":"cta","label":"Ajakan","type":"text","default":"Konsultasi gratis"},{"key":"brand","label":"Nama brand","type":"text","default":"Playdesign"},{"key":"accent","label":"Warna aksen","type":"color","default":"#f59e0b"},{"key":"bg","label":"Warna latar","type":"color","default":"#111827"},{"key":"durationSec","label":"Durasi (detik)","type":"number","default":10}]}'),
  ('promo-169', 'Presentasi 16:9', 'PromoWide', '16:9',
   '{"fields":[{"key":"title","label":"Judul","type":"text","default":"Laporan Bulanan"},{"key":"subtitle","label":"Subjudul","type":"text","default":"Ringkasan performa tim"},{"key":"cta","label":"Ajakan","type":"text","default":"Buka dashboard"},{"key":"brand","label":"Nama brand","type":"text","default":"Playdesign"},{"key":"accent","label":"Warna aksen","type":"color","default":"#a78bfa"},{"key":"bg","label":"Warna latar","type":"color","default":"#0f172a"},{"key":"durationSec","label":"Durasi (detik)","type":"number","default":20}]}');
