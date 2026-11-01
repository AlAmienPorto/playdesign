-- Setiap agent punya daftar skill yang dipakai saat menjalankan tugasnya.
ALTER TABLE agents ADD COLUMN skills TEXT NOT NULL DEFAULT '[]';
