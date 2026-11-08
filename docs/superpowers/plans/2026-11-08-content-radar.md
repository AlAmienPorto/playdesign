# Content Radar 24 Jam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun dashboard Content Radar yang mengumpulkan berita teknologi setiap dua jam, memilih kandidat berkualitas setiap pukul 08.00 WIB, membuat maksimal tiga Draft carousel, dan mengirim digest Telegram tanpa melewati approval Owner.

**Architecture:** Cloudflare Worker + D1 menjadi API, persistence, dan assets. Dua cron Hermes lokal menjalankan collector dan selector memakai skrip fokus di `scripts/`; selector memakai scoring hybrid deterministik dan menyimpan Draft server-side. React menampilkan dashboard `/marketing/content-radar`, sedangkan Carousel Studio mengimpor Draft D1 secara idempotent ke store existing saat halaman dibuka.

**Tech Stack:** React 18, TypeScript, Vite, Cloudflare Workers, D1/SQLite, Python stdlib, Hermes cron, Telegram delivery.

**Spec:** `docs/superpowers/specs/2026-11-08-content-radar-design.md`

## Global Constraints

- Collector berjalan setiap 2 jam; selector berjalan pukul 08.00 WIB (`Asia/Jakarta`).
- Kandidat masuk Radar pada skor ≥50; Draft otomatis hanya skor ≥75; maksimal tiga Draft/hari dan maksimal satu crypto.
- Seluruh tabel, endpoint, unique constraint, dan query wajib scoped dengan `workspace_id`.
- Draft otomatis selalu berstatus `Draft`; `radar-agent` tidak dapat approve, export, schedule, atau publish.
- D1 hanya menyimpan teks/metadata/Draft JSON, tidak menyimpan byte media.
- Draft berbahasa Indonesia dan membahas dampak bagi bisnis kreatif, desainer, UMKM, atau pengguna digital Indonesia.
- Crypto hanya teknologi, regulasi, keamanan, dan adopsi; tidak ada prediksi harga, token shilling, referral, atau saran investasi.
- Digest dan failure notice dikirim ke `telegram:1794359422`.
- Reuse shell, API token pattern, `activity_events`, Carousel Studio, Drive runner, dan Tebar integration existing.

## Review Focus

1. **Workspace IDOR:** seluruh read/write Radar harus menolak akses workspace lain; ditest pada API source, candidate, draft, dan run.
2. **Retry selector parsial:** Draft yang sudah dibuat tidak terganti/duplikat; retry hanya mengisi slot otomatis yang tersisa.
3. **Waktu invalid/future:** `published_at` masa depan ditolak; fallback `discovered_at` diberi flag dan tetap dihitung konsisten.
4. **Discovery tak tepercaya:** domain unverified/komunitas tidak dapat menjadi Draft otomatis tanpa cross-check yang memenuhi syarat.
5. **Import browser gagal di tengah jalan:** upsert store harus selesai sebelum acknowledgement `imported`; reload tidak menggandakan Draft.

---

## File Structure

- `migrations/0018_content_radar.sql` — skema source, candidate, provenance, run, draft, indexes, unique locks, dan audit-compatible fields.
- `src/lib/content-radar.ts` — tipe domain, scoring deterministik, eligibility, seleksi Top 3, URL canonicalization, dan import mapping.
- `src/lib/content-radar.test.ts` — tes domain/scoring/dedupe/selection/import.
- `worker/content-radar.ts` — handler API Radar terfokus; validasi, role, workspace, dan D1 queries.
- `worker/index.ts` — route wiring dan Env/auth adapter minimal ke modul Radar.
- `src/lib/api.ts` — client API Content Radar.
- `src/pages/ContentRadar.tsx` — dashboard candidates/runs/source registry.
- `src/pages/CarouselStudio.tsx` — import Draft Radar saat halaman dibuka.
- `src/store/store.tsx` — aksi upsert Draft Radar idempotent.
- `src/routes.ts`, `src/App.tsx`, `src/styles.css` — route, sub-menu, breadcrumb, responsive UI.
- `scripts/content_radar_common.py` — HTTP API client, lock, canonical URL, run lifecycle, dan source feed helpers.
- `scripts/content_radar_collector.py` — collector mekanis per 2 jam.
- `scripts/content_radar_selector.py` — validasi/score/select/draft dan output digest.
- `scripts/tests/test_content_radar.py` — tes runner dengan server/feed palsu.
- `~/.hermes/scripts/content_radar_*.py` — salinan runtime setelah verifikasi repo.

