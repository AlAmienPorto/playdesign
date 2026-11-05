# VideoSpec v1 — satu spesifikasi untuk UI, pratinjau, dan render

Halaman `#/marketing/video` sekarang punya dua mode pembuatan job:

- **Studio** — menulis prompt, mengatur gaya/scene/suara, melihat pratinjau hidup, lalu mengantrekan job.
- **Template lama** — form 2 field yang sudah ada (`Promo*`), tidak diubah perilakunya.

Keduanya menulis ke tabel `video_jobs` yang sama; tidak ada halaman, project, atau
dashboard baru.

## Bentuk spesifikasi

`VideoSpec` (`src/lib/video-spec.ts`) adalah satu-satunya sumber kebenaran:

```jsonc
{
  "version": 1,
  "prompt": "…",                 // bahasa alami
  "negativePrompt": "…",
  "style": { "preset": "cinematic|realistic|anime|documentary|commercial|custom",
             "grade": "neutral|warm|cool|mono",
             "camera": "static|push-in|pull-out|pan-left|pan-right|handheld",
             "lighting": "soft|hard|backlit|natural",
             "transition": "cut|fade|slide|wipe",
             "pacing": "slow|medium|fast",
             "bg": "#0b1020", "accent": "#…", "ink": "#…", "typeScale": 1.0 },
  "scenes": [ { "kind": "title|statement|list|quote|cta|image|video",
                "durationSec": 4, "title": "…", "body": "…",
                "items": ["…"], "transitionIn": "fade", "media": {…} } ],
  "references": [ { "role": "style|motion|subject|music|sfx", "url": "…", "strength": 0.6 } ],
  "generation": { "provider": "none|replicate", "enabled": false, "mode": "text-to-video|image-to-video" },
  "audio": { "script": "…", "voice": { "enabled": true, "voiceId": "id-ID-GadisNeural", "rate": 0, "pitch": 0 },
             "music": { "enabled": false, "volume": 18 } },
  "subtitle": { "enabled": true, "position": "bottom|center|top", "fontSizePct": 4.2, "boxed": true },
  "render": { "aspect": "9:16|16:9|1:1", "fps": 30, "width": 1080, "height": 1920,
              "durationSec": 12, "upload": true, "compositionId": "Story" }
}
```

Batas: maksimal 24 scene, durasi 3–120 detik, fps 24–60, sisi 320–2160 px,
spec maksimal 24 KB.

## Tiga tempat yang memakai spec

| Tempat | Berkas | Peran |
| --- | --- | --- |
| Web UI + pratinjau | `src/lib/video-spec.ts`, `src/components/VideoComposer.tsx`, `src/components/StoryPlayer.tsx` | mengisi & menormalkan spec, memutar pratinjau `@remotion/player` |
| API | `worker/index.ts` → `normalizeVideoSpec()` | menormalkan spec sebelum disimpan ke D1 (memakai fungsi yang sama dengan UI) |
| Renderer | `scripts/video_spec.py` + `scripts/video_render_runner.py` | menormalkan ulang, membuat suara/subtitle, merender komposisi `Story` |

Karena UI dan Worker memakai berkas yang sama (`src/lib/video-spec.ts`), data di D1
tidak bisa "setengah jadi": nilai yang tidak dikirim UI/API otomatis diisi default
preset. Runner menormalkan lagi supaya job lama tetap aman.

## Alur render (runner, tiap 3 menit)

1. Ambil job `queued`, klaim, lalu normalkan spec.
2. `prepare_assets()`: edge-tts menulis `public/audio/<job>.mp3` + `.srt`, lalu SRT
   diurai jadi cue subtitle (`parse_srt`) — jadi subtitle mengikuti timing suara.
3. Render komposisi `Story` dengan props `{ spec, assets }`.
4. Selesai:
   - `render.upload = true` → unggah ke Google Drive, catat `drive_file_id` + link.
   - `render.upload = false` → file dipindah ke `~/work/drive-out/lokal`, catat
     `local_path`. Status tetap `done`, tanpa file id Drive.
5. Berkas sementara dihapus; tidak ada byte video di infrastruktur Cloudflare.

