import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalizeRadarUrl,
  computeRadarScore,
  getRadarAdmission,
  isAutoDraftEligible,
  radarDraftToSocialPost,
  selectDailyDrafts,
  type RadarCandidate,
  type RadarDraft,
  type RadarScoreInput,
} from './content-radar';

const timestampInput = (overrides: Partial<RadarScoreInput> = {}): RadarScoreInput => ({
  rubricVersion: 'v1',
  asOf: '2026-11-08T08:00:00.000Z',
  sourceTier: 'A',
  sourceIsPrimary: true,
  publishedAt: '2026-11-08T04:00:00.000Z',
  discoveredAt: '2026-11-08T04:30:00.000Z',
  independentCrossChecks: [],
  relevance: 21,
  carouselPotential: 8,
  riskFlags: [],
  ...overrides,
});

const candidateFromInput = (input: RadarScoreInput): RadarCandidate => ({
  id: 'candidate-time',
  clusterKey: 'cluster-time',
  canonicalUrl: 'https://example.com/news',
  title: 'Berita teruji',
  summary: 'Ringkasan sumber.',
  publishedAt: input.publishedAt,
  discoveredAt: input.discoveredAt,
  niche: 'technology',
  sourceDomain: 'example.com',
  sourceTier: input.sourceTier,
  status: 'qualified',
  score: computeRadarScore(input),
});

test('canonicalizeRadarUrl membuang tracking, fragment, port default, dan trailing slash', () => {
  assert.equal(
    canonicalizeRadarUrl(
      'HTTPS://Example.COM:443/news/?utm_source=x&b=2&fbclid=abc&a=1#bagian',
    ),
    'https://example.com/news?a=1&b=2',
  );
  assert.equal(canonicalizeRadarUrl('http://EXAMPLE.com:80/'), 'http://example.com');
});

test('canonicalizeRadarUrl menolak scheme selain HTTP dan HTTPS', () => {
  assert.throws(() => canonicalizeRadarUrl('javascript:alert(1)'), /HTTP\/HTTPS/);
  assert.throws(() => canonicalizeRadarUrl('ftp://example.com/file'), /HTTP\/HTTPS/);
});

test('canonicalizeRadarUrl mengurutkan query dengan urutan code-unit', () => {
  assert.equal(
    canonicalizeRadarUrl('https://example.com/?ä=1&a=3&Z=2&A=4&q=ä&q=a&q=Z&q=A'),
    'https://example.com/?A=4&Z=2&a=3&q=A&q=Z&q=a&q=%C3%A4&%C3%A4=1',
  );
});

test('publishedAt masa depan membuat kandidat tidak eligible', () => {
  const candidate = candidateFromInput(
    timestampInput({ publishedAt: '2026-11-08T08:00:00.001Z' }),
  );

  assert.equal(candidate.score.inputSnapshot.timestampValid, false);
  assert.equal(isAutoDraftEligible(candidate).eligible, false);
  assert.ok(isAutoDraftEligible(candidate).reasons.includes('future_timestamp'));
});

test('publishedAt kosong memakai discoveredAt dan menandai timestamp fallback', () => {
  const score = computeRadarScore(timestampInput({ publishedAt: null }));

  assert.equal(score.inputSnapshot.effectiveTimestamp, '2026-11-08T04:30:00.000Z');
  assert.equal(score.inputSnapshot.timestampFallback, true);
  assert.equal(score.inputSnapshot.timestampValid, true);
});

test('timestamp wajib ISO-8601 dengan offset dan setiap field divalidasi sendiri', () => {
  assert.throws(
    () => computeRadarScore(timestampInput({ asOf: '2026-11-08 08:00:00' })),
    /Invalid asOf timestamp format/,
  );
  assert.throws(
    () => computeRadarScore(timestampInput({ publishedAt: '2026-11-08T04:00:00' })),
    /Invalid publishedAt timestamp format/,
  );
  assert.throws(
    () => computeRadarScore(timestampInput({ publishedAt: '' })),
    /Invalid publishedAt timestamp format/,
  );
  assert.throws(
    () => computeRadarScore(timestampInput({ discoveredAt: 'not-a-date' })),
    /Invalid discoveredAt timestamp format/,
  );
  assert.throws(
    () => computeRadarScore(timestampInput({ discoveredAt: '2026-02-30T04:30:00Z' })),
    /Invalid discoveredAt timestamp format/,
  );
});

