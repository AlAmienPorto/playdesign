import type { CarouselDocument, SocialPost } from '../data/types';

export type RadarSourceTier = 'A' | 'B' | 'C' | 'D' | 'unverified';
export type RadarNiche = 'ai' | 'technology' | 'design' | 'security' | 'internet' | 'crypto';
export type RadarCandidateStatus = 'new' | 'qualified' | 'rejected' | 'drafted' | 'archived';
export type RadarDraftStatus = 'Draft';
export type RadarRelevance = 0 | 8 | 13 | 18 | 21 | 25;
export type RadarCarouselPotential = 0 | 3 | 5 | 8 | 10;
export type RadarRiskFlag =
  | 'context_required'
  | 'disclaimer_required'
  | 'rumor'
  | 'defamation'
  | 'license_conflict'
  | 'health_claim'
  | 'financial_claim'
  | 'investment_solicitation'
  | 'price_prediction'
  | 'token_shilling'
  | 'referral_affiliate';

export interface RadarCrossCheckInput {
  domain: string;
  tier: RadarSourceTier;
}

export interface RadarScoreInput {
  rubricVersion: 'v1';
  asOf: string;
  sourceTier: RadarSourceTier;
  sourceIsPrimary: boolean;
  publishedAt: string | null;
  discoveredAt: string;
  independentCrossChecks: RadarCrossCheckInput[];
  relevance: RadarRelevance;
  carouselPotential: RadarCarouselPotential;
  riskFlags: RadarRiskFlag[];
}

export interface RadarScoreInputSnapshot extends RadarScoreInput {
  effectiveTimestamp: string;
  timestampFallback: boolean;
  timestampValid: boolean;
  ageHours: number | null;
  independentCrossChecks: RadarCrossCheckInput[];
  riskFlags: RadarRiskFlag[];
}

export interface RadarScoreComponents {
  credibility: 5 | 10 | 20 | 26 | 30;
  relevance: RadarRelevance;
  freshness: 0 | 7 | 11 | 15;
  evidence: 2 | 6 | 11 | 15;
  carouselPotential: RadarCarouselPotential;
  safety: 0 | 3 | 5;
}

export interface RadarScore {
  rubricVersion: 'v1';
  components: RadarScoreComponents;
  total: number;
  inputSnapshot: RadarScoreInputSnapshot;
}

export interface RadarCandidate {
  id: string;
  clusterKey: string;
  canonicalUrl: string;
  title: string;
  summary: string;
  publishedAt: string | null;
  discoveredAt: string;
  niche: RadarNiche;
  sourceDomain: string;
  sourceTier: RadarSourceTier;
  status: RadarCandidateStatus;
  score: RadarScore;
  draftId?: string | null;
}

export type RadarEligibilityReason =
  | 'score_below_75'
  | 'invalid_canonical_url'
  | 'future_timestamp'
  | 'outside_24h_window'
  | 'insufficient_crosscheck'
  | 'blocking_risk'
  | 'already_drafted'
  | 'candidate_inactive';

export interface RadarEligibility {
  eligible: boolean;
  reasons: RadarEligibilityReason[];
}

export interface RadarDraftSource {
  name: string;
  url: string;
  domain: string;
  tier: RadarSourceTier;
  relation: 'primary' | 'crosscheck' | 'signal';
}

export interface RadarDraft {
  id: string;
  candidateId: string;
  postId: string;
  title: string;
  status: RadarDraftStatus;
  document: CarouselDocument;
  scoreSnapshot: RadarScore;
  sourcesSnapshot: RadarDraftSource[];
  createdAt: string;
  createdBy: 'radar-agent' | 'Owner';
}

const TRACKING_PARAMETERS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'ref',
  'ref_src',
]);

const CREDIBILITY: Record<RadarSourceTier, RadarScoreComponents['credibility']> = {
  A: 30,
  B: 26,
  C: 20,
  D: 10,
  unverified: 5,
};

const SOURCE_TIERS = new Set<RadarSourceTier>(['A', 'B', 'C', 'D', 'unverified']);
const RELEVANCE_VALUES = new Set<number>([0, 8, 13, 18, 21, 25]);
const POTENTIAL_VALUES = new Set<number>([0, 3, 5, 8, 10]);
const RISK_FLAGS = new Set<RadarRiskFlag>([
  'context_required',
  'disclaimer_required',
  'rumor',
  'defamation',
  'license_conflict',
  'health_claim',
  'financial_claim',
  'investment_solicitation',
  'price_prediction',
  'token_shilling',
  'referral_affiliate',
]);
const CONTEXTUAL_RISKS = new Set<RadarRiskFlag>(['context_required', 'disclaimer_required']);

