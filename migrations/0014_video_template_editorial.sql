-- 0014_video_template_editorial.sql
-- Template "Editorial Tech": hasil pembedahan video acuan 9:16 (starfield navy,
-- chrome logo + label, badge pil, headline berat beraksen, kartu kaca bernomor,
-- subtitle putih tebal tanpa kotak). Komposisi `Editorial` membaca spec v1 yang
-- sama dengan `Story`, jadi props_schema tetap kosong.

INSERT OR IGNORE INTO video_templates (id, name, composition_id, aspect, props_schema, enabled)
VALUES ('editorial', 'Editorial Tech 9:16', 'Editorial', '9:16', '{"fields":[]}', 1);