test('snapshot menormalisasi timestamp offset untuk replay deterministik', () => {
  const score = computeRadarScore(
    timestampInput({
      asOf: '2026-11-08T15:00:00+07:00',
      publishedAt: '2026-11-08T11:00:00+07:00',
      discoveredAt: '2026-11-08T11:30:00+07:00',
    }),
  );

  assert.equal(score.inputSnapshot.asOf, '2026-11-08T08:00:00.000Z');
  assert.equal(score.inputSnapshot.publishedAt, '2026-11-08T04:00:00.000Z');
  assert.equal(score.inputSnapshot.discoveredAt, '2026-11-08T04:30:00.000Z');
  assert.equal(score.inputSnapshot.effectiveTimestamp, '2026-11-08T04:00:00.000Z');
});

test('discoveredAt masa depan ditolak walau publishedAt valid', () => {
  const candidate = candidateFromInput(
    timestampInput({ discoveredAt: '2026-11-08T08:00:00.001Z' }),
  );
  const eligibility = isAutoDraftEligible(candidate);

  assert.equal(candidate.score.inputSnapshot.timestampValid, false);
  assert.equal(eligibility.eligible, false);
  assert.ok(eligibility.reasons.includes('future_timestamp'));
});

test('rubrik v1 memetakan komponen faktual ke nilai tetap dan menyimpan snapshot replayable', () => {
  const input = timestampInput({
    sourceTier: 'B',
    sourceIsPrimary: true,
    publishedAt: '2026-11-07T23:00:00.000Z',
    independentCrossChecks: [{ domain: 'confirm.example', tier: 'C' }],
    relevance: 18,
    carouselPotential: 8,
    riskFlags: ['disclaimer_required'],
  });

  const score = computeRadarScore(input);

  assert.deepEqual(score.components, {
    credibility: 26,
    relevance: 18,
    freshness: 11,
    evidence: 15,
    carouselPotential: 8,
    safety: 3,
  });
  assert.equal(score.total, 81);
  assert.equal(score.rubricVersion, 'v1');
  assert.deepEqual(score.inputSnapshot.independentCrossChecks, [
    { domain: 'confirm.example', tier: 'C' },
  ]);
  assert.equal(computeRadarScore(score.inputSnapshot).total, 81);
});

test('rubrik v1 memetakan tier, umur, evidence, dan safety pada boundary', () => {
  const cases: Array<{
    input: Partial<RadarScoreInput>;
    expected: Partial<ReturnType<typeof computeRadarScore>['components']>;
  }> = [
    { input: { sourceTier: 'A' }, expected: { credibility: 30 } },
    { input: { sourceTier: 'B' }, expected: { credibility: 26 } },
    { input: { sourceTier: 'C' }, expected: { credibility: 20 } },
    { input: { sourceTier: 'D' }, expected: { credibility: 10 } },
    { input: { sourceTier: 'unverified' }, expected: { credibility: 5 } },
    { input: { publishedAt: '2026-11-08T02:00:00.000Z' }, expected: { freshness: 15 } },
    { input: { publishedAt: '2026-11-07T20:00:00.000Z' }, expected: { freshness: 11 } },
    { input: { publishedAt: '2026-11-07T08:00:00.000Z' }, expected: { freshness: 7 } },
    { input: { publishedAt: '2026-11-07T07:59:59.999Z' }, expected: { freshness: 0 } },
    {
      input: {
        sourceIsPrimary: true,
        independentCrossChecks: [{ domain: 'b.example', tier: 'B' }],
      },
      expected: { evidence: 15 },
    },
    { input: { sourceIsPrimary: true }, expected: { evidence: 11 } },
    {
      input: {
        sourceIsPrimary: false,
        independentCrossChecks: [
          { domain: 'b.example', tier: 'B' },
          { domain: 'c.example', tier: 'C' },
        ],
      },
      expected: { evidence: 11 },
    },
    {
      input: {
        sourceTier: 'D',
        sourceIsPrimary: false,
        independentCrossChecks: [{ domain: 'b.example', tier: 'B' }],
      },
      expected: { evidence: 6 },
    },
    {
      input: { sourceTier: 'D', sourceIsPrimary: false },
      expected: { evidence: 2 },
    },
    { input: { riskFlags: [] }, expected: { safety: 5 } },
    { input: { riskFlags: ['context_required'] }, expected: { safety: 3 } },
    { input: { riskFlags: ['rumor'] }, expected: { safety: 0 } },
  ];

  for (const { input, expected } of cases) {
    const components = computeRadarScore(timestampInput(input)).components;
    for (const [component, value] of Object.entries(expected)) {
      assert.equal(components[component as keyof typeof components], value);
    }
  }
});