---

### Task 1: Domain Scoring, Eligibility, dan Seleksi Harian

**Files:**
- Create: `src/lib/content-radar.ts`
- Create: `src/lib/content-radar.test.ts`

**Interfaces:**
- Produces: `canonicalizeRadarUrl(url: string): string`, `computeRadarScore(input: RadarScoreInput): RadarScore`, `isAutoDraftEligible(candidate: RadarCandidate): RadarEligibility`, `selectDailyDrafts(candidates: RadarCandidate[], limit?: number): RadarCandidate[]`, `radarDraftToSocialPost(draft: RadarDraft): SocialPost`.
- Consumes: `CarouselDocument` dan `SocialPost` dari `src/data/types.ts`.

- [ ] **Step 1: Tulis tes gagal untuk URL canonicalization dan timestamp**
  - Hapus `utm_*`, fragment, trailing slash deterministik.
  - Tolak scheme selain HTTP/HTTPS.
  - Kandidat timestamp masa depan tidak eligible; fallback discovery ditandai.

- [ ] **Step 2: Jalankan tes untuk memastikan RED**

Run: `npx tsx --test src/lib/content-radar.test.ts`
Expected: FAIL karena modul belum ada.

- [ ] **Step 3: Implementasikan tipe dan canonicalization minimal**

Gunakan tipe literal untuk tier `A|B|C|D|unverified`, niche, risk flag, status, dan komponen skor.

- [ ] **Step 4: Tambahkan tes scoring hybrid deterministik**
  - Kredibilitas, umur, cross-check, dan safety menghasilkan nilai tetap.
  - Relevansi hanya menerima `0|8|13|18|21|25`.
  - Potensi hanya menerima `0|3|5|8|10`.
  - Boundary total 49/50 dan 74/75.

- [ ] **Step 5: Implementasikan `computeRadarScore` dan eligibility**

Total harus dapat dihitung ulang dari `rubricVersion` + snapshot input.

- [ ] **Step 6: Tambahkan tes seleksi Top 3**
  - Maksimal tiga.
  - Maksimal satu crypto.
  - Tidak mengisi slot dengan skor <75.
  - Domain unverified tanpa cross-check ditolak.
  - Tie-break: skor, published timestamp terbaru, candidate ID stabil.

- [ ] **Step 7: Implementasikan `selectDailyDrafts` dan mapping Draft**

Mapping menghasilkan `status: 'Draft'`, ID stabil, provenance URL, dan dokumen carousel 4–8 slide.

- [ ] **Step 8: Jalankan tes GREEN dan commit**

Run: `npx tsx --test src/lib/content-radar.test.ts`
Expected: seluruh tes PASS.

Commit: `feat(marketing): add Content Radar scoring domain`

---

### Task 2: D1 Schema dan Registry Sumber Awal

**Files:**
- Create: `migrations/0018_content_radar.sql`
- Create: `scripts/content_radar_sources.json`
- Test: `scripts/tests/test_content_radar_migration.py`

**Interfaces:**
- Produces: tabel `content_radar_sources`, `content_radar_candidates`, `content_radar_candidate_sources`, `content_radar_runs`, `content_radar_drafts`.
- Consumes: `workspaces`, `actors`, `activity_events` existing.

- [ ] **Step 1: Tulis tes migrasi gagal pada DB kosong dengan prerequisite `0001`**
  - Apply `0001`, `0016`, `0017`, lalu `0018`.
  - Assert seluruh tabel/index dan CHECK constraint.
  - Assert unique canonical/cluster/draft per workspace.
  - Assert dua workspace boleh memiliki domain/canonical yang sama.

- [ ] **Step 2: Jalankan tes RED**

Run: `python3 scripts/tests/test_content_radar_migration.py`
Expected: FAIL karena migrasi belum ada.

- [ ] **Step 3: Tulis migration `0018`**

Tambahkan partial/unique index untuk lock run per workspace+kind dan Draft otomatis per tanggal WIB+cluster.

- [ ] **Step 4: Tambahkan registry JSON awal**

Masukkan domain yang disetujui dalam Tier A–D; jangan menyimpan credential. Seeder harus idempotent berdasarkan `(workspace_id, domain)`.

- [ ] **Step 5: Jalankan tes GREEN dan commit**