function parseTimestamp(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizedCrossChecks(checks: RadarCrossCheckInput[]): RadarCrossCheckInput[] {
  const byDomain = new Map<string, RadarCrossCheckInput>();
  for (const check of checks) {
    const domain = check.domain.trim().toLowerCase();
    if (domain && !byDomain.has(domain)) byDomain.set(domain, { domain, tier: check.tier });
  }
  return [...byDomain.values()].sort((left, right) =>
    left.domain < right.domain ? -1 : left.domain > right.domain ? 1 : 0,
  );
}

function snapshotScoreInput(input: RadarScoreInput): RadarScoreInputSnapshot {
  const asOf = parseTimestamp(input.asOf);
  const publishedAt = input.publishedAt ? parseTimestamp(input.publishedAt) : null;
  const discoveredAt = parseTimestamp(input.discoveredAt);
  const timestampFallback = !input.publishedAt;
  const effectiveTimestamp = timestampFallback ? input.discoveredAt : input.publishedAt!;
  const effective = timestampFallback ? discoveredAt : publishedAt;
  const timestampValid = asOf !== null && effective !== null && effective <= asOf;
  const ageHours = timestampValid ? (asOf - effective) / 3_600_000 : null;

  return {
    ...input,
    independentCrossChecks: normalizedCrossChecks(input.independentCrossChecks),
    riskFlags: [...new Set(input.riskFlags)].sort(),
    effectiveTimestamp,
    timestampFallback,
    timestampValid,
    ageHours,
  };
}

function freshnessFor(snapshot: RadarScoreInputSnapshot): RadarScoreComponents['freshness'] {
  if (snapshot.ageHours === null || snapshot.ageHours > 24) return 0;
  if (snapshot.ageHours <= 6) return 15;
  if (snapshot.ageHours <= 12) return 11;
  return 7;
}

function evidenceFor(snapshot: RadarScoreInputSnapshot): RadarScoreComponents['evidence'] {
  if (snapshot.sourceIsPrimary && snapshot.independentCrossChecks.length >= 1) return 15;
  const trusted = snapshot.independentCrossChecks.filter(
    ({ tier }) => tier === 'B' || tier === 'C',
  ).length;
  if (snapshot.sourceIsPrimary || trusted >= 2) return 11;
  if (trusted === 1 || snapshot.sourceTier === 'B' || snapshot.sourceTier === 'C') return 6;
  return 2;
}

function safetyFor(flags: RadarRiskFlag[]): RadarScoreComponents['safety'] {
  if (flags.length === 0) return 5;
  return flags.every((flag) => CONTEXTUAL_RISKS.has(flag)) ? 3 : 0;
}

export function canonicalizeRadarUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError('Content Radar URLs must use HTTP/HTTPS');
  }

  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();
  const parameters = [...parsed.searchParams.entries()]
    .filter(([key]) => {
      const normalized = key.toLowerCase();
      return !normalized.startsWith('utm_') && !TRACKING_PARAMETERS.has(normalized);
    })
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyOrder = leftKey.localeCompare(rightKey);
      return keyOrder || leftValue.localeCompare(rightValue);
    });
  parsed.search = '';
  for (const [key, value] of parameters) parsed.searchParams.append(key, value);
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';

  const canonical = parsed.toString();
  return parsed.pathname === '/' && !parsed.search ? canonical.replace(/\/$/, '') : canonical;
}

export function computeRadarScore(input: RadarScoreInput): RadarScore {
  if (input.rubricVersion !== 'v1') throw new TypeError('Unsupported Content Radar rubric');
  if (!SOURCE_TIERS.has(input.sourceTier)) throw new TypeError('Invalid source tier');
  if (input.independentCrossChecks.some(({ tier }) => !SOURCE_TIERS.has(tier))) {
    throw new TypeError('Invalid cross-check tier');
  }
  if (input.riskFlags.some((flag) => !RISK_FLAGS.has(flag))) {
    throw new TypeError('Invalid risk flag');
  }
  if (!RELEVANCE_VALUES.has(input.relevance)) throw new TypeError('Invalid relevance score');
  if (!POTENTIAL_VALUES.has(input.carouselPotential)) {
    throw new TypeError('Invalid carousel potential score');
  }

  const inputSnapshot = snapshotScoreInput(input);
  const components: RadarScoreComponents = {
    credibility: CREDIBILITY[input.sourceTier],
    relevance: input.relevance,
    freshness: freshnessFor(inputSnapshot),
    evidence: evidenceFor(inputSnapshot),
    carouselPotential: input.carouselPotential,
    safety: safetyFor(inputSnapshot.riskFlags),
  };

  return {
    rubricVersion: 'v1',
    components,
    total: Object.values(components).reduce((sum, value) => sum + value, 0),
    inputSnapshot,
  };
}

