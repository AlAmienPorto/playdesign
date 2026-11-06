# Evaluasi MoneyPrinterTurbo vs Remotion (Video Studio Playdesign)

Tanggal uji: 2026-11-06. Semua angka di bawah hasil eksekusi nyata di mesin ini
(8 vCPU, 23 GB RAM, tanpa GPU), bukan kutipan README.

## 1. Ringkasan

**Verdict: partner, bukan pengganti.** MoneyPrinterTurbo (MPT) tidak bisa
mengalahkan Remotion untuk konten ber-identitas brand, dan Remotion tidak bisa
mengalahkan MPT untuk produksi footage massal. Keduanya mengisi sisi yang
berbeda dari pipeline yang sama.

Bukti: footage hasil MPT berhasil dirender ulang ke dalam template `Editorial`
tanpa perubahan kode render — hanya dengan memetakan output MPT ke
`spec.references` + `scenes[].media`.

## 2. Apa MPT sebenarnya

| Aspek | Fakta terukur |
| --- | --- |
| Repo | `harry0703/MoneyPrinterTurbo`, MIT, 139.924 stars, 22.311 fork, commit terakhir 2026-11-05 |
| Ukuran | 341 MB (142 MB font, 56 MB musik) |
| Kode | ±29.877 baris Python di `app/` |
| Arsitektur | `app/services/*` (pipeline), FastAPI (`app/asgi.py`, `/api/v1`), Streamlit WebUI (`webui/Main.py`), CLI (`cli.py`) |
| Render | MoviePy 2.x + ffmpeg subprocess (`combine_videos`, `concat_video_clips_with_ffmpeg`) |
| Pipeline | `generate_script` → `generate_terms` → `generate_audio` → `generate_subtitle` → material → `generate_final_videos` |
| LLM | 44 provider (`app/models/llm_provider.py`), termasuk Codex OAuth, Claude Code, Ollama, OpenRouter |
| TTS | edge-tts (322 suara, termasuk `id-ID-ArdiNeural`/`id-ID-GadisNeural`), Azure, ElevenLabs, Gemini, MiniMax, dll. |
| Footage | Pexels, Pixabay, Coverr (stok), + 8 provider video generatif (Seedance, MiniMax H3, MuAPI, dll.) |
| Output | 1080×1920 / 1920×1080 / 1080×1080, 30 fps, subtitle bakar, BGM |
| Distribusi | Upload-Post (TikTok/IG/YouTube) — layanan pihak ketiga, bukan API resmi |

Inti desainnya: **satu narasi mengalir di atas footage stok yang dipotong-potong**,
bukan komposisi grafis. Tidak ada konsep scene, layout, grid, atau design token.

## 3. Bukti instalasi & eksekusi

```bash
uv venv --python 3.12 ~/.venvs/mpt
uv pip install --overrides requirements-security.txt -r requirements.txt   # ±15 s (cache uv)
```

Catatan: resolver memasang **MoviePy 2.1.2**, bukan 2.2.1 seperti pin di
`requirements.txt` (konflik dengan override Pillow di `requirements-security.txt`).

Uji end-to-end offline (tanpa API key, memakai footage lokal):

```bash
~/.venvs/mpt/bin/python cli.py --video-script "Codex makin canggih! ..." \
  --video-source local --video-materials a.mp4,b.mp4,c.mp4 \
  --voice-name id-ID-ArdiNeural --bgm-type none --video-aspect 9:16 \
  --video-clip-duration 4 --subtitle-enabled --task-id <uuid>
```

Hasil: **berhasil**, 2 m 19 s, `final-1.mp4` 1080×1920, 17,21 s, 884 kbps H.264 +
176 kbps AAC, 2,3 MB.

Temuan QC dari frame hasil render:

1. **Cue panjang tidak dipecah.** SRT berisi 7 cue; cue #3 = 89 karakter
   (`OpenAI mengumumkan rencana akuisisi Pierre untuk memperkuat pengelolaan dan review kode`)
   dirender menjadi **3 baris** yang menutupi sepertiga bawah frame dan menabrak
   konten footage.
2. **Font default `STHeitiMedium.ttc`** (font Tionghoa) dipakai untuk teks Indonesia.
3. Tidak ada lapisan desain sama sekali — semua tipografi hanya subtitle.

Perbandingan kecepatan pada mesin yang sama:

| Renderer | Durasi output | Wall time | Catatan |
| --- | --- | --- | --- |
| MPT (MoviePy + ffmpeg) | 17,21 s | 139 s | 3 klip, trim/scale/concat, subtitle raster per frame |
| Remotion `Editorial` | 16,0 s (480 frame) | **23 s** | concurrency 4, grafis penuh |

Beban kerjanya tidak identik, tapi selisih ~6× cukup untuk menyimpulkan MoviePy
bukan jalur cepat.

## 4. Head-to-head