Transisi status `rendering → done` sah untuk jalur tanpa unggahan (`worker/index.ts`,
`VIDEO_TRANSITIONS`). Tanpa ini runner mendapat 409 dan job menggantung di `rendering`.

## Suara & subtitle

- Voice: `id-ID-GadisNeural` (perempuan), `id-ID-ArdiNeural` (laki-laki) — daftar dari
  `GET /api/video/config`.
- Naskah: kolom "Naskah narasi"; kosong = teks scene dirangkai otomatis
  (`narrationText()`), tombol "Isi dari teks scene" mengisinya sekali klik.
- Subtitle hanya aktif kalau TTS berhasil; posisi/ukuran diatur di panel.

## Menguji

```bash
# 1. UI: buka #/marketing/video → tab Studio → tulis prompt → "Buat scene dari prompt"
#    → cek pratinjau berubah → "Render (simpan lokal)" atau "Render & kirim ke Drive"
# 2. API langsung (tanpa UI)
curl -s -X POST https://kantor.playdesign.my.id/api/video/jobs \
  -H "Authorization: Bearer $API_TOKEN" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"templateId":"story","title":"Uji","spec":{"scenes":[{"kind":"title","durationSec":3,"title":"Halo"}]}}'
# 3. Jalankan runner sekali (biasanya cron */3)
python3 ~/.hermes/scripts/video_render_runner.py
# 4. Periksa hasil
ffprobe -v error -show_entries stream=codec_type,codec_name -of csv \
  ~/work/drive-out/lokal/<berkas>.mp4
```

Bukti uji terakhir (2026-11-05): job `vj-mw3k57o5-ca0l6p` → 6,0 s, h264 + aac,
276 KB, `local_path` terisi, tanpa unggahan; job `vj-mw3jrak4-0kt8h7` (dari UI,
unggahan aktif) → 643 KB di Drive.

## Revisi satu scene dengan Workers AI

`POST /api/video/scenes/revise` — auth workspace yang sama dengan endpoint video lain.

```jsonc
// request
{ "workspace": "playdesign",
  "instruction": "judul lebih tegas, durasi 3 detik",   // 3–600 karakter
  "scene": { "id": "sc-…", "kind": "title", "durationSec": 4, "title": "…", "media": { "refId": "ref-…" } },
  "prompt": "…", "style": { … }, "sceneIndex": 0, "sceneCount": 2 }

// response 200
{ "scene": { …hanya field yang diizinkan berubah… }, "model": "@cf/meta/llama-3.3-70b-instruct-fp8-fast" }
```

Aturan yang dipaksa server:

- Hanya `kind`, `durationSec`, `title`, `body`, `items`, `transitionIn`, `media.fit`,
  `media.motion` yang boleh berubah.
- `id` dan `media.refId` selalu diambil dari scene lama, bukan dari balasan model.
- Balasan model diparse (`extractSceneRevision`) lalu dinormalkan (`sanitizeSceneRevision`).
  JSON rusak → `502 invalid_ai_response` dan scene lama tidak berubah.
- Model 70B dicoba lebih dulu, fallback ke 8B hanya bila inferensi gagal; keduanya gagal →
  `503 ai_service_unavailable`.

UI: tab **Scene** di `#/marketing/video` punya satu kotak instruksi + tombol **Revisi AI**
per scene. Hanya scene itu yang diganti (`replaceScene()`), scene lain memakai objek lama.

## Yang belum ada (jujur)

- Provider video generatif (text-to-video / image-to-video) belum tersambung — butuh
  kunci berbayar. `generation.enabled=true` dengan `provider:"none"` ditolak runner
  dengan pesan `Provider footage generatif belum dikonfigurasi.`; tidak ada klip
  placeholder dan tidak ada tombol generate di UI. Remotion hanya menyusun
  footage/teks/audio yang diberikan.
- Endpoint revisi scene belum punya kuota per workspace; satu sesi login bisa memanggil
  model 70B berulang. Batas panjang instruksi (600 karakter) dan `max_tokens: 500` menahan
  biaya per panggilan, tetapi belum ada rate limit. Diterima sebagai risiko fase ini.
- Versioning spec belum ada; mengubah spec hanya bisa saat job masih `queued`
  (`spec_locked` setelah rendering). Revisi scene mengubah draft di editor, bukan job
  yang sudah dirender.