test('computeRadarScore menolak nilai di luar pilihan diskret', () => {
  assert.throws(
    () => computeRadarScore(timestampInput({ relevance: 17 as RadarScoreInput['relevance'] })),
    /relevance/,
  );
  assert.throws(
    () =>
      computeRadarScore(
        timestampInput({ carouselPotential: 7 as RadarScoreInput['carouselPotential'] }),
      ),
    /carousel potential/,
  );
  assert.throws(
    () => computeRadarScore(timestampInput({ sourceTier: 'Z' as RadarScoreInput['sourceTier'] })),
    /source tier/,
  );
  assert.throws(
    () =>
      computeRadarScore(
        timestampInput({ riskFlags: ['unknown' as RadarScoreInput['riskFlags'][number]] }),
      ),
    /risk flag/,
  );
  assert.throws(
    () =>
      computeRadarScore(
        timestampInput({
          independentCrossChecks: [
            { domain: 'invalid.example', tier: 'Z' as RadarScoreInput['sourceTier'] },
          ],
        }),
      ),
    /cross-check tier/,
  );
});

test('computeRadarScore memvalidasi bentuk JSON lengkap sebelum mengakses field', () => {
  const invalidCases: Array<[unknown, RegExp]> = [
    [null, /score input must be an object/],
    [[], /score input must be an object/],
    [{ ...timestampInput(), rubricVersion: 1 }, /rubricVersion/],
    [{ ...timestampInput(), asOf: 1 }, /asOf must be a string/],
    [{ ...timestampInput(), sourceIsPrimary: 'false' }, /sourceIsPrimary must be a boolean/],
    [{ ...timestampInput(), publishedAt: 1 }, /publishedAt must be a string or null/],
    [{ ...timestampInput(), discoveredAt: null }, /discoveredAt must be a string/],
    [{ ...timestampInput(), independentCrossChecks: {} }, /independentCrossChecks must be an array/],
    [{ ...timestampInput(), independentCrossChecks: [null] }, /cross-check entry must be an object/],
    [
      { ...timestampInput(), independentCrossChecks: [{ domain: 3, tier: 'B' }] },
      /cross-check domain must be a non-empty string/,
    ],
    [
      { ...timestampInput(), independentCrossChecks: [{ domain: '   ', tier: 'B' }] },
      /cross-check domain must be a non-empty string/,
    ],
    [
      { ...timestampInput(), independentCrossChecks: [{ domain: 'https://bad.example/path', tier: 'B' }] },
      /Invalid cross-check domain/,
    ],
    [
      { ...timestampInput(), independentCrossChecks: [{ domain: 'ok.example', tier: 2 }] },
      /Invalid cross-check tier/,
    ],
    [{ ...timestampInput(), relevance: '25' }, /Invalid relevance score/],
    [{ ...timestampInput(), carouselPotential: '10' }, /Invalid carousel potential score/],
    [{ ...timestampInput(), riskFlags: {} }, /riskFlags must be an array/],
    [{ ...timestampInput(), riskFlags: [3] }, /Invalid risk flag/],
  ];

  for (const [input, expected] of invalidCases) {
    assert.throws(() => computeRadarScore(input as RadarScoreInput), expected);
  }
});

