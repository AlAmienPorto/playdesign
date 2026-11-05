-- Tahap 1: kendali job video.
-- attempts dipakai untuk menghitung berapa kali job diulang setelah gagal,
-- supaya UI bisa menampilkan "percobaan ke-N" dan runner tahu ini bukan
-- percobaan pertama. Tidak ada data video yang disimpan di sini.
ALTER TABLE video_jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
