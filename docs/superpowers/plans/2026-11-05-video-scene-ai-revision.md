# Video Scene AI Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan revisi natural-language untuk satu scene melalui Workers AI serta kontrak adapter footage generatif yang jujur dan nonaktif secara default.

**Architecture:** `VideoComposer` mengirim scene terpilih dan instruksi ke endpoint Worker baru. Worker memanggil Workers AI, mengekstrak JSON, lalu sanitizer mencegah AI mengubah identitas/media reference scene. Konfigurasi generation ditambahkan ke VideoSpec bersama dan dicerminkan di normalizer Python agar preview dan render tetap memakai objek yang sama.

**Tech Stack:** React 18, TypeScript 5.6, Cloudflare Workers AI, Cloudflare Worker, D1 auth existing, Python 3 runner, Remotion 4.0.540.

**Spec:** `docs/superpowers/specs/2026-11-05-video-scene-ai-revision-design.md`

## Global Constraints

- Reuse UI, Worker, VideoSpec, project Remotion, runner, URL, dan port existing.
- Tidak ada byte media di Worker/D1; upload Drive tetap opsional.
- AI hanya boleh merevisi satu scene; scene lain, scene `id`, dan `media.refId` tetap.
- Provider footage default `none`, `enabled=false`; jangan menghasilkan footage palsu.
- Pesan UI/API Bahasa Indonesia.
- Perubahan minimal dan mengikuti struktur file existing.

## Review Focus

- Output AI fenced atau memiliki teks pengantar tetap dapat diambil hanya jika mengandung satu objek JSON valid.
- AI yang mencoba mengganti `id` atau `media.refId` tidak boleh berhasil.
- Enum/durasi invalid harus dinormalisasi, bukan merusak spec.
- Kegagalan AI tidak mengubah state scene di browser.
- Spec eksternal dengan generation aktif tetapi provider `none` ditolak runner dengan pesan jelas.

---

### Task 1: Sanitizer revisi scene dan kontrak VideoSpec

**Files:**
- Create: `worker/video-scene-revision.ts`
- Create: `worker/video-scene-revision.test.ts`
- Modify: `src/lib/video-spec.ts`
- Modify: `scripts/video_spec.py`
- Modify: `~/work/remotion-starter/src/spec-types.ts`

**Interfaces:**
- Produces: `extractSceneRevision(text: string): unknown`
- Produces: `sanitizeSceneRevision(current: VideoScene, candidate: unknown): VideoScene`
- Produces: `VideoSpec.generation: VideoGeneration`

- [ ] **Step 1: Write failing tests for extraction and allowlist**

Tests assert pure/fenced JSON extraction, malformed response rejection, preserved `id`/`media.refId`, clamped duration, valid enums, and string/list length limits.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx tsx --test worker/video-scene-revision.test.ts`
Expected: FAIL because module/functions do not exist. Install no runtime dependency; use a temporary `npx tsx` runner only if available, otherwise compile the test with a focused temporary tsconfig.

- [ ] **Step 3: Implement parser and sanitizer**

`extractSceneRevision()` accepts pure object JSON or one fenced `json` block. `sanitizeSceneRevision()` calls shared scene normalization rules, forces current `id`, retains current `media.refId`, and only admits `kind`, `durationSec`, `title`, `body`, `items`, `transitionIn`, `media.fit`, and `media.motion`.

- [ ] **Step 4: Add `VideoGeneration` to all three normalizers**

Default: `{provider:'none', enabled:false, mode:'text-to-video'}`. Allowed provider includes `replicate` for forward compatibility; model max 200 chars.

- [ ] **Step 5: Run focused tests and type checks**

Run: `npx tsx --test worker/video-scene-revision.test.ts && npx tsc -p tsconfig.worker.json --noEmit && python3 -m py_compile scripts/video_spec.py`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add worker/video-scene-revision.ts worker/video-scene-revision.test.ts src/lib/video-spec.ts scripts/video_spec.py
git commit -m "feat(video): add scene revision sanitizer and generation contract"
```

### Task 2: Workers AI revision endpoint

**Files:**
- Modify: `worker/index.ts`
- Test: `worker/video-scene-revision.test.ts`

**Interfaces:**
- Consumes: `sanitizeSceneRevision(current, candidate)` from Task 1.
- Produces: `POST /api/video/scenes/revise` response `{scene, model}`.

- [ ] **Step 1: Add tests for request validation helpers**

Assert instruction length 3–600 and sanitized context limits. AI integration itself is verified by production call, not mocked as a fake success.

- [ ] **Step 2: Implement authenticated route and handler**

