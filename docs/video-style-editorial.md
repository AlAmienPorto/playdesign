# Acuan gaya video: Editorial Tech (9:16)

Dokumen ini adalah hasil pembedahan video acuan yang dikirim user
(`video_8733ac8922f1.mp4`) dan menjadi acuan render konten bergaya sama.
Template yang mengimplementasikannya: **`editorial`** (komposisi Remotion `Editorial`).

## 1. Fakta teknis video acuan

| Properti | Nilai terukur |
| --- | --- |
| Durasi | 20,010667 s |
| Resolusi | 720 × 1280 (9:16) |
| Frame rate | 30 fps |
| Video | H.264, ≈2,48 Mbps |
| Audio | AAC 48 kHz stereo, ≈317 kbps |
| Ukuran file | 6,7 MB |
| Loudness | mean −20,4 dB, peak −3,0 dB |
| Cut keras | **tidak ada** pada ambang scene 0,15 maupun 0,28 → transisi berupa scroll/parallax vertikal yang halus, bukan potongan |

## 2. Palet (sampel dari frame)

| Peran | Nilai | Catatan |
| --- | --- | --- |
| Latar atas | `#0B1B31` | navy, ada glow hijau tipis di kiri atas |
| Latar tengah | `#071120` | |
| Latar bawah | `#02050D` | hampir hitam, gradien vertikal |
| Aksen utama | `#C8F542` (lime/chartreuse) | logo, badge, angka, kata kunci headline |
| Aksen sekunder | `#7CD4FD` (cyan) | baris bernomor genap, pil kedua |
| Aksen tersier | `#A78BFA` (violet) | glow sudut, panel studio |
| Teks utama | `#F4F7FB` | |
| Teks sekunder | `rgba(226,236,248,0.62)` | tagline, deskripsi |
| Garis | `rgba(226,236,248,0.14)` | border kartu |
| Kartu | `rgba(255,255,255,0.045)` | kaca gelap, bukan blur berat |

Dominasi gelap ~80 % area; aksen hanya dipakai untuk 1–3 elemen per layar.

## 3. Anatomi satu layar (atas → bawah)

1. **Chrome header**: logo mark kotak rounded beraksen + wordmark kapital tebal di kiri; label kecil
   ber-jarak (`BRAND / UPDATE`) di kanan; garis hairline tipis di bawah.
2. **Badge pil**: border 1 px aksen 40 %, isi dot 6 px + teks 11 px kapital ber-jarak
   (`● THE NEXT LEVEL`, `● NOW IN CODEX`, `● NOVEMBER 04 / 2026`).
3. **Headline**: 2–3 baris, weight 800, line-height ≈0,98, letter-spacing negatif; satu bagian
   (kata/frasa kunci) diberi warna aksen; sering diakhiri titik (`BUILD. REVIEW. CREATE.`).
4. **Tagline**: kapital kecil, letter-spacing 0,22–0,24 em, warna muted (`CODE • CREATE • SHIP`).
5. **Blok konten**: kartu kaca rounded 24–28 px dengan border tipis + shadow dalam:
   - baris header kartu: label kapital muted kiri, chip status kanan (`● READY` / `PLANNED` / `CHECKED`);
   - baris bernomor `01 02 03` (badge kotak kecil beraksen, judul bold, deskripsi muted);
   - panel mock: jendela terminal (3 dot macOS + `codex://ready` + kode mono) atau
     "IMAGE STUDIO" berisi visual gradien + tombol `GENERATE / EDIT`.
6. **Footer**: kiri teks kecil `OFFICIAL UPDATE · 4 NOV 2026`, kanan nomor halaman/indikator.
7. **Caption** (subtitle VO): satu baris, bold sans, putih, **tanpa kotak**, di ≈90 % tinggi.

## 4. Gerak

- Latar: starfield titik halus (deterministik) + grid tipis 1 px dengan mask gradien; glow radial
  di dua sudut; titik berkelip pelan.
- Masuk: spring per elemen (chrome → badge → headline → tagline → kartu), geser 20–45 px ke atas,
  opacity 0→1, kartu scale 0,985→1.
- Baris bernomor menyusul bergiliran (stagger 4 frame) supaya mata membaca berurutan.
- Baris kode terminal muncul progresif (5 frame per baris).
- Kamera: drift vertikal sangat kecil (≈12 px sepanjang scene) — pengganti cut keras.
- Penutup: fade 0,4 s ke latar.

## 5. Audio & caption

- VO laki-laki Indonesia, tempo +8 % terasa energik; ada musik bed tipis di acuan.
- Caption mengikuti frasa pendek (≤ ~46 karakter), satu baris, tanpa kotak.

## 6. Pemetaan ke VideoSpec v1 (tanpa ubah skema)

| Field spec | Dipakai template `Editorial` sebagai |
| --- | --- |
| `brand` (opsional, ≤24 char) | wordmark di chrome kiri (default `Playdesign`) |
| `style.accent` | aksen utama (lime di acuan) |
| `style.ink`, `style.fontFamily`, `style.typeScale` | teks utama, font, skala tipografi |
| `scene.title` | headline; `\n` memisah baris; `*frasa*` menandai bagian beraksen |
| `scene.body` | title: tagline · statement: paragraf di terminal · list: label kartu · cta: subheadline |
| `scene.items` | title/statement: item pertama = badge, sisanya baris bernomor · list: baris bernomor (maks 3) · cta: pil (maks 4) |
| `scene.media` | panel "Image studio" (gambar/video referensi) |
| `scene.kind` | `title` hero · `statement` kartu + terminal · `list` kartu bernomor · `cta` penutup terpusat · `quote` teks besar |
| `subtitle.*` | caption bawah; `boxed: false` untuk gaya acuan |
| `render.compositionId` | `Editorial` |

Contoh headline: `"IMAGES *2.6*"` → "IMAGES" putih, "2.6" lime.
Tanpa penanda `*`, kata terakhir otomatis diberi aksen.

## 7. Cara memakai

```bash
# job lewat API (produksi)
POST /api/video/jobs  { "templateId": "editorial", "spec": { ... } }
```

Template terdaftar lewat migrasi `migrations/0014_video_template_editorial.sql`
(`id='editorial'`, `composition_id='Editorial'`).

Komponen: `remotion/Editorial.tsx` (kanonik di repo) → disalin ke
`remotion-starter/src/Editorial.tsx` dan didaftarkan di `Root.tsx` sebagai komposisi `Editorial`.
Salinan di luar repo itu yang dipakai `npx remotion render`; kalau salah satu berubah, salin ulang.

## 8. Deviasi yang disengaja

- Footer memakai tanggal statis `Official update · 4 Nov 2026` — spec belum punya field tanggal.
- Tanpa musik bed kecuali `audio.music` diaktifkan dengan referensi musik.
- Caption dipecah otomatis 46 karakter (`split_long_cues`) karena edge-tts memecah per kalimat.
- Logo mark generik (kotak + inner square), bukan aset brand asli.

## 9. Checklist QC sebelum kirim

1. `ffprobe`: resolusi, durasi, H.264 + AAC ada.
2. Ekstrak frame di tiap scene, periksa via vision: tidak ada teks bertumpuk/terpotong,
   caption satu baris, headline tidak menyentuh tepi.
3. Cek audio tidak senyap (`volumedetect`).
4. Cek brand dan warna aksen sesuai brief.