Run: `python3 scripts/tests/test_content_radar_migration.py`
Expected: PASS.

Commit: `feat(marketing): add Content Radar D1 schema`

---

### Task 3: Worker API — Read, Ingest, Score, Draft, dan Registry

**Files:**
- Create: `worker/content-radar.ts`
- Modify: `worker/index.ts`
- Create: `worker/content-radar.test.ts`

**Interfaces:**
- Consumes: D1 binding, `assertWorkspace`, auth result, `json/fail`, activity audit adapter dari `worker/index.ts`.
- Produces: `routeContentRadar(req, env, context): Promise<Response | null>` dan endpoint yang ditetapkan spec.

- [ ] **Step 1: Ekstrak adapter minimal tanpa refactor worker yang tidak terkait**

Expose helper melalui context object; jangan memindahkan route existing.

- [ ] **Step 2: Tulis tes auth/workspace RED**
  - Read workspace sendiri berhasil.
  - Workspace lain ditolak.
  - Header actor palsu tidak dapat memperoleh identitas `radar-agent`.
  - Session manusia tidak dapat memakai internal ingest/score.
  - `radar-agent` tidak dapat menjalankan Owner registry mutation.

- [ ] **Step 3: Implementasikan machine identity server-fixed**

Gunakan secret terpisah `RADAR_API_TOKEN`; mapping token ke `radar-agent` terjadi server-side. Jangan log token.

- [ ] **Step 4: Tulis dan implementasikan read endpoints**

Pagination wajib bounded; semua SQL menyertakan `workspace_id`; JSON source HTML tidak pernah dirender sebagai HTML.

- [ ] **Step 5: Tulis dan implementasikan ingest idempotent**

Upsert canonical candidate dan provenance source. Cluster/cross-check tidak membuat duplikat kandidat.

- [ ] **Step 6: Tulis dan implementasikan score/draft endpoints**

Server menghitung ulang komponen deterministik; hanya menerima nilai diskret Hermes + alasan. Endpoint Draft menegakkan ≥75, cross-check, cap harian, crypto cap, dan status `Draft`.

- [ ] **Step 7: Tulis dan implementasikan Owner endpoints + audit**

Source tier/enable, manual Draft, dan reject menulis `activity_events` memakai entity type yang kompatibel (mis. `report`) dengan metadata `radarEntityType`, tanpa mengubah CHECK lama secara destruktif.

- [ ] **Step 8: Tulis tes retry/lock/partial failure**

Dua selector bersamaan: satu lock menang. Retry setelah dua Draft hanya mengisi satu slot tersisa. Draft manual tidak mengurangi kuota otomatis.

- [ ] **Step 9: Jalankan tes, typecheck, commit**

Run: `npx tsx --test worker/content-radar.test.ts && npm run typecheck`
Expected: PASS, 0 type errors.

Commit: `feat(marketing): add Content Radar API`

---

### Task 4: API Client, Dashboard, dan Navigasi

