# Fase 3A — Revisi AI per Scene: Design

## Intent

Memungkinkan pengguna memperbaiki satu scene video dengan instruksi bahasa alami tanpa meninggalkan Video Studio yang sudah ada. Hasil revisi harus langsung masuk ke `VideoSpec`, terlihat di `@remotion/player`, dan dapat dirender oleh runner yang sama.

## Goals

- Setiap kartu scene memiliki instruksi revisi dan tombol **Revisi dengan AI**.
- Workers AI merevisi hanya scene yang dipilih.
- Hasil AI divalidasi dan dinormalisasi sebelum mengganti scene lokal.
- Scene lain, `id`, referensi media, audio, render config, dan pengaturan unggah tidak berubah.
- VideoSpec memiliki konfigurasi adapter footage generatif yang jujur; status awal `none`/tidak tersedia.
- Alur akhir dibuktikan dengan panggilan AI nyata, preview UI, render MP4 lokal, `ffprobe`, dan pemeriksaan frame.

## Non-goals

- Tidak menghasilkan footage text-to-video/image-to-video pada fase ini.
- Tidak meminta atau menyimpan token provider berbayar.
- Tidak menambah dashboard, halaman, project Remotion, port, atau URL baru.
- Tidak membuat versioning/revision history di D1 pada fase ini.
- Tidak mengubah template lama, integrasi Telegram, atau alur Drive.

## Anti-goals

- Jangan menampilkan media palsu seolah dihasilkan provider AI.
- Jangan membiarkan output AI mengganti seluruh spec atau scene lain.
- Jangan menerapkan output AI yang tidak valid sebagian.
- Jangan mengirim byte gambar/video melalui Worker atau D1.

## Constraints

- Reuse `VideoComposer`, `VideoSpec`, Worker, dan runner yang ada.
- Workers AI binding `env.AI` sudah tersedia.
- UI, Worker, dan Python runner tetap menormalkan bentuk spec yang sama.
- Lima prinsip keras Video Studio tetap berlaku, termasuk unggah Drive opsional.
- Respons dan pesan kegagalan menggunakan Bahasa Indonesia.

## Approaches considered

### A. Workers AI untuk revisi + adapter footage nonaktif — dipilih

Worker merevisi satu scene dengan model yang sudah tersedia. Konfigurasi provider footage disiapkan di spec, tetapi default `none` dan UI menjelaskan bahwa provider belum tersambung. Ini dapat diuji sekarang tanpa biaya provider dan tanpa mengarang footage.

### B. Langsung Replicate

Memberikan footage generatif sekarang, tetapi memerlukan token rahasia, biaya per generasi, polling job provider, dan penanganan artefak eksternal. Ditunda sampai alur revisi dan kontrak adapter stabil.

### C. Revisi manual saja

Paling sederhana, tetapi tidak memenuhi tujuan revisi bahasa alami berbantuan AI.

## API design

Endpoint baru:

```http
POST /api/video/scenes/revise
Content-Type: application/json
Authorization: Bearer <session-or-api-token>

{
  "workspace": "playdesign",
  "instruction": "Buat CTA lebih singkat dan tegas, durasi 3 detik",
  "scene": { ...VideoScene },
  "context": {
    "prompt": "brief video",
    "style": { ...VideoStyle },
    "sceneIndex": 2,
    "sceneCount": 4
  }
}
```

Respons sukses:

```json
{
  "scene": { "id": "sc-abc", "kind": "cta", "durationSec": 3, "title": "Pesan Sekarang", "body": "Chat WhatsApp hari ini", "items": [], "transitionIn": "fade" },
  "model": "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
}
```

Aturan endpoint:

- Autentikasi dan workspace scope memakai mekanisme existing.
- `instruction` wajib 3–600 karakter.
- Input scene dinormalisasi sebelum masuk prompt.
- Model utama 70B, fallback 8B seperti chat existing.
- Model diminta mengembalikan satu objek JSON tanpa markdown.
- Parser menerima JSON murni atau fenced JSON, lalu memvalidasi allowlist.
- `id` selalu diambil dari scene lama.
- `media.refId` selalu dipertahankan; AI hanya boleh mengubah `fit` dan `motion`.
- Jika parsing/validasi gagal, endpoint mengembalikan error dan UI mempertahankan scene lama.

## VideoSpec adapter

Tambahkan:

```ts
interface VideoGeneration {
  provider: 'none' | 'replicate';
  enabled: boolean;
  mode: 'text-to-video' | 'image-to-video';
  model?: string;
}
```

Default dan normalisasi fase ini:

```json
{
  "provider": "none",
  "enabled": false,
  "mode": "text-to-video"
}
```

UI menampilkan status **Footage generatif belum tersambung** dan tidak menyediakan tombol yang terlihat aktif. Python runner mempertahankan field ini saat normalisasi; bila spec eksternal memaksa `enabled=true` dengan `provider=none`, runner gagal jelas sebelum render, bukan menghasilkan fallback palsu.

## UI behavior

Pada setiap `.scene-card`:

1. Textarea **Instruksi revisi scene**.
2. Tombol **Revisi dengan AI**.
3. Loading hanya pada kartu yang sedang diproses; tombol scene lain tetap terlihat tetapi revisi paralel dicegah agar update spec deterministik.
4. Sukses: scene terpilih diganti, preview berubah, toast menyebut nomor scene.
5. Gagal: scene tidak berubah dan toast menampilkan pesan manusiawi.

Instruksi disimpan sebagai state lokal `Record<sceneId, string>`, bukan bagian dari VideoSpec/D1.

Status provider ditampilkan di bagian brief atau scene sebagai panel informatif, tidak sebagai tab/halaman baru.

## Error handling

- AI timeout/kapasitas: fallback sekali ke 8B; jika tetap gagal, HTTP 503.
- Output bukan JSON: HTTP 502 `invalid_ai_response`.
- Instruksi kosong/terlalu panjang: HTTP 400.
- Scene invalid: HTTP 400; scene lama tidak disentuh.
- Provider footage `none` tetapi dipaksa aktif: runner gagal dengan pesan `Provider footage generatif belum dikonfigurasi.`

## Verification

1. Unit test parser/sanitizer: JSON murni, fenced JSON, enum invalid, durasi di luar batas, media refId dicoba diganti, dan respons rusak.
2. `npm run build` dan `tsc -p tsconfig.worker.json --noEmit` harus exit 0.
3. Endpoint produksi direvisi dengan AI nyata; respons harus mempertahankan `id` dan media `refId`.
4. Browser produksi: isi instruksi, klik revisi, cek hanya kartu target dan preview berubah.
5. Buat job dengan `render.upload=false`, jalankan runner, verifikasi H.264/AAC, dimensi/durasi, dan lihat frame hasil.
6. Pastikan status provider footage menyatakan belum tersedia dan tidak ada kontrol generasi aktif.
