# Video Studio di kantor.playdesign — spesifikasi fitur

Status: **rancangan**, belum diimplementasi.
Tujuan: user bisa membuat video dari UI CRM, dan **file video final hanya berakhir di Google Drive — tidak pernah disimpan di server** (Cloudflare Worker / D1 / R2).

---

## 1. Prinsip keras (tidak boleh dilanggar)

1. **Tidak ada byte video di infrastruktur Cloudflare.** Worker hanya menerima/mengembalikan JSON metadata.
2. **D1 tidak menyimpan file, hanya penunjuk**: `drive_file_id`, `drive_web_link`, ukuran, durasi, hash props.
3. **Tidak ada R2 / S3 / bucket.** Kalau butuh file sementara, itu terjadi di browser (Blob di memori) atau di mesin runner lokal, dan wajib dihapus setelah upload sukses.
4. **Kredensial Drive tidak masuk D1 dan tidak masuk repo.** Token OAuth hidup di memori browser; untuk runner, di `rclone.conf` mesin lokal.
5. **Satu job = satu file Drive.** Nama file deterministik supaya render ulang tidak menghasilkan duplikat tak terlacak.

## 2. Dua jalur render (pilih otomatis, bisa dipaksa manual)

| | Jalur A — browser | Jalur B — runner lokal |
|---|---|---|
| Mesin render | browser user (`@remotion/web-renderer` 4.0.540, `renderMediaOnWeb()`) | Ubuntu runner (`@remotion/renderer`, Chromium headless) |
| File singgah di | memori tab → langsung upload ke Drive | `~/work/render-tmp/` → upload → hapus |
| Batas praktis | ≤60 s, ≤1080p, ≤200 MB, 1 job per tab | tidak ada batas praktis |
| Butuh | Chrome/Edge/Firefox (WebCodecs) | runner hidup + `rclone` remote |
| Cocok untuk | promo pendek, konten sosial, 9:16 & 1:1 | video >60 s, 4K, 3D berat, batch |

Aturan pemilihan: default **A**. Kalau `durationInFrames/fps > 60`, resolusi > 1080p, atau user menekan "render di server tim", job dibuat dengan `engine='runner'` dan masuk antrean D1.

## 3. Alur UI (`#/crm/video`)

1. **Pilih template** — kartu dari `GET /api/video/templates` (nama, rasio, contoh thumbnail statis).
2. **Isi brief** — form yang dibangkitkan dari `props_schema`: judul, subjudul, CTA, warna brand, logo (upload ke Drive, bukan ke server), musik (id lagu), durasi.
3. **Preview** — `<Player>` Remotion di dalam halaman (bukan render). Ini yang bikin iterasi cepat dan gratis.
4. **Render & kirim** — tombol memicu:
   a. minta izin Drive sekali (Google Identity Services, scope `drive.file`),
   b. `renderMediaOnWeb()` dengan progress bar per frame,
   c. upload `uploadType=resumable` ke folder Drive tujuan,
   d. `PATCH /api/video/jobs/:id` → `done` + `drive_file_id`.
5. **Tabel job** — status, ukuran, durasi, tombol "Buka di Drive", "Render ulang", "Salin link".

Status job: `queued → rendering → uploading → done` (atau `failed`, `canceled`). Transisi divalidasi di Worker; tidak boleh mundur.

## 4. Skema D1 (`migrations/0010_video_studio.sql`)

```sql
CREATE TABLE IF NOT EXISTS video_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  composition_id TEXT NOT NULL,
  aspect TEXT NOT NULL,             -- 16:9 | 9:16 | 1:1
  props_schema TEXT NOT NULL,       -- JSON: field + tipe + default
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS video_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  title TEXT NOT NULL,
  props TEXT NOT NULL,              -- JSON props final
  status TEXT NOT NULL,             -- queued|rendering|uploading|done|failed|canceled
  engine TEXT NOT NULL,             -- browser|runner
  fps INTEGER NOT NULL,
  duration_frames INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  bytes INTEGER,
  drive_file_id TEXT,
  drive_web_link TEXT,
  drive_folder_id TEXT,
  error TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT,
  idempotency_key TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_video_jobs_status ON video_jobs(status, created_at DESC);
```

Catatan: `props` menyimpan JSON kecil (teks/warna/angka), **bukan** data biner. Aset gambar/video masuk Drive dulu, yang disimpan hanya `drive_file_id`-nya.

## 5. Endpoint Worker (semua di balik `assertToken` yang sudah ada)

