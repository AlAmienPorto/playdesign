-- 0012_video_spec.sql
-- Video specification (spec v1): satu objek JSON yang dibaca Web UI, preview,
-- dan renderer. Kolom lama (props) tetap ada supaya template lama tidak rusak.

ALTER TABLE video_jobs ADD COLUMN spec TEXT NOT NULL DEFAULT '{}';
ALTER TABLE video_jobs ADD COLUMN spec_version INTEGER NOT NULL DEFAULT 1;
-- Dipakai kalau unggahan ke Drive dimatikan: file tetap di mesin runner.
ALTER TABLE video_jobs ADD COLUMN local_path TEXT;

-- Template bawaan untuk job berbasis spec. Komposisi `Story` membaca spec
-- lengkap, jadi props_schema tidak dipakai (UI memakai editor spec).
INSERT OR IGNORE INTO video_templates (id, name, composition_id, aspect, props_schema, enabled)
VALUES ('story', 'Story (berbasis spec)', 'Story', '9:16', '{"fields":[]}', 1);
