# Content Radar 24 Jam — Desain

## Ringkasan

Content Radar adalah sub-menu/dashboard baru di area Marketing PlayDesign. Sistem mengumpulkan perkembangan teknologi selama 24 jam terakhir, menilai kredibilitas dan relevansinya, menyimpan semua kandidat yang memenuhi ambang ke D1, lalu setiap pukul 08.00 WIB membuat maksimal tiga Draft carousel terbaik.

Draft tidak pernah otomatis disetujui, diekspor, dijadwalkan, atau diterbitkan. Semua Draft tetap mengikuti lifecycle Carousel Studio: Draft → Review → Approved/Rejected → ekspor Drive → jadwal Tebar.

## Intent

PlayDesign membutuhkan radar harian yang tidak sekadar mengejar berita ramai. Sistem harus menemukan berita AI, teknologi, desain, digital product, dan crypto yang relevan bagi bisnis kreatif, desainer, UMKM, atau pengguna digital Indonesia; menunjukkan sumber dan alasan skor; dan mengurangi pekerjaan riset tanpa menghilangkan keputusan manusia.

## Sasaran

- Memantau sumber setiap dua jam dan mempertahankan jendela berita 24 jam.
- Menampilkan seluruh kandidat berkualitas (skor minimal 50) dalam dashboard Content Radar.
- Membuat maksimal tiga Draft carousel per hari dari kandidat dengan skor minimal 75.
- Membatasi Draft crypto maksimal satu per hari.
- Menjelaskan komponen skor, sumber primer, sumber pendukung, dan risiko klaim per kandidat.
- Menghasilkan Draft Bahasa Indonesia dengan sudut pandang dampak untuk bisnis kreatif, desainer, UMKM, atau pengguna digital Indonesia.
- Mengirim digest singkat ke Telegram setelah selector pukul 08.00 WIB selesai.
- Menjaga approval Owner sebagai syarat mutlak sebelum ekspor atau penjadwalan.

## Non-sasaran

- Tidak mempublikasikan atau menjadwalkan konten secara otomatis.
- Tidak membuat prediksi harga crypto, promosi token, referral, atau rekomendasi investasi.
- Tidak menganggap post komunitas/X/Reddit/Threads sebagai fakta tanpa verifikasi.
- Tidak memigrasikan seluruh Carousel Studio dari store browser ke D1 pada fase ini.
- Tidak membuat dashboard terpisah dari aplikasi kantor PlayDesign.
- Tidak menyimpan media berita di D1; hanya metadata, teks ringkas, skor, provenance, dan Draft JSON.

## Pendekatan yang dipilih

### A. Hybrid terkelola — dipilih

- Kandidat, registry sumber, run collector/selector, dan Draft Radar disimpan di D1 serta diisolasi dengan `workspace_id`.
- Collector dan selector berjalan lewat cron Hermes pada host lokal; Cloudflare hanya menyediakan API, D1, assets, dan dashboard.
- Collector mengambil RSS dan hasil discovery berkala.
- Selector Hermes memverifikasi sumber, memberi skor hybrid deterministik, dan membuat Draft.
- Draft dianggap tercipta saat tersimpan di D1 pukul 08.00 WIB. Carousel Studio mengambil Draft Radar dari API dan mengimpornya ke store existing menggunakan ID stabil ketika halaman berikutnya dibuka.

Alasan: memenuhi kebutuhan cron/server-side tanpa perubahan besar pada seluruh persistence Carousel Studio.

### B. Migrasi seluruh Carousel Studio ke D1 — tidak dipilih

Lebih konsisten untuk multi-device, tetapi memperbesar scope dan risiko regresi terhadap editor, review, Social Planner, dan store existing.

### C. Kandidat server-side, impor Draft manual — tidak dipilih

Paling sederhana, tetapi tidak memenuhi keputusan bahwa Top 3 otomatis menjadi Draft.

## Arsitektur

```text
Sumber resmi/media/RSS/search
        │
        ▼
Collector tiap 2 jam
- fetch
- canonicalize URL
- dedupe
- ekstrak metadata
- simpan provenance
        │
        ▼
D1: Content Radar
- sources
- candidates
- runs
- radar drafts
        │
        ▼
Selector 08.00 WIB
- cek silang
- klasifikasi niche
- hitung skor
- pilih maksimal 3
- buat Draft Bahasa Indonesia
        │
        ├──► Digest Telegram
        │
        ▼
Content Radar dashboard
        │
        ▼
Carousel Studio import Draft
        │
        ▼
Review Owner → ekspor Drive → jadwal Tebar
```