| Kapabilitas | Remotion (`Editorial`) | MoneyPrinterTurbo |
| --- | --- | --- |
| Desain / layout / grid / token warna | ✅ penuh, deterministik | ❌ tidak ada |
| Tipografi presisi (tracking, aksen kata, line-height) | ✅ | ⚠️ hanya font/ukuran/warna/outline subtitle |
| Motion graphic (spring, stagger, parallax, terminal) | ✅ | ❌ hanya transisi antar klip |
| Footage stok otomatis (Pexels/Pixabay/Coverr) | ❌ | ✅ |
| Video generatif (Seedance, MiniMax, MuAPI) | ❌ (adapter sengaja nonaktif) | ✅ 8 provider |
| Script + keyword otomatis multi-LLM | ⚠️ lewat Workers AI untuk revisi scene | ✅ 44 provider |
| TTS | 2 suara edge (id-ID) | ✅ 322 suara edge + 8 vendor |
| Subtitle pintar (pecah cue, satu baris) | ✅ `split_long_cues` | ❌ cue utuh → 3 baris |
| Kecepatan render | ✅ 23 s / 16 s video | ⚠️ 139 s / 17 s video |
| Reproducible / spec versioning | ✅ VideoSpec v1 + D1 + test | ❌ parameter task, tidak ada spec |
| Batch varian | ⚠️ satu job satu spec | ✅ `--video-count N`, batch file |
| Publikasi TikTok/IG/YT | ❌ | ⚠️ via Upload-Post (berbayar, pihak ketiga) |
| Web UI | sudah ada di CRM | Streamlit terpisah (tidak boleh dipakai — aturan revamp) |
| Kebutuhan infra | Node + Chromium | Python 3.12 + ffmpeg + 341 MB aset |
| Lisensi | komersial (Remotion) | MIT |

## 5. Yang tidak boleh diadopsi

- **MoviePy sebagai renderer utama** — 6× lebih lambat, tanpa kontrol layout.
- **Model "satu narasi + footage acak"** — hasilnya generik, tidak bisa jadi
  identitas brand Playdesign.
- **Streamlit WebUI** — melanggar aturan revamp (tidak ada UI baru/duplikat).
- **Menyimpan byte video di Cloudflare** — melanggar prinsip Video Studio.
- **Upload-Post untuk publikasi** — pihak ketiga berbayar, kredensial sosial
  user harus dititipkan; risiko tinggi.

## 6. Rencana integrasi (partner)

Prinsip: MPT tetap **di luar** repo `playdesign`, dijalankan sebagai sidecar
(`~/.venvs/mpt`, port sendiri). Tidak ada framework yang diganti, tidak ada
folder proyek baru di dalam repo, tidak ada duplikasi UI.

**Fase P1 — footage sourcing (paling bernilai, risiko rendah)**
1. `scripts/mpt_materials.py` di repo playdesign: panggil MPT CLI
   (`--stop-at materials`) atau `app.services.material` lewat subprocess venv MPT
   untuk mencari footage berdasarkan keyword.
2. Unduh hasil ke `remotion-starter/public/media/<slug>-<hash>.mp4`, catat
   sumber + lisensi.
3. Petakan ke VideoSpec: `references[] = {id, kind:'video', url}` dan
   `scenes[i].media = {refId}` — **sudah didukung `Editorial` hari ini**
   (dibuktikan pada `/tmp/render-hybrid/hybrid.mp4`).
4. Runner yang ada merender seperti biasa; D1 hanya menyimpan URL/metadata.

**Fase P2 — script & keyword**
Ganti pemanggilan LLM ad-hoc dengan MPT `generate_script`/`generate_terms`
(hanya jika butuh 44 provider). Untuk sekarang Workers AI sudah cukup.

**Fase P3 — distribusi (opsional, hati-hati)**
Hanya kalau user mau publikasi otomatis; butuh keputusan soal kredensial sosial
dan biaya Upload-Post. Default: tidak.

## 7. Aturan pemakaian

- Konten brand, edukasi, pengumuman produk, motion graphic 15–40 s → **Remotion**.
- Konten volume tinggi, footage-driven, 30–60 s, faceless → **MPT**, dan kalau
  perlu tampil rapi → naikkan lewat jalur hybrid (footage MPT + frame Editorial).
- Jangan pernah render konten brand lewat MoviePy.

## 8. Risiko

| Risiko | Mitigasi |
| --- | --- |
| Dua runtime (Node + Python 3.12) | sidecar terpisah, venv khusus, tidak menyentuh venv produksi |
| Disk 341 MB + cache footage | bersihkan `storage/` berkala, footage hanya yang terpakai |
| Lisensi footage stok | catat provider + ID klip; Pexels/Pixabay bebas komersial tanpa atribusi wajib |
| API key Pexels/Pixabay | simpan di `~/.config/playdesign/`, jangan di repo/D1 |
| Kualitas subtitle MPT | selalu lewat `split_long_cues` bila caption dipakai |