Authenticate with existing workspace mechanism. Build a strict Indonesian system prompt requesting one JSON object. Call 70B with temperature 0.2/max_tokens 500, then fallback to 8B. Parse and sanitize response; return 502 on unusable output and 503 when both models fail.

- [ ] **Step 3: Typecheck Worker**

Run: `npx tsc -p tsconfig.worker.json --noEmit`
Expected: exit 0.

- [ ] **Step 4: Deploy and verify production endpoint with a real AI call**

Run authenticated POST against `https://kantor.playdesign.my.id/api/video/scenes/revise`. Assert response HTTP 200, changed title/body as instructed, unchanged `id`, unchanged `media.refId`, and `model` non-empty.

- [ ] **Step 5: Commit**

```bash
git add worker/index.ts worker/video-scene-revision.test.ts
git commit -m "feat(video): add Workers AI scene revision endpoint"
```

### Task 3: Scene revision UI and provider status

**Files:**
- Modify: `src/lib/api.ts`
- Modify: `src/components/VideoComposer.tsx`
- Modify: `src/pages/VideoStudio.css`

**Interfaces:**
- Consumes: `POST /api/video/scenes/revise` from Task 2.
- Produces: `reviseVideoScene(input): Promise<VideoScene>` API client.

- [ ] **Step 1: Add API client**

Implement `reviseVideoScene({scene,instruction,prompt,style,sceneIndex,sceneCount})`. Preserve server errors through existing `request()` behavior.

- [ ] **Step 2: Add per-scene revision state and controls**

Keep instructions in `Record<string,string>`, busy scene ID in local state, and call API only after trimmed instruction passes. Replace only target array entry returned by server.

- [ ] **Step 3: Add honest footage-provider status**

Within existing brief/scene UI, show `Footage generatif belum tersambung` when provider is `none`; no active generation button. Do not create a tab/page.

- [ ] **Step 4: Add responsive styling**

Use existing `.scene-card`, `.studio-actions`, input, button, and muted text conventions. At 320 px, textarea and button must not overflow.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: TypeScript and Vite exit 0.

- [ ] **Step 6: Browser verification**

At production `#/marketing/video`, enter an instruction for scene 1, click revision, assert only scene 1 values changed and preview DOM/player remains mounted. Verify status text exists and no enabled footage-generation control exists. Recheck width 320 px with zero horizontal overflow.

- [ ] **Step 7: Commit**

```bash
git add src/lib/api.ts src/components/VideoComposer.tsx src/pages/VideoStudio.css
git commit -m "feat(video): revise individual scenes with AI"
```

### Task 4: Runner guard, documentation, and end-to-end render

**Files:**
- Modify: `scripts/video_render_runner.py`
- Modify: `docs/video-spec.md`
- Modify: `docs/video-studio-spec.md`
- Modify: `~/.hermes/scripts/video_render_runner.py`

**Interfaces:**
- Consumes: `VideoSpec.generation` from Task 1.
- Produces: explicit failure if footage generation is requested without configured provider.

- [ ] **Step 1: Add runner guard test/probe**

Call the guard with `{provider:'none',enabled:true}` and assert it raises `Provider footage generatif belum dikonfigurasi.`; disabled generation passes.

- [ ] **Step 2: Implement minimal guard before asset preparation**

Do not add a fake provider or placeholder footage. Normal revision/render jobs continue unchanged.

- [ ] **Step 3: Update docs to reflect implemented state**

Document endpoint, per-scene invariants, Workers AI models/fallback, generation adapter status, and remove stale claims that Reference Manager/revision do not exist.

- [ ] **Step 4: Sync operational runner and full build**

Run: `cp scripts/video_render_runner.py ~/.hermes/scripts/video_render_runner.py && npm run build && npx tsc -p tsconfig.worker.json --noEmit`
Expected: all exit 0.

- [ ] **Step 5: End-to-end render**

From the AI-revised spec, create a job with `render.upload=false`, run `scripts/video_render_runner.py`, verify D1 status `done`, H.264 + AAC, expected dimensions/duration, and inspect a middle frame visually for revised text.

- [ ] **Step 6: Verify deployment and repository**

Run Worker deploy, record Version ID, run `git status --short`, and ensure only intentional documentation/plan files remain or all are committed.

- [ ] **Step 7: Commit**

```bash
git add scripts/video_render_runner.py docs/video-spec.md docs/video-studio-spec.md docs/superpowers/specs/2026-11-05-video-scene-ai-revision-design.md docs/superpowers/plans/2026-11-05-video-scene-ai-revision.md
git commit -m "docs(video): document AI scene revision pipeline"
```