## Jadwal

### Collector

- Cron: setiap 2 jam.
- Jendela pencarian: 26 jam untuk toleransi keterlambatan feed; dashboard/selector hanya memakai 24 jam.
- Tidak memakai LLM untuk pekerjaan mekanis seperti fetch, canonical URL, dan deduplikasi.
- Search/discovery boleh menambah domain baru sebagai `unverified`.
- Collector tidak membuat Draft.

### Selector

- Cron: setiap hari pukul 08.00 WIB (`Asia/Jakarta`).
- Menilai ulang kandidat 24 jam terakhir karena cross-check baru dapat mengubah skor.
- Maksimal tiga Draft, skor masing-masing minimal 75.
- Maksimal satu Draft niche crypto.
- Bila hanya satu atau dua kandidat memenuhi syarat, hanya sebanyak itu yang dibuat.
- Digest dikirim ke Telegram chat asal: jumlah kandidat, Top Draft, skor, niche, sumber utama, dan tautan Content Radar.

## Registry sumber

### Tier A — primer/resmi

Bobot kredibilitas maksimum. Contoh:

- OpenAI, Anthropic, Google DeepMind/Research, Meta AI, Microsoft, Apple Developer.
- Adobe, Figma, GitHub, Cloudflare, NVIDIA.
- Paper resmi/arXiv yang dapat diidentifikasi dan release resmi proyek.
- OJK, BI, Bappebti, SEC, CFTC dan regulator relevan.
- Blog/release resmi proyek blockchain.

### Tier B — media bereputasi

- Reuters Tech, AP.
- TechCrunch, The Verge, Wired, Ars Technica, MIT Technology Review.
- Reuters, CoinDesk, The Block untuk crypto.

### Tier C — media lokal bereputasi/konteks Indonesia

- Kompas Tekno, Tempo Tekno, Katadata, DailySocial.
- Klaim regulasi harus dirujukkan ke regulator/dokumen resmi jika tersedia.

### Tier D — sinyal komunitas

- X, Reddit, Threads, Hacker News, Cointelegraph, komunitas atau akun individu.
- Tidak dapat menjadi Draft otomatis tanpa sumber primer atau minimal dua konfirmasi independen Tier B/C.

### Domain baru

- Disimpan sebagai `unverified`.
- Boleh masuk Radar sebagai kandidat jika skor total memenuhi 50, tetapi diberi label jelas.
- Tidak eligible untuk Draft otomatis sampai diverifikasi atau memiliki cross-check yang memenuhi aturan.
- Perubahan tier/enable/disable hanya oleh Owner melalui registry di Content Radar.

## Rubrik skor 0–100

Scoring menggunakan model **hybrid deterministik**:

- Komponen faktual (tier sumber, umur berita, jumlah/kelas cross-check, serta risk flags) dihitung oleh rumus tetap dari snapshot data.
- Hermes hanya memilih nilai diskret untuk relevansi PlayDesign dan potensi carousel, dari opsi yang telah ditentukan, serta wajib menulis alasan dan kutipan bukti.
- Total disimpan bersama versi rubrik dan snapshot input sehingga dapat dihitung ulang secara identik.
- Hermes tidak boleh memberikan angka bebas di antara nilai diskret.

Nilai diskret untuk relevansi: `0, 8, 13, 18, 21, 25`. Nilai diskret untuk potensi carousel: `0, 3, 5, 8, 10`. Komponen lain mengikuti tabel pemetaan tetap di bawah.

### 1. Kredibilitas sumber — 0–30

- 30: sumber primer/resmi yang langsung menerbitkan fakta/release/dokumen.
- 24–27: media Tier B dengan atribusi jelas.
- 18–23: media lokal Tier C dengan provenance memadai.
- 8–15: sinyal komunitas/Tier D.
- 0–10: domain belum diverifikasi.

### 2. Relevansi untuk PlayDesign — 0–25

- 21–25: dampak langsung pada workflow kreatif, AI untuk kerja, desain, produk digital, UMKM, keamanan digital, atau perilaku pengguna Indonesia.
- 13–20: relevansi industri/digital yang bisa diturunkan menjadi insight praktis.
- 0–12: berita umum tanpa kaitan kuat.

### 3. Kebaruan dan momentum — 0–15

