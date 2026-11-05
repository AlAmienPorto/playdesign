# Review Fase 3A — Revisi AI per Scene

**Scope:** `a74aa0e..HEAD` (`eaf8a9c`), 5 commit, 16 file, +1032/−26 — sesuai ruling ledger SDD (bukan `main..HEAD` yang memuat Fase 1–2).
**Spec/plan:** `docs/superpowers/specs/2026-11-05-video-scene-ai-revision-design.md`, `docs/superpowers/plans/2026-11-05-video-scene-ai-revision.md`.
**Verdict:** arsitektur dan pembatasannya benar (sanitizer memaksa `id` + `media.refId`, guard provider jujur, kegagalan AI tidak menyentuh state). **Belum layak merge** karena satu item Review Focus eksplisit belum terpenuhi dan ada satu jalur kehilangan edit di UI.

---

## P1 — harus diperbaiki

### 1. Teks pengantar sebelum fenced JSON membuat revisi gagal 502
`worker/video-scene-revision.ts:75-91`

Regex fence berjangkar di awal dan akhir string:

```ts
const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
```

Model yang membalas `Berikut revisinya:\n```json\n{...}\n```` tidak cocok, `source` tetap seluruh teks, `JSON.parse` melempar, endpoint balas `502 invalid_ai_response`. Ini persis butir pertama **Review Focus**: *"Output AI fenced atau memiliki teks pengantar tetap dapat diambil hanya jika mengandung satu objek JSON valid."* Fenced-murni lolos, teks-pengantar tidak.

Test `worker/video-scene-revision.test.ts:28` hanya menguji fenced murni, jadi regresi ini tidak tertangkap.

**Saran:** ambil blok fence di mana pun posisinya (`/```(?:json)?\s*([\s\S]*?)```/i` tanpa jangkar), lalu fallback ke objek JSON pertama yang seimbang (`indexOf('{')` … pencocokan kurawal). Tambah test "teks pengantar + fenced" dan "teks pengantar + JSON mentah".

### 2. Snapshot `spec` basi menimpa edit lain selama request berjalan
`src/components/VideoComposer.tsx:105`

```ts
const next = await reviseVideoScene({ scene, ... });
patch({ scenes: replaceScene(spec.scenes, scene.id, next) });
```

`spec.scenes` diambil dari closure saat klik. Selama panggilan AI (detik), user masih bisa mengedit scene lain, menambah/menghapus scene, atau mengubah judul; hasil `patch` kemudian menulis ulang array lama sehingga semua perubahan itu hilang tanpa peringatan. `patch()` sendiri sudah memakai `setSpec(current => …)`, jadi tinggal pakai bentuk fungsional:

```ts
setSpec((current) => ({
  ...current,
  scenes: replaceScene(current.scenes, scene.id, next),
}));
```

(Ini juga menghindari `normalizeSpec` penuh yang tidak perlu untuk satu scene.)

---

## P2 — sebaiknya diperbaiki

### 3. `sceneRevisionChanged` tidak dipakai produksi → "sukses palsu"
`worker/video-scene-revision.ts:121-134` hanya diimpor oleh test. Komentarnya mengklaim *"Dipakai untuk menolak 'sukses palsu'"*, padahal `reviseVideoScene` tidak pernah memanggilnya. Jika model mengembalikan `{}` atau scene identik, sanitizer mengisi semua field dari `current` → HTTP 200 + toast "Scene N direvisi. Scene lain tidak berubah." untuk scene yang tidak berubah. Pilih satu: pakai helper (mis. `409 scene_unchanged` / field `changed:false` + pesan UI berbeda) atau hapus helper dan komentarnya.