test('total skor mempertahankan boundary Radar 49/50 dan Draft 74/75', () => {
  const cases: Array<[number, Partial<RadarScoreInput>]> = [
    [
      49,
      {
        publishedAt: '2026-11-07T23:00:00.000Z',
        sourceIsPrimary: false,
        relevance: 0,
        carouselPotential: 3,
        riskFlags: ['context_required'],
      },
    ],
    [
      50,
      {
        sourceIsPrimary: false,
        relevance: 0,
        carouselPotential: 0,
        riskFlags: ['context_required'],
      },
    ],
    [
      74,
      {
        independentCrossChecks: [{ domain: 'confirm.example', tier: 'B' }],
        relevance: 8,
        carouselPotential: 3,
        riskFlags: ['context_required'],
      },
    ],
    [
      75,
      {
        independentCrossChecks: [{ domain: 'confirm.example', tier: 'B' }],
        relevance: 0,
        carouselPotential: 10,
      },
    ],
  ];

  for (const [expected, input] of cases) {
    assert.equal(computeRadarScore(timestampInput(input)).total, expected);
  }

  assert.deepEqual(getRadarAdmission(computeRadarScore(timestampInput(cases[0][1]))), {
    admitted: false,
    reason: 'score_below_50',
  });
  assert.deepEqual(getRadarAdmission(computeRadarScore(timestampInput(cases[1][1]))), {
    admitted: true,
    reason: null,
  });
  const tamperedAdmissionScore = computeRadarScore(timestampInput(cases[0][1]));
  tamperedAdmissionScore.total = 100;
  assert.equal(getRadarAdmission(tamperedAdmissionScore).admitted, false);
  assert.equal(
    isAutoDraftEligible(candidateFromInput(timestampInput(cases[2][1]))).eligible,
    false,
  );
  assert.equal(
    isAutoDraftEligible(candidateFromInput(timestampInput(cases[3][1]))).eligible,
    true,
  );
});

const selectableCandidate = (
  id: string,
  overrides: Partial<RadarCandidate> = {},
  scoreInput: Partial<RadarScoreInput> = {},
): RadarCandidate => {
  const input = timestampInput({
    independentCrossChecks: [{ domain: `${id}.confirm.example`, tier: 'B' }],
    relevance: 25,
    carouselPotential: 10,
    ...scoreInput,
  });
  return {
    id,
    clusterKey: `cluster-${id}`,
    canonicalUrl: `https://${id}.example/news`,
    title: `Berita ${id}`,
    summary: `Ringkasan ${id}`,
    publishedAt: input.publishedAt,
    discoveredAt: input.discoveredAt,
    niche: 'technology',
    sourceDomain: `${id}.example`,
    sourceTier: input.sourceTier,
    status: 'qualified',
    score: computeRadarScore(input),
    ...overrides,
  };
};

test('selectDailyDrafts memilih maksimal tiga dengan maksimal satu crypto', () => {
  const candidates = [
    selectableCandidate('crypto-a', { niche: 'crypto' }),
    selectableCandidate('crypto-b', { niche: 'crypto' }, { relevance: 21 }),
    selectableCandidate('design', { niche: 'design' }),
    selectableCandidate('security', { niche: 'security' }),
    selectableCandidate('ai', { niche: 'ai' }),
  ];

  const selected = selectDailyDrafts(candidates);

  assert.equal(selected.length, 3);
  assert.equal(selected.filter(({ niche }) => niche === 'crypto').length, 1);
  assert.equal(selectDailyDrafts(candidates, Number.NaN).length, 3);
});