- 13–15: terbit ≤6 jam dan berkembang.
- 9–12: 6–12 jam.
- 5–8: 12–24 jam.
- Penalti untuk pembaruan kecil dari berita lama.

### 4. Bukti dan cross-check — 0–15

- 13–15: sumber primer + minimal satu konfirmasi independen.
- 9–12: satu sumber primer lengkap atau dua media tepercaya independen.
- 4–8: satu media tepercaya, belum ada konfirmasi.
- 0–3: rumor, atribusi kabur, atau hanya komunitas.

### 5. Potensi carousel — 0–10

- 8–10: memiliki perubahan, dampak, contoh, dan takeaway yang bisa menjadi 4–8 slide tanpa mengulang.
- 4–7: layak dijelaskan tetapi bukti/visual terbatas.
- 0–3: hanya headline singkat atau spekulatif.

### 6. Keamanan editorial — 0–5

- 5: klaim faktual, atribusi jelas, risiko rendah.
- 3–4: perlu disclaimer/konteks.
- 0–2: rumor, potensi fitnah, konflik lisensi, klaim kesehatan/keuangan, atau ajakan investasi.

## Eligibility

### Masuk Content Radar

- Skor total minimal 50.
- URL kanonik tersedia.
- Judul, waktu publikasi/discovery, source domain, niche, dan provenance tersimpan.
- Kandidat duplikat digabung ke satu cluster berita.

### Menjadi Draft otomatis

Semua syarat berikut wajib:

- Skor minimal 75.
- Bukan domain `unverified` tanpa cross-check memadai.
- Memiliki sumber primer atau minimal dua sumber Tier B/C independen.
- Risiko editorial tidak memblokir.
- Belum pernah dibuat Draft untuk cluster yang sama.
- Maksimal satu Draft crypto pada run harian.

## Scope niche

- AI dan machine learning.
- Teknologi produk/platform/infrastruktur.
- Desain, creative tools, UX, digital product.
- Keamanan dan privasi digital.
- Perkembangan internet/platform yang memengaruhi kreator/UMKM.
- Crypto: teknologi blockchain, regulasi, keamanan/hack, stablecoin, infrastruktur, dan adopsi.

### Crypto yang ditolak

- Prediksi harga dan sinyal trading.
- Promosi/shilling token.
- Referral/affiliate.
- Klaim keuntungan.
- Rumor pasar tanpa sumber primer/tepercaya.

## Deduplikasi

- Normalisasi URL: hapus tracking parameter, fragment, dan varian AMP jika dapat dipetakan.
- Unique pada canonical URL.
- Cluster berita menggunakan kemiripan judul + entitas + rentang waktu.
- Cross-check dari domain berbeda ditautkan ke kandidat/cluster yang sama, bukan dibuat sebagai kandidat baru.
- Draft harian unique per cluster.

## Model data D1

Semua tabel memiliki `workspace_id` dan seluruh unique/index menyertakannya. Tidak ada kandidat, run, Draft, atau perubahan registry yang dapat dibaca/ditulis lintas workspace.

### `content_radar_sources`

- `id`, `workspace_id`, `domain`, `name`, `tier`, `kind`, `niches`, `feed_url`.
- `enabled`, `requires_crosscheck`, `verified_at`, `verified_by`, `notes`.
- `created_at`, `updated_at`.

### `content_radar_candidates`

- `id`, `workspace_id`, `cluster_key`, `canonical_url`.
- `title`, `summary`, `published_at`, `published_at_source`, `discovered_at`, `last_seen_at`.
- Jendela 24 jam memakai `published_at`; bila tidak tersedia, memakai `discovered_at` dan memberi flag `timestamp_fallback`. Timestamp masa depan ditolak.
- `niche`, `language`, `status` (`new`, `qualified`, `rejected`, `drafted`, `archived`).
- Komponen skor, `score_total`, `rubric_version`, dan `score_input_snapshot`.
- `score_reason`, `risk_flags`, `rejection_reason`, `draft_id`, `created_at`, `updated_at`.

### `content_radar_candidate_sources`

- `id`, `workspace_id`, `candidate_id`, `source_id`, `canonical_url`, `source_domain`.
- `relation` (`primary`, `crosscheck`, `signal`), `title`, `published_at`, `evidence_excerpt`, timestamps.
- Tabel ini menjaga provenance banyak-sumber per cluster; satu kandidat tidak dibatasi ke satu URL/sumber.