**Files:**
- Modify: `src/lib/api.ts`
- Create: `src/pages/ContentRadar.tsx`
- Modify: `src/routes.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: read/Owner API Task 3.
- Produces: route `/marketing/content-radar`, source/candidate/run views, Owner actions.

- [ ] **Step 1: Tambahkan tipe/client API Content Radar**

Fungsi: `fetchRadarCandidates`, `fetchRadarSources`, `fetchRadarRuns`, `createRadarDraft`, `rejectRadarCandidate`, `updateRadarSource`.

- [ ] **Step 2: Buat dashboard states**

PageHead + ringkasan kandidat 24h, ≥75, Draft hari ini, unverified, collector/selector terakhir; filter niche/status/tier/min score/query.

- [ ] **Step 3: Buat kartu kandidat dan score breakdown**

Tampilkan provenance, source tier, alasan, cross-check, risk, dan aksi Owner. Semua link eksternal `rel="noreferrer"`.

- [ ] **Step 4: Buat registry dan run health**

Stale warning bila collector >4 jam. Loading/error/empty state eksplisit.

- [ ] **Step 5: Wire navigasi**

Tambahkan `Content Radar` ke `MODULE_TABS.marketing`, breadcrumb, import, dan route. Tetap di shell existing.

- [ ] **Step 6: Styling responsive/accessibility**

Keyboard focus terlihat, field berlabel, score bukan hanya warna, kartu mobile tanpa overflow, target sentuh ≥44px.

- [ ] **Step 7: Verifikasi browser lokal dan commit**

Viewport: 1440, 1024, 768, 390; zoom 200%; keyboard; empty/loading/error.

Commit: `feat(marketing): add Content Radar dashboard`

---

### Task 5: Import Draft Radar ke Carousel Studio

**Files:**
- Modify: `src/store/store.tsx`
- Modify: `src/pages/CarouselStudio.tsx`
- Modify: `src/lib/api.ts`
- Test: `src/lib/content-radar.test.ts`

**Interfaces:**
- Consumes: `radarDraftToSocialPost`, `GET drafts?unimported=true`, acknowledgement endpoint.
- Produces: `importRadarDrafts(drafts: RadarDraft[]): { imported: string[]; db: DB }` atau aksi Store ekuivalen.

- [ ] **Step 1: Tulis tes import idempotency RED**
  - Draft baru di-upsert satu kali.
  - Draft yang sama pada reload tidak diduplikasi.
  - Status selalu `Draft`.
  - Draft existing dengan edit manusia tidak ditimpa.
  - Acknowledgement hanya dilakukan untuk upsert sukses.

- [ ] **Step 2: Implementasikan import store minimal**

Gunakan `post_id` stabil; tulis audit `Mengimpor Draft Content Radar`.

- [ ] **Step 3: Hubungkan import pada pembukaan Carousel Studio**

Fetch, upsert, lalu ACK per Draft. Gagal satu Draft tidak meng-ACK Draft tersebut; tampilkan status jujur tanpa memblokir editor.

- [ ] **Step 4: Tampilkan provenance badge/link**

Draft Radar dapat kembali ke `/marketing/content-radar` dan source URL; jangan menambah jalur approval baru.

- [ ] **Step 5: Jalankan domain/store tests dan commit**

Run: `npx tsx --test src/lib/content-radar.test.ts src/lib/carousel-store.test.ts src/lib/carousel.test.ts`
Expected: PASS.

Commit: `feat(marketing): import Radar drafts into Carousel Studio`

---

### Task 6: Collector Python per 2 Jam

**Files:**
- Create: `scripts/content_radar_common.py`
- Create: `scripts/content_radar_collector.py`
- Create: `scripts/tests/test_content_radar.py`

**Interfaces:**
- Consumes: source registry API; RSS/Atom/http sources; internal ingest/run API.
- Produces: idempotent collector stdout (kosong saat sehat tanpa perubahan, ringkas saat ada error/material update).

- [ ] **Step 1: Tulis fake feed/API tests RED**

Cakup RSS + Atom, timeout satu source, content-type salah, response size cap, canonical URL, timestamp future, duplicate feed entries, dan per-source error isolation.

- [ ] **Step 2: Implementasikan common API client + lock**

Credential dari env/local protected config; tidak pernah dicetak. Timeout dan byte cap eksplisit.

- [ ] **Step 3: Implementasikan feed collector**

Jendela fetch 26 jam; simpan 24h semantics; domain baru `unverified`; tidak membuat Draft.

- [ ] **Step 4: Tambahkan optional discovery adapter**

Gunakan web discovery/Agent Reach hanya ketika dijalankan agent cron; raw evidence disimpan task-local sebelum summary. Collector script tetap berfungsi hanya dengan registry feeds.

- [ ] **Step 5: Jalankan tes GREEN dan commit**

Run: `python3 scripts/tests/test_content_radar.py -k collector`
Expected: PASS.

Commit: `feat(marketing): add Content Radar collector`

---

### Task 7: Selector Hermes, Draft Generator, dan Digest

**Files:**
- Create: `scripts/content_radar_selector.py`
- Modify: `scripts/tests/test_content_radar.py`
- Create: `scripts/content_radar_selector_prompt.md`

**Interfaces:**
- Consumes: candidates API, scoring domain contract, source provenance.
- Produces: score payload, Draft payload, selector run summary/digest.

- [ ] **Step 1: Tulis selector tests RED**

Cakup nilai diskret invalid, no-crosscheck, unverified source, max-one-crypto, kurang dari tiga Draft, partial retry, dan no-candidate digest.

- [ ] **Step 2: Implementasikan selector orchestration**

Fetch kandidat 24 jam, verifikasi provenance, berikan hanya pilihan nilai diskret pada Hermes, POST score, select, POST Draft.

- [ ] **Step 3: Implementasikan Draft validation**

4–8 slide, Bahasa Indonesia, dampak lokal, caption non-repetitif, source links, crypto disclaimer bila perlu; tidak menyertakan aset pihak ketiga sebagai media final.

- [ ] **Step 4: Implementasikan digest deterministic**

Output: waktu run, qualified count, 0–3 Draft (judul/niche/skor/sumber), rejected/duplicate count, production Content Radar URL. Tanpa credential/raw dump.

- [ ] **Step 5: Jalankan tes GREEN dan commit**

Run: `python3 scripts/tests/test_content_radar.py -k selector`
Expected: PASS.

Commit: `feat(marketing): add Radar selector and digest`

---

### Task 8: Cron Hermes, Production Verification, dan Review

**Files:**
- Runtime copy: `~/.hermes/scripts/content_radar_common.py`
- Runtime copy: `~/.hermes/scripts/content_radar_collector.py`
- Runtime copy: `~/.hermes/scripts/content_radar_selector.py`
- Modify: deployment state only after tests pass.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: two enabled cron jobs, deployed API/UI/migration, proof handles.

- [ ] **Step 1: Jalankan full local quality gate**

Run:
```bash
npx tsx --test src/lib/content-radar.test.ts src/lib/carousel-store.test.ts src/lib/carousel.test.ts worker/content-radar.test.ts
python3 scripts/tests/test_content_radar.py
python3 scripts/tests/test_carousel_export.py
python3 scripts/tests/test_tebar_mcp.py
npm run typecheck
npm run build
```
Expected: semua exit 0, failure 0.

- [ ] **Step 2: Review independen diff**

Fokus workspace IDOR, machine auth, SQL race, retry idempotency, unsafe HTML/URL, score reproducibility, browser import overwrite, dan cron secret leakage. Perbaiki seluruh Critical/Important lalu ulang gate.

- [ ] **Step 3: Apply migration remote dan read-back schema**

Verifikasi tabel/index/constraints dan `workspace_id` via query remote sebelum deploy.

- [ ] **Step 4: Deploy Worker/assets dan verify route**

Health 200; bundle memuat Content Radar; route production menampilkan login/shell tanpa JS error.

- [ ] **Step 5: Copy runtime scripts dan buat cron**

Collector: `0 */2 * * *`, `no_agent=true`, deliver failure ke `telegram:1794359422`.
Selector: `0 8 * * *` Asia/Jakarta, agent-enabled dengan prompt/skills, deliver digest + failure ke `telegram:1794359422`.
Selalu `cronjob_manage list` sebelum create/update; jangan membuat duplikat.

- [ ] **Step 6: Forced-run production collector**

Catat `run_id`, jumlah source/fetched/qualified, stale/error per source; read-back kandidat dari D1/API.

- [ ] **Step 7: Forced-run production selector/dry-run**

Catat `run_id`, Draft IDs/post IDs; verifikasi ≥75, cap crypto, provenance, dan status `Draft`.

- [ ] **Step 8: Browser import verification**

Login dengan vault/session yang tersedia; buka Carousel Studio; verifikasi Draft muncul satu kali; reload tidak duplikat; review/export tetap blocked sebelum approval.

- [ ] **Step 9: Telegram delivery verification**

Verifikasi digest masuk ke `telegram:1794359422` dan catat message handle dari cron delivery; jangan mengklaim sukses dari stdout saja.

- [ ] **Step 10: Final production gate dan commit**

Read-back cron enabled/next run/last status; production health; latest run; D1 Draft; git status clean.

Commit: `feat(marketing): ship Content Radar automation`

---

## Self-Review

- **Spec coverage:** registry, scoring, dashboard, provenance, collector, selector, Draft import, cron, Telegram, workspace isolation, approval gate, and production verification masing-masing memiliki task.
- **Step scan:** setiap task memiliki RED→implement→GREEN→commit; tidak ada dependency tersembunyi selain Interfaces.
- **Type consistency:** domain Task 1 menjadi kontrak Worker, UI, dan importer; field mengikuti spec (`workspace_id`, `rubric_version`, snapshots, provenance rows).
- **Review Focus coverage:** IDOR (Task 3), partial retry (Task 3/7), timestamp invalid (Task 1/6), unverified discovery (Task 1/7), browser ACK ordering (Task 5).
- **Proportion:** detail implementasi body diserahkan ke executor; plan mengunci signature, nilai, test, dan urutan yang tidak boleh ditebak.
