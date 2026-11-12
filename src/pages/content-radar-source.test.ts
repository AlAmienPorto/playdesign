// @ts-nocheck - dijalankan oleh Node/tsx, bukan build Vite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('Content Radar terdaftar sebagai subhalaman Marketing dengan route dan breadcrumb', async () => {
  const [routes, app] = await Promise.all([read('src/routes.ts'), read('src/App.tsx')]);

  assert.match(routes, /Content Radar/);
  assert.match(routes, /\/marketing\/content-radar/);
  assert.match(app, /ContentRadarPage/);
  assert.match(app, /path="\/marketing\/content-radar"/);
});

test('dashboard memberi label filter dan menjaga seluruh link sumber sebagai noreferrer', async () => {
  const page = await read('src/pages/ContentRadar.tsx');

  for (const label of ['Cari kandidat', 'Niche', 'Status', 'Tier sumber', 'Skor minimum']) {
    assert.match(page, new RegExp(label));
  }
  assert.doesNotMatch(page, /target="_blank"(?![^>]*rel="noreferrer")/g);
  assert.match(page, /rel="noreferrer"/);
});

test('dashboard punya state loading, error, first-run, dan filtered-empty yang berbeda', async () => {
  const page = await read('src/pages/ContentRadar.tsx');

  assert.match(page, /Memuat kandidat dan kesehatan collector/);
  assert.match(page, /Content Radar tidak dapat dimuat/);
  assert.match(page, /Radar belum menerima kandidat/);
  assert.match(page, /Tidak ada kandidat yang cocok/);
  assert.match(page, /Coba lagi/);
  assert.match(page, /Reset filter/);
});

test('aksi Owner memakai actor dari store/API, bukan literal fallback', async () => {
  const page = await read('src/pages/ContentRadar.tsx');

  assert.match(page, /actor\.id/);
  assert.doesNotMatch(page, /actorId:\s*['"]ja['"]/);
  assert.doesNotMatch(page, /x-actor-id/);
});

test('filter setelah initial load tidak mengganti seluruh dashboard dengan loading state', async () => {
  const page = await read('src/pages/ContentRadar.tsx');

  assert.match(page, /if \(!initializedRef\.current\) setLoading\(true\)/);
  assert.match(page, /requestId !== requestRef\.current/);
});

test('kontrol interaktif Radar memiliki target sentuh minimum 44px', async () => {
  const styles = await read('src/styles.css');

  assert.match(styles, /\.content-radar-page \.page-head \.btn[\s\S]*?min-height:\s*44px/);
  assert.match(styles, /\.content-radar-page \.tab[\s\S]*?min-height:\s*44px/);
  assert.match(styles, /\.radar-filter-grid \.search-field[\s\S]*?min-height:\s*44px/);
  assert.match(styles, /\.radar-filter-grid \.select-box select,[\s\S]*?min-height:\s*44px/);
});

test('teks muted Radar memakai warna AA dan registry menjaga urutan promosi sumber', async () => {
  const [styles, page] = await Promise.all([read('src/styles.css'), read('src/pages/ContentRadar.tsx')]);

  assert.match(styles, /\.content-radar-page\s*{[\s\S]*?--muted:\s*var\(--ink-2\)/);
  assert.match(page, /disabled={source\.kind === 'discovered' && tier !== 'unverified'}/);
  assert.match(page, /disabled={source\.tier !== 'unverified' && kind === 'discovered'}/);
});

test('breakdown skor memakai maksimum rubrik v1 yang berjumlah 100', async () => {
  const page = await read('src/pages/ContentRadar.tsx');

  const maxima = Array.from(page.matchAll(/label: '[^']+', max: (\d+)/g), (match) => Number(match[1]));
  assert.deepEqual(maxima, [30, 25, 15, 15, 10, 5]);
  assert.equal(maxima.reduce((total, value) => total + value, 0), 100);
});

test('setDetail mempertahankan sources provenance saat kandidat dimuat ulang', async () => {
  const page = await read('src/pages/ContentRadar.tsx');

  assert.match(page, /sources:\s*current\.sources/);
});

test('pencarian kandidat di-debounce dan memisahkan fetch kandidat dari metadata statis', async () => {
  const page = await read('src/pages/ContentRadar.tsx');

  assert.match(page, /debouncedQuery/);
  assert.match(page, /setTimeout\([\s\S]*?300\)/);
  assert.match(page, /const loadCandidates = useCallback/);
  // Pastikan loadCandidates hanya memanggil fetchRadarCandidates, tidak fetchOffice / fetchRadarSources / runs / drafts
  const loadCandidatesBody = page.slice(page.indexOf('const loadCandidates = useCallback'), page.indexOf('const load = useCallback'));
  assert.match(loadCandidatesBody, /fetchRadarCandidates/);
  assert.doesNotMatch(loadCandidatesBody, /fetchOffice/);
  assert.doesNotMatch(loadCandidatesBody, /fetchRadarSources/);
  assert.doesNotMatch(loadCandidatesBody, /fetchRadarRuns/);
  assert.doesNotMatch(loadCandidatesBody, /fetchRadarDrafts/);
});

test('aksi draft dan pilihan niche mendeteksi status drafted walau draftId kosong', async () => {
  const page = await read('src/pages/ContentRadar.tsx');

  assert.match(page, /candidate\.status === 'drafted'/);
  assert.match(page, /isDrafted/);
});

test('styles.css tidak memiliki konflik min-height 36px pada aksi kandidat', async () => {
  const styles = await read('src/styles.css');

  assert.doesNotMatch(styles, /\.radar-candidate-actions \.btn[\s\S]*?min-height:\s*36px/);
});

test('dateTime menjaga parsing aman dari RangeError nilai tanggal tidak valid', async () => {
  const page = await read('src/pages/ContentRadar.tsx');

  assert.match(page, /Number\.isFinite\(Date\.parse\(value\)\)/);
});