### `content_radar_runs`

- `id`, `workspace_id`, `kind` (`collector`, `selector`), `status`.
- Waktu mulai/selesai, jumlah fetched/new/updated/qualified/drafted/rejected.
- `error`, `meta`, timestamps.

### `content_radar_drafts`

- `id`, `workspace_id`, `candidate_id`, `post_id`, `title`, `document`.
- `status` hanya `Draft` saat dibuat otomatis.
- `score_snapshot`, `sources_snapshot`, `created_by`, `imported_at`, timestamps.
- Unique `(workspace_id, candidate_id)` dan `(workspace_id, post_id)`.
- Draft otomatis dihitung terhadap kuota tanggal `Asia/Jakarta`; Draft manual Owner tidak mengurangi kuota otomatis.

D1 menyimpan teks/metadata/Draft JSON saja; tidak menyimpan byte media.

## API

### Read

- `GET /api/content-radar/candidates`
  - Filter: window, niche, status, tier, minScore, query, pagination.
- `GET /api/content-radar/candidates/:id`
- `GET /api/content-radar/sources`
- `GET /api/content-radar/runs`
- `GET /api/content-radar/drafts?unimported=true`
- `POST /api/content-radar/drafts/:id/imported` untuk acknowledgement idempotent setelah store browser berhasil melakukan upsert.
- `POST /api/content-radar/internal/runs:force` untuk forced-run/dry-run terautentikasi saat verifikasi production; tidak diekspos ke UI umum.

### Internal/runner write

- `POST /api/content-radar/candidates:ingest`
- `POST /api/content-radar/runs`
- `POST /api/content-radar/candidates/:id/score`
- `POST /api/content-radar/candidates/:id/draft`

Semua memakai API bearer token mesin khusus. Identitas `radar-agent` ditetapkan server-side untuk token tersebut—bukan diterima dari header klien. Server membatasi identitas ini agar hanya bisa ingest, score, dan membuat status Draft; tidak bisa approve, export, schedule, atau publish. Session/token manusia tidak bisa menyamar sebagai `radar-agent`.

### Owner write

- `PATCH /api/content-radar/sources/:id` untuk tier/enable/notes.
- `POST /api/content-radar/candidates/:id/draft` untuk membuat Draft manual dari kandidat.
- `POST /api/content-radar/candidates/:id/reject` untuk menolak kandidat.

## Integrasi Carousel Studio

- Saat Carousel Studio dibuka, client memanggil `GET /api/content-radar/drafts?unimported=true`.
- Draft dipetakan ke `SocialPost`/`CarouselDocument` dengan ID stabil dari D1.
- Store melakukan upsert berdasarkan `post_id`; reload tidak membuat duplikat.
- Setelah impor berhasil, client menandai draft sebagai imported dengan pointer yang tidak berisi media.
- Draft masuk dengan status `Draft`; review/approval tetap menggunakan mekanisme existing.
- Draft Radar menampilkan badge provenance dan link kembali ke kandidat Content Radar.
- Fase hybrid ini tidak menjadikan seluruh store browser multi-device. D1 adalah source-of-truth untuk kandidat dan Draft awal; lifecycle setelah impor tetap mengikuti store existing.

## Draft generation

Setiap Draft otomatis:

- Bahasa Indonesia natural.
- Headline tidak clickbait dan tidak melebih-lebihkan sumber.
- 4–8 slide: cover, konteks, fakta utama, dampak, takeaway/aksi.
- Menjawab dampak bagi bisnis kreatif, desainer, UMKM, atau pengguna digital Indonesia.
- Caption tidak mengulang isi slide mentah-mentah.
- Menyimpan sumber utama dan sumber pendukung.
- Crypto menyertakan konteks bahwa konten bersifat informasi, bukan saran investasi jika relevan.
- Tidak mengambil artwork/logo/foto pihak ketiga sebagai aset final tanpa lisensi jelas.

## Dashboard Content Radar

Route: `/marketing/content-radar` dalam shell existing.

### Ringkasan atas

- Kandidat 24 jam.
- Kandidat ≥75.
- Draft otomatis hari ini.
- Domain belum diverifikasi.
- Collector terakhir dan selector terakhir.

### Daftar kandidat

Setiap kartu/baris menampilkan:

- Judul, niche, source domain, tier, waktu publikasi.
- Skor total dan breakdown enam komponen.
- Alasan skor singkat.
- Sumber utama + cross-check.
- Risk flags.
- Status: qualified/rejected/drafted.
- Aksi Owner: Buat Draft, Tolak, Kelola sumber.

### Registry sumber

- Domain, tier, niche, enabled/disabled, cross-check required.
- Perubahan hanya Owner dan diaudit.

### States

- Empty: belum ada kandidat ≥50 dalam 24 jam.
- Loading dan error eksplisit.
- Stale warning bila collector tidak berhasil >4 jam.
- Responsive tanpa horizontal overflow; tabel berubah menjadi kartu pada mobile.

## Digest Telegram

Format singkat:

- Waktu run dan cakupan 24 jam.
- Jumlah kandidat qualified.
- Maksimal tiga Draft: judul, niche, skor, sumber utama.
- Jumlah kandidat ditolak/duplikat.
- Tautan ke Content Radar.
- Error atau stale source disebutkan apa adanya.

Digest tidak menyertakan credential, raw dump, atau teks berita penuh.

## Quality dan keamanan

- Seluruh kandidat menyimpan URL provenance.
- Sumber komunitas tidak diperlakukan sebagai fakta.
- Skor selalu menyimpan breakdown dan alasan; bukan angka LLM tanpa audit trail.
- Fetch membatasi ukuran respons, timeout, content type, dan hanya HTTP/HTTPS.
- Canonical URL disanitasi; dashboard tidak menyisipkan HTML sumber.
- Internal write API tetap memakai bearer token existing; token tidak masuk D1/log/frontend.
- Actor `radar-agent` tidak memiliki jalur approval/publish.
- Owner approval tetap gate ekspor dan jadwal Tebar.
- Setiap source registry change, manual draft, reject, dan selector draft dicatat di `activity_events`.

## Failure handling

- Satu sumber gagal tidak menggagalkan batch; error dicatat per source/run.
- Collector bersifat idempotent berdasarkan canonical URL/cluster key.
- Selector bersifat idempotent berdasarkan tanggal WIB + candidate/cluster.
- Run yang tumpang tindih memakai lock/unique constraint.
- Kandidat lama diarsipkan, bukan dihapus, agar provenance dan dedupe historis tetap ada.
- Bila selector gagal setelah sebagian Draft dibuat, retry mempertahankan Draft yang sudah tercipta dan hanya mengisi slot otomatis yang tersisa; tidak mengganti pilihan atau membuat duplikat.
- Telegram digest dan failure notice dikirim ke DM Jawad, `telegram:1794359422`. Target disimpan eksplisit pada konfigurasi cron, bukan disimpulkan sebagai “chat asal”.
- Telegram failure notice dikirim bila selector gagal atau collector stale >4 jam.
- Forced-run/dry-run production menghasilkan `run_id`; verifikasi ready wajib mencatat deployment URL, `run_id`, `post_id` hasil impor idempotent, dan Telegram `message_id`.

## Acceptance criteria

- Collector berjalan setiap dua jam dan menyimpan kandidat deduped dengan provenance.
- Dashboard menampilkan semua kandidat skor ≥50 dari 24 jam terakhir.
- Selector pukul 08.00 WIB membuat 0–3 Draft skor ≥75, maksimal satu crypto.
- Domain unverified tanpa cross-check tidak pernah menjadi Draft otomatis.
- Draft otomatis terlihat di Carousel Studio sebagai Draft dan tidak bisa ekspor/jadwal sebelum Owner approval.
- Digest Telegram berisi hasil selector dan link dashboard.
- Seluruh endpoint menegakkan workspace, actor, dan role.
- Tes mencakup scoring boundary, dedupe, source tier, crypto cap, partial run retry, import idempotency, dan approval gate.
- Production route, cron runs, Draft import, dan Telegram delivery diverifikasi nyata sebelum disebut ready.

## Risiko tersisa / fase berikutnya

- Karena hybrid, perubahan Draft setelah diimpor masih mengikuti store browser existing dan belum multi-device penuh.
- Kualitas discovery bergantung pada RSS/index/search yang tersedia; dashboard harus menunjukkan source coverage dan stale state.
- Registry sumber perlu dievaluasi berkala; reputasi domain bukan jaminan tiap artikel benar.
- Migrasi seluruh lifecycle carousel ke D1 dapat dilakukan sebagai proyek terpisah jika kebutuhan multi-device menjadi prioritas.