test('selectDailyDrafts tidak mengisi slot dengan skor 74', () => {
  const belowThreshold = selectableCandidate('low', {}, {
    independentCrossChecks: [{ domain: 'confirm.example', tier: 'B' }],
    relevance: 8,
    carouselPotential: 3,
    riskFlags: ['context_required'],
  });

  assert.equal(belowThreshold.score.total, 74);
  assert.deepEqual(selectDailyDrafts([belowThreshold]), []);
});

test('eligibility menghitung ulang total dari snapshot, bukan mempercayai total tersimpan', () => {
  const candidate = selectableCandidate('tampered', {}, {
    independentCrossChecks: [{ domain: 'confirm.example', tier: 'B' }],
    relevance: 8,
    carouselPotential: 3,
    riskFlags: ['context_required'],
  });
  candidate.score.total = 100;
  candidate.score.components.safety = 5;

  assert.equal(isAutoDraftEligible(candidate).eligible, false);
  assert.ok(isAutoDraftEligible(candidate).reasons.includes('score_below_75'));
  assert.deepEqual(selectDailyDrafts([candidate]), []);
});

test('primary community dan unverified memenuhi trust route auto-Draft', () => {
  const community = selectableCandidate('community-primary', {}, {
    sourceTier: 'D',
    sourceIsPrimary: true,
    independentCrossChecks: [],
  });
  const unverified = selectableCandidate('unverified-primary', {}, {
    sourceTier: 'unverified',
    sourceIsPrimary: true,
    independentCrossChecks: [{ domain: 'evidence.example', tier: 'B' }],
  });

  assert.equal(isAutoDraftEligible(community).eligible, true);
  assert.equal(isAutoDraftEligible(unverified).eligible, true);
});

test('dua domain B/C independen memenuhi trust route untuk setiap tier', () => {
  for (const sourceTier of ['A', 'B', 'C', 'D', 'unverified'] as const) {
    const candidate = selectableCandidate(`crosschecked-${sourceTier}`, {}, {
      sourceTier,
      sourceIsPrimary: false,
      independentCrossChecks: [
        { domain: 'first.example', tier: 'B' },
        { domain: 'second.example', tier: 'C' },
      ],
    });
    const eligibility = isAutoDraftEligible(candidate);

    assert.equal(eligibility.reasons.includes('insufficient_crosscheck'), false, sourceTier);
    if (candidate.score.total >= 75) assert.equal(eligibility.eligible, true, sourceTier);
  }
});

test('non-primary dengan cross-check B/C tidak cukup atau domain duplikat ditolak', () => {
  const cases = [
    selectableCandidate('one-crosscheck', {}, {
      sourceTier: 'unverified',
      sourceIsPrimary: false,
      independentCrossChecks: [{ domain: 'only.example', tier: 'B' }],
    }),
    selectableCandidate('duplicate-crosscheck', {}, {
      sourceTier: 'A',
      sourceIsPrimary: false,
      independentCrossChecks: [
        { domain: 'same.example', tier: 'B' },
        { domain: ' SAME.EXAMPLE ', tier: 'C' },
      ],
    }),
    selectableCandidate('wrong-tier-crosscheck', {}, {
      sourceTier: 'B',
      sourceIsPrimary: false,
      independentCrossChecks: [
        { domain: 'first.example', tier: 'A' },
        { domain: 'second.example', tier: 'D' },
      ],
    }),
  ];

  for (const candidate of cases) {
    const eligibility = isAutoDraftEligible(candidate);
    assert.equal(eligibility.eligible, false, candidate.id);
    assert.ok(eligibility.reasons.includes('insufficient_crosscheck'), candidate.id);
  }
});

test('selectDailyDrafts memecahkan seri dengan timestamp terbaru lalu candidate ID stabil', () => {
  const older = selectableCandidate('z-older', {}, {
    publishedAt: '2026-11-08T03:00:00.000Z',
    discoveredAt: '2026-11-08T03:10:00.000Z',
  });
  const newerB = selectableCandidate('b-newer');
  const newerA = selectableCandidate('a-newer');

  assert.deepEqual(
    selectDailyDrafts([older, newerB, newerA]).map(({ id }) => id),
    ['a-newer', 'b-newer', 'z-older'],
  );
});