| Method | Path | Isi |
|---|---|---|
| GET | `/api/video/templates` | daftar template aktif |
| GET | `/api/video/jobs?limit=50` | riwayat job workspace |
| POST | `/api/video/jobs` | buat job; **wajib** header `Idempotency-Key` (konsisten dengan `/api/tasks`) |
| PATCH | `/api/video/jobs/:id` | update status/progress/`drive_file_id`; hanya field yang diizinkan |
| POST | `/api/video/jobs/:id/claim` | runner mengambil satu job `queued` (atomik, `UPDATE ... WHERE status='queued'`) |
| GET | `/api/video/config` | `clientId` OAuth publik + `folderId` tujuan |

Batas: maks 10 job/jam per user, 1 job aktif per user, `title` ≤120 char, `props` ≤8 KB, `duration_frames` ≤3600.

## 6. Ketentuan template (karena render di browser)

Ini bukan preferensi gaya — ini batas teknis `@remotion/web-renderer` yang sudah didokumentasikan:

- **Tidak ada `z-index`.** Elemen digambar sesuai urutan DOM. Susun layer dari belakang ke depan; jangan mengandalkan stacking context.
- **Tidak ada** `backdrop-filter`, `mix-blend-mode`, `background-blend-mode`, `perspective`, `perspective-origin`, `transform-style`.
- **Mask** hanya linear-gradient atau satu raster `url()` same-origin/data/blob; `clip-path: url()` tidak jalan.
- **Media wajib** `<Video>` / `<Audio>` dari `@remotion/media`. `OffthreadVideo`, `Html5Video`, `Html5Audio` tidak didukung.
- **Font** lewat `@remotion/fonts` atau `@remotion/google-fonts`; `@font-face` CSS tidak ikut ter-embed.
- **Filter CSS** (blur, brightness, drop-shadow, dst.) jalan di Chrome/Firefox, **tidak** di Safari → tampilkan peringatan browser di UI.
- **Tidak ada multithreading**; tab harus tetap di depan. Kalau tab di-background, render melambat (ada fallback Web Worker timer, tapi tetap lebih lambat).
- Target output: H.264, CRF 18–23, audio AAC 128 kbps.

Konsekuensi desain: template yang "berat" (3D berat, banyak blend mode) harus punya varian jalur B, atau tidak dipakai sama sekali.

## 7. Google Drive

- **Scope:** `https://www.googleapis.com/auth/drive.file` — app hanya bisa melihat/mengubah file yang ia buat sendiri. Jangan pakai `drive` penuh.
- **Tipe klien:** OAuth Client ID "Web application", authorized JS origin `https://kantor.playdesign.my.id`. Alur browser pakai PKCE/token client; **client secret tidak dipakai dan tidak disimpan**.
- **Upload dari browser terbukti diizinkan Google** (dicek 2026-11-05): preflight `OPTIONS https://www.googleapis.com/upload/drive/v3/files` menjawab `access-control-allow-origin: https://kantor.playdesign.my.id`, `allow-methods: ... POST ...`, `allow-headers: authorization,content-type`. Jadi tidak perlu proxy di Worker.
- **Folder tujuan:** satu folder induk `Playdesign Video/`, subfolder `YYYY-MM/`. Folder id disimpan di config Worker (bukan rahasia).
- **Penamaan:** `YYYYMMDD-<slug-judul>-<template>-<jobid8>.mp4`.
- **Kuota:** file video memakan kuota Drive pemilik folder. Job gagal karena kuota harus muncul sebagai pesan jelas, bukan error mentah.

## 8. Keamanan & kepatuhan

- Auth: session `s1` yang sudah ada (password login + HMAC 30 hari). Tidak ada jalur baru tanpa `assertToken`.
- Otorisasi: job hanya bisa diubah oleh pembuatnya atau role admin.
- `Idempotency-Key` mencegah dobel job saat tombol diklik dua kali / retry jaringan.
- Token Drive tidak pernah dikirim ke Worker, tidak masuk localStorage; hanya di memori tab.
- Audit: `video_jobs` sudah menjadi log (siapa, kapan, template apa, hasil apa).
- **Lisensi Remotion:** pemakaian komersial oleh perusahaan (≥4 orang) butuh lisensi berbayar. Cek `skill remotion-license` sebelum fitur ini dipakai untuk klien.

## 9. Yang harus kamu siapkan (di luar kode)

