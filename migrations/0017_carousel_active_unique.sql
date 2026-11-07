-- 0017_carousel_active_unique.sql
-- Satu carousel hanya boleh punya satu job aktif. Tanpa index ini dua permintaan
-- ekspor bersamaan sama-sama lolos pengecekan aplikasi lalu merender + mengunggah
-- dua folder Drive untuk konten yang sama.

CREATE UNIQUE INDEX IF NOT EXISTS ux_carousel_active_job
  ON carousel_export_jobs (workspace_id, post_id)
  WHERE status IN ('queued', 'rendering', 'uploading');