test('selectDailyDrafts tidak memilih dua kandidat dari cluster yang sama', () => {
  const high = selectableCandidate('cluster-high', { clusterKey: 'shared' });
  const duplicate = selectableCandidate(
    'cluster-low',
    { clusterKey: 'shared' },
    { relevance: 21 },
  );

  assert.deepEqual(selectDailyDrafts([duplicate, high]).map(({ id }) => id), ['cluster-high']);
});

const draftFixture = (slideCount = 4): RadarDraft => ({
  id: 'draft-1',
  candidateId: 'candidate-1',
  postId: 'radar-post-candidate-1',
  title: 'Dampak rilis baru untuk bisnis kreatif',
  status: 'Draft',
  document: {
    kicker: 'Content Radar',
    template: 'split-brand',
    headline: 'Dampak rilis baru untuk bisnis kreatif',
    highlight: 'bisnis kreatif',
    sourceName: 'Example Research',
    sourceUrl: 'https://EXAMPLE.com/release/?utm_source=radar#detail',
    coverImageUrl: '',
    slides: Array.from({ length: slideCount }, (_, index) => ({
      id: `candidate-1-slide-${index + 1}`,
      kind: index === 0 ? 'cover' : 'text',
      title: `Fakta sumber ${index + 1}`,
      body: `Isi terverifikasi ${index + 1}`,
    })),
    caption: 'Ringkasan berdasarkan sumber terlampir.',
    hashtags: ['PlayDesign', 'ContentRadar'],
    updatedAt: '2026-11-08T08:05:00.000Z',
  },
  scoreSnapshot: computeRadarScore(timestampInput()),
  sourcesSnapshot: [
    {
      name: 'Example Research',
      url: 'https://example.com/release',
      domain: 'example.com',
      tier: 'A',
      relation: 'primary',
    },
  ],
  createdAt: '2026-11-08T08:05:00.000Z',
  createdBy: 'radar-agent',
});

test('radarDraftToSocialPost mempertahankan ID stabil, status Draft, dan provenance', () => {
  const draft = draftFixture();
  const post = radarDraftToSocialPost(draft);

  assert.equal(post.id, 'radar-post-candidate-1');
  assert.equal(post.status, 'Draft');
  assert.equal(post.carousel?.sourceUrl, 'https://example.com/release');
  assert.equal(post.carousel?.slides.length, 4);
  assert.deepEqual(
    post.carousel?.slides.map(({ title, body }) => ({ title, body })),
    draft.document.slides.map(({ title, body }) => ({ title, body })),
  );
});

test('radarDraftToSocialPost menerima dan mempertahankan delapan slide', () => {
  const draft = draftFixture(8);
  const post = radarDraftToSocialPost(draft);

  assert.deepEqual(post.carousel?.slides, draft.document.slides);
});

test('radarDraftToSocialPost menolak dokumen di luar batas 4 sampai 8 slide', () => {
  assert.throws(() => radarDraftToSocialPost(draftFixture(3)), /4 to 8 slides/);
  assert.throws(() => radarDraftToSocialPost(draftFixture(9)), /4 to 8 slides/);
});

test('radarDraftToSocialPost menolak provenance non-HTTP', () => {
  const draft = draftFixture();
  draft.sourcesSnapshot[0].url = 'file:///etc/passwd';

  assert.throws(() => radarDraftToSocialPost(draft), /HTTP\/HTTPS/);
});

test('radarDraftToSocialPost menolak cover dan media URL non-HTTP yang tidak kosong', () => {
  for (const coverImageUrl of ['file:///tmp/cover.png', 'javascript:alert(1)']) {
    const draft = draftFixture();
    draft.document.coverImageUrl = coverImageUrl;

    assert.throws(() => radarDraftToSocialPost(draft), /HTTP\/HTTPS/);
  }

  assert.equal(radarDraftToSocialPost(draftFixture()).mediaUrl, undefined);
});
