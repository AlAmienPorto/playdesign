// @ts-nocheck - dijalankan oleh Node/tsx, bukan build Vite.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRadarDraft,
  fetchRadarCandidates,
  fetchRadarRuns,
  rejectRadarCandidate,
  reclassifyRadarCandidate,
  updateRadarSource,
} from './api';
import {
  buildRadarSummary,
  classifyRadarEmptyState,
  isRadarRunStale,
} from './content-radar-dashboard';

const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

function stubFetch(body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return response(body);
  };
  return calls;
}

test('fetchRadarCandidates menyerialkan seluruh filter dan workspace', async () => {
  const calls = stubFetch({ candidates: [{ id: 'candidate-1' }], pagination: { count: 1 } });

  const result = await fetchRadarCandidates({
    workspaceId: 'studio satu',
    niche: 'design',
    status: 'qualified',
    tier: 'B',
    minScore: 75,
    query: 'aksesibilitas warna',
    windowHours: 24,
    limit: 25,
  });

  assert.deepEqual(result.map((candidate) => candidate.id), ['candidate-1']);
  const url = new URL(calls[0].url, 'https://office.test');
  assert.equal(url.pathname, '/api/content-radar/candidates');
  assert.equal(url.searchParams.get('workspace'), 'studio satu');
  assert.equal(url.searchParams.get('niche'), 'design');
  assert.equal(url.searchParams.get('status'), 'qualified');
  assert.equal(url.searchParams.get('tier'), 'B');
  assert.equal(url.searchParams.get('minScore'), '75');
  assert.equal(url.searchParams.get('query'), 'aksesibilitas warna');
  assert.equal(url.searchParams.get('window'), '24');
  assert.equal(url.searchParams.get('limit'), '25');
});

test('fetchRadarRuns membuka array runs dari response API', async () => {
  stubFetch({ runs: [{ id: 'run-1', kind: 'collector' }], pagination: { count: 1 } });

  const runs = await fetchRadarRuns({ workspaceId: 'playdesign', limit: 10 });

  assert.equal(runs.length, 1);
  assert.equal(runs[0].id, 'run-1');
});

test('semua mutasi Owner mengirim actor autentik secara eksplisit', async () => {
  const calls = stubFetch({ ok: true, candidate: { id: 'candidate-1' }, source: { id: 'source-1' }, draft: { id: 'draft-1' } });
  const owner = { workspaceId: 'playdesign', actorId: 'owner-from-office' };

  await createRadarDraft('candidate-1', owner);
  await rejectRadarCandidate('candidate-1', { ...owner, reason: 'Tidak relevan' });
  await reclassifyRadarCandidate('candidate-1', { ...owner, niche: 'security' });
  await updateRadarSource('source-1', { ...owner, tier: 'B', kind: 'media', enabled: true });

  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(new Headers(call.init.headers).get('x-actor-id'), 'owner-from-office');
    assert.equal(JSON.parse(String(call.init.body)).workspaceId, 'playdesign');
  }
});

test('mutasi Owner menolak actor kosong sebelum request', async () => {
  const calls = stubFetch({ ok: true });

  await assert.rejects(
    () => createRadarDraft('candidate-1', { workspaceId: 'playdesign', actorId: '' }),
    /actor autentik/i,
  );
  assert.equal(calls.length, 0);
});

test('ringkasan Radar memakai data API tanpa membuat metrik baru', () => {
  const now = '2026-11-08T10:00:00.000Z';
  const summary = buildRadarSummary({
    candidates: [
      { score: { total: 88 }, publishedAt: '2026-11-08T08:00:00.000Z' },
      { score: { total: 60 }, publishedAt: null, discoveredAt: '2026-11-08T07:00:00.000Z' },
    ],
    sources: [{ tier: 'unverified' }, { tier: 'A' }],
    drafts: [
      { createdAt: '2026-11-08T01:00:00.000Z' },
      { createdAt: '2026-11-07T01:00:00.000Z' },
    ],
    now,
  });

  assert.deepEqual(summary, {
    candidates24h: 2,
    score75Plus: 1,
    draftsTodayWib: 1,
    unverifiedSources: 1,
  });
});

test('collector dianggap stale hanya setelah lewat empat jam', () => {
  const now = '2026-11-08T10:00:00.000Z';

  assert.equal(isRadarRunStale({ heartbeatAt: '2026-11-08T06:00:00.000Z', createdAt: '2026-11-08T06:00:00.000Z' }, now), false);
  assert.equal(isRadarRunStale({ heartbeatAt: '2026-11-08T05:59:59.000Z', createdAt: '2026-11-08T05:59:59.000Z' }, now), true);
});

test('empty state membedakan first-run, filter kosong, dan window sepi', () => {
  assert.equal(classifyRadarEmptyState({ candidates: [], sources: [], runs: [], drafts: [], hasFilters: false }), 'first-run');
  assert.equal(classifyRadarEmptyState({ candidates: [], sources: [{ id: 's' }], runs: [], drafts: [], hasFilters: true }), 'filtered');
  assert.equal(classifyRadarEmptyState({ candidates: [], sources: [{ id: 's' }], runs: [], drafts: [], hasFilters: false }), 'quiet');
});