1. **Google Cloud**: buat project → aktifkan Drive API → OAuth consent screen (internal/test) → buat OAuth Client ID tipe *Web application* dengan origin `https://kantor.playdesign.my.id`. Kasih saya **client id**-nya (bukan secret).
2. **Folder Drive**: buat folder `Playdesign Video`, kasih saya **folder id** (dari URL `drive.google.com/drive/folders/<ID>`).
3. Kalau mau jalur B: jalankan `rclone config` di mesin ini dan login Drive sendiri (saya tidak akan mengetik kredensial siapa pun).

## 10. Rencana kerja

| Tahap | Isi | Estimasi |
|---|---|---|
| M1 | Spike: 1 template promo (9:16), `renderMediaOnWeb` + upload Drive + `POST /api/video/jobs` | 1 hari |
| M2 | Halaman `#/crm/video` lengkap (template picker, form props, `<Player>` preview, tabel job) + migrasi `0010` | 1–2 hari |
| M3 | Jalur B: runner `scripts/video_render_runner.py` + `claim` + `rclone copy` + hapus temp + cron 5 menit | 1 hari |
| M4 | Pengerasan: rate limit, retry upload resumable, pesan error manusiawi, dokumentasi | 0,5 hari |

## 11. Risiko yang sudah diketahui

- **Tab ditutup saat render** → job menggantung di `rendering`. Mitigasi: `heartbeat` tiap 10 detik; job tanpa heartbeat >5 menit ditandai `failed` oleh cron.
- **Memori browser habis** pada video panjang/4K → batas keras jalur A, arahkan ke jalur B.
- **Safari** tidak mendukung filter → deteksi `navigator.userAgent`, tampilkan peringatan sebelum render.
- **Kuota Drive penuh** → cek `about.storageQuota` sebelum render, tolak lebih awal dengan pesan jelas.
- **Consent screen Google** bisa menahan pemakaian di luar akun tester sampai dipublikasikan; ini proses di sisi Google, bukan bug aplikasi.

---

## 9. Status implementasi (jalur B, tanpa OAuth)

Yang sudah terpasang dan diuji nyata:

| Bagian | Bukti |
| --- | --- |
| Migrasi `0010_video_studio.sql` | diterapkan ke D1 `office-crm` remote |
| Route API video | `GET /api/video/config`, `GET /api/video/templates`, `GET\|POST /api/video/jobs`, `POST /api/video/jobs/:id/claim`, `GET\|PATCH /api/video/jobs/:id` |
| UI `#/marketing/video` | form dinamis dari `props_schema`, tabel riwayat, tombol "Buka di Drive" |
| Template Remotion | `PromoSquare` (1:1), `PromoWide` (16:9), `PromoVertical` (9:16) di `~/work/remotion-starter` |
| Runner | `scripts/video_render_runner.py` + cron Hermes tiap 3 menit |
| Render nyata | h264, 1080×1080 150 frame 5,0 s / 1080×1920 180 frame 6,0 s |
| Upload | `rclone copyto` ke `<remote>:<folder>/YYYY-MM/YYYYMMDD-<slug>-<template>-<id8>.mp4` |

### Alur kerja

1. User mengisi brief di `#/marketing/video`, job masuk `queued` (D1 hanya pointer).
2. Cron `2ef3fa4539b6` menjalankan runner tiap 3 menit: klaim job → render di mesin ini → unggah → `PATCH` status `done` + `drive_file_id`/`drive_web_link`.
3. Folder temp (`/tmp/pd-video-*`) dihapus di blok `finally`, termasuk saat render/unggah gagal.

### Yang masih dibutuhkan agar file benar-benar ke Drive

1. `rclone config` → buat remote bernama `gdrive` (tipe Google Drive), login akun pemilik folder.
2. Set nama folder tujuan kalau bukan `Playdesign Video`: `VIDEO_REMOTE_BASE`.
3. Tidak ada rahasia yang perlu masuk D1 atau repo: `rclone.conf` tetap di mesin ini.

Selama remote belum ada, runner **tidak** menggagalkan job — job tetap `queued` dan peringatan dicetak sekali per job, lalu diproses otomatis begitu `rclone` siap.

### Catatan operasional

- Klaim job memakai `POST /claim` sehingga dua proses tidak merender job yang sama (409 = sudah diambil).
- `props` divalidasi ≤8 KB dan wajib `Idempotency-Key`; kiriman ulang dengan key sama mengembalikan job yang sama.
- Status tidak bisa melompat (`queued` → `done` ditolak 409); urutannya `queued → rendering → uploading → done|failed`.
- Cloudflare menolak User-Agent default Python (`error 1010`), jadi semua script memakai UA eksplisit `playdesign-runner/1.0`.