### 4. Scene tanpa media mendapat objek `media` kosong setelah revisi
`worker/video-scene-revision.ts:107-111` selalu mengirim `media: {refId, fit, motion}`; di `src/lib/video-spec.ts:282` `hasMedia = !!fallback.media || Object.keys(mediaRaw).length > 0` menjadi `true` karena ketiga kunci ada (walau `undefined`). Hasilnya scene teks-murni berubah menjadi `media: { refId: undefined, fit: 'cover', motion: 'none' }`. Selain melanggar semangat "AI hanya boleh mengubah `fit` dan `motion`", renderer/preview yang bercabang pada keberadaan `scene.media` bisa memperlakukan scene itu sebagai scene bermedia. **Saran:** sertakan `media` hanya bila `current.media` ada (`...(current.media ? { media: {...} } : {})`).

### 5. Deviasi kontrak: `mode` dipersempit ke satu literal
Design menetapkan `mode: 'text-to-video' | 'image-to-video'`; implementasi menulis `mode: 'text-to-video'` (`src/lib/video-spec.ts:109`) dan mengeraskannya di `normalizeSpec` serta `scripts/video_spec.py:165`. Spec eksternal dengan `image-to-video` akan dibisukan jadi `text-to-video` tanpa jejak. Sah untuk fase ini (mode belum dipakai), tetapi tipe sebaiknya tetap memuat kedua nilai agar normalisasi tidak menghapus informasi saat provider `replicate` disambungkan.

### 6. Tidak ada pembatas kuota pada endpoint AI
`POST /api/video/scenes/revise` hanya dibatasi autentikasi + panjang instruksi; satu sesi valid bisa memicu panggilan 70B berulang tanpa batas (biaya neuron). Minimal: catat di docs sebagai risiko yang diterima, atau batasi per workspace (mis. 20 revisi/menit) memakai pola rate-limit yang sudah ada.

---

## P3 — catatan kecil

- `src/components/VideoComposer.tsx:580` — textarea hanya punya `placeholder`, tanpa `<label>`/`aria-label`; pembaca layar tidak tahu konteks field.
- Respons memuat `model` tapi klien membuangnya (`src/lib/api.ts:421`) — tidak salah, tapi hilang kesempatan menampilkan model yang dipakai saat fallback 8B.
- `scripts/video_render_runner.py:500` — guard dipanggil setelah job di-`PATCH` ke `rendering`; aman karena kegagalan masuk jalur `failed`, tapi menempatkannya sebelum PATCH membuat status job lebih bersih.
- Test `validateSceneRevisionInput` belum menutup kasus `scene.items` bukan array dan `context` berbentuk array (keduanya sudah ditangani kode, hanya belum dikunci test).

---

## Yang sudah benar (jangan diubah saat memperbaiki)

- `fail()` bertipe `never` dan melempar `ApiError` (`worker/index.ts:58`), jadi tidak ada fallthrough setelah `fail(400, …)` di `reviseVideoScene` — pola aman.
- Sanitizer memaksa `id` dan `media.refId` dari scene lama; allowlist field sesuai design; enum/durasi/panjang teks dinormalisasi lewat `normalizeScene` bersama, bukan salinan kedua.
- UI: instruksi hidup di state lokal (bukan VideoSpec/D1), `revisingId` mencegah revisi paralel, scene lama utuh saat gagal, toast menyebut nomor scene.
- `assert_generation_supported` + test-nya menegakkan "tidak ada klip palsu", dan `normalize()` Python mempertahankan `generation` sehingga preview dan render melihat objek yang sama.
- Pesan UI/API berbahasa Indonesia dan manusiawi, termasuk `502 invalid_ai_response` yang eksplisit menyebut scene lama tidak diubah.

---

## Urutan perbaikan yang disarankan

1. Parser fence/pengantar (P1.1) + 2 test baru.
2. `setSpec` fungsional di `reviseScene` (P1.2).
3. Putuskan nasib `sceneRevisionChanged` (P2.3) dan `media` opsional (P2.4).
4. Jalankan ulang gate: `npx tsx --test worker/video-scene-revision.test.ts src/lib/video-spec.test.ts src/lib/api.test.ts && npx tsc -p tsconfig.worker.json --noEmit && npm run build && python3 -m unittest discover -s scripts/tests -p 'test_*.py'`.