function hasDraftTrust(snapshot: RadarScoreInputSnapshot): boolean {
  if (snapshot.sourceTier === 'A' && snapshot.sourceIsPrimary) return true;
  return (
    snapshot.independentCrossChecks.filter(({ tier }) => tier === 'B' || tier === 'C').length >= 2
  );
}

export function isAutoDraftEligible(candidate: RadarCandidate): RadarEligibility {
  const reasons: RadarEligibilityReason[] = [];
  const recomputedScore = computeRadarScore(candidate.score.inputSnapshot);
  const snapshot = recomputedScore.inputSnapshot;

  if (recomputedScore.total < 75) reasons.push('score_below_75');
  try {
    canonicalizeRadarUrl(candidate.canonicalUrl);
  } catch {
    reasons.push('invalid_canonical_url');
  }
  if (!snapshot.timestampValid) reasons.push('future_timestamp');
  else if (snapshot.ageHours === null || snapshot.ageHours > 24) reasons.push('outside_24h_window');
  if (!hasDraftTrust(snapshot)) reasons.push('insufficient_crosscheck');
  if (recomputedScore.components.safety === 0) reasons.push('blocking_risk');
  if (candidate.draftId || candidate.status === 'drafted') reasons.push('already_drafted');
  if (candidate.status === 'rejected' || candidate.status === 'archived') {
    reasons.push('candidate_inactive');
  }

  return { eligible: reasons.length === 0, reasons };
}

export function selectDailyDrafts(candidates: RadarCandidate[], limit = 3): RadarCandidate[] {
  const cappedLimit = Number.isFinite(limit)
    ? Math.max(0, Math.min(3, Math.trunc(limit)))
    : 3;
  const sorted = candidates
    .filter((candidate) => isAutoDraftEligible(candidate).eligible)
    .sort((left, right) => {
      const leftScore = computeRadarScore(left.score.inputSnapshot);
      const rightScore = computeRadarScore(right.score.inputSnapshot);
      if (leftScore.total !== rightScore.total) return rightScore.total - leftScore.total;
      const leftTime = Date.parse(leftScore.inputSnapshot.effectiveTimestamp);
      const rightTime = Date.parse(rightScore.inputSnapshot.effectiveTimestamp);
      if (leftTime !== rightTime) return rightTime - leftTime;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });

  const selected: RadarCandidate[] = [];
  const clusters = new Set<string>();
  let cryptoCount = 0;
  for (const candidate of sorted) {
    if (selected.length >= cappedLimit) break;
    if (clusters.has(candidate.clusterKey)) continue;
    if (candidate.niche === 'crypto' && cryptoCount >= 1) continue;
    selected.push(candidate);
    clusters.add(candidate.clusterKey);
    if (candidate.niche === 'crypto') cryptoCount += 1;
  }
  return selected;
}

export function radarDraftToSocialPost(draft: RadarDraft): SocialPost {
  if (draft.document.slides.length < 4 || draft.document.slides.length > 8) {
    throw new TypeError('Radar carousel must contain 4 to 8 slides');
  }
  for (const source of draft.sourcesSnapshot) canonicalizeRadarUrl(source.url);
  const sourceUrl = canonicalizeRadarUrl(draft.document.sourceUrl);
  const carousel: CarouselDocument = {
    ...draft.document,
    sourceUrl,
    slides: draft.document.slides.map((slide) => ({ ...slide })),
    hashtags: [...draft.document.hashtags],
  };

  return {
    id: draft.postId,
    title: draft.title,
    channel: 'Instagram',
    date: draft.createdAt,
    status: 'Draft',
    caption: carousel.caption,
    hashtags: [...carousel.hashtags],
    mediaUrl: carousel.coverImageUrl || undefined,
    slides: carousel.slides.map((slide) => slide.title),
    author: draft.createdBy,
    carousel,
  };
}
