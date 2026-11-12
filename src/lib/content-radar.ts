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

export interface RadarAdmission {
  admitted: boolean;
  reason: 'score_below_50' | null;
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
const OFFSET_ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|[+-]\d{2}:\d{2})$/;

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTimestamp(value: string, field: string): { milliseconds: number; normalized: string } {
  const match = OFFSET_ISO_TIMESTAMP.exec(value);
  if (!match) throw new TypeError(`Invalid ${field} timestamp format`);

  const [, year, month, day, hour, minute, second] = match;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const lastDay = new Date(Date.UTC(yearNumber, monthNumber, 0)).getUTCDate();
  if (
    monthNumber < 1 ||
    monthNumber > 12 ||
    dayNumber < 1 ||
    dayNumber > lastDay ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  ) {
    throw new TypeError(`Invalid ${field} timestamp format`);
  }

  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new TypeError(`Invalid ${field} timestamp format`);
  }
  return { milliseconds, normalized: new Date(milliseconds).toISOString() };
}

function validateScoreInput(input: unknown): asserts input is RadarScoreInput {
  if (!isRecord(input)) throw new TypeError('Content Radar score input must be an object');
  if (input.rubricVersion !== 'v1') throw new TypeError('Unsupported Content Radar rubricVersion');
  if (typeof input.asOf !== 'string') throw new TypeError('asOf must be a string');
  if (!SOURCE_TIERS.has(input.sourceTier as RadarSourceTier)) throw new TypeError('Invalid source tier');
  if (typeof input.sourceIsPrimary !== 'boolean') {
    throw new TypeError('sourceIsPrimary must be a boolean');
  }
  if (input.publishedAt !== null && typeof input.publishedAt !== 'string') {
    throw new TypeError('publishedAt must be a string or null');
  }
  if (typeof input.discoveredAt !== 'string') throw new TypeError('discoveredAt must be a string');
  if (!Array.isArray(input.independentCrossChecks)) {
    throw new TypeError('independentCrossChecks must be an array');
  }
  for (const check of input.independentCrossChecks) {
    if (!isRecord(check)) throw new TypeError('cross-check entry must be an object');
    if (typeof check.domain !== 'string' || check.domain.trim() === '') {
      throw new TypeError('cross-check domain must be a non-empty string');
    }
    if (!SOURCE_TIERS.has(check.tier as RadarSourceTier)) {
      throw new TypeError('Invalid cross-check tier');
    }
  }
  if (!RELEVANCE_VALUES.has(input.relevance as number)) {
    throw new TypeError('Invalid relevance score');
  }
  if (!POTENTIAL_VALUES.has(input.carouselPotential as number)) {
    throw new TypeError('Invalid carousel potential score');
  }
  if (!Array.isArray(input.riskFlags)) throw new TypeError('riskFlags must be an array');
  if (input.riskFlags.some((flag) => typeof flag !== 'string' || !RISK_FLAGS.has(flag as RadarRiskFlag))) {
    throw new TypeError('Invalid risk flag');
  }
}

function normalizeDomain(value: string): string {
  const domain = value.trim().toLowerCase();
  let parsed: URL;
  try {
    parsed = new URL(`https://${domain}`);
  } catch {
    throw new TypeError('Invalid cross-check domain');
  }
  if (
    parsed.hostname !== domain ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.port !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new TypeError('Invalid cross-check domain');
  }
  return domain;
}

function normalizedCrossChecks(checks: RadarCrossCheckInput[]): RadarCrossCheckInput[] {
  const byDomain = new Map<string, RadarCrossCheckInput>();
  for (const check of checks) {
    const domain = normalizeDomain(check.domain);
    if (!byDomain.has(domain)) byDomain.set(domain, { domain, tier: check.tier });
  }
  return [...byDomain.values()].sort((left, right) => compareCodeUnits(left.domain, right.domain));
}

function snapshotScoreInput(input: RadarScoreInput): RadarScoreInputSnapshot {
  const asOf = parseTimestamp(input.asOf, 'asOf');
  const discoveredAt = parseTimestamp(input.discoveredAt, 'discoveredAt');
  const publishedAt =
    input.publishedAt === null ? null : parseTimestamp(input.publishedAt, 'publishedAt');
  const timestampFallback = input.publishedAt === null;
  const effective = publishedAt ?? discoveredAt;
  const timestampValid =
    discoveredAt.milliseconds <= asOf.milliseconds &&
    (publishedAt === null || publishedAt.milliseconds <= asOf.milliseconds);
  const ageHours = timestampValid
    ? (asOf.milliseconds - effective.milliseconds) / 3_600_000
    : null;

  return {
    ...input,
    asOf: asOf.normalized,
    publishedAt: publishedAt?.normalized ?? null,
    discoveredAt: discoveredAt.normalized,
    independentCrossChecks: normalizedCrossChecks(input.independentCrossChecks),
    riskFlags: [...new Set(input.riskFlags)].sort(compareCodeUnits),
    effectiveTimestamp: effective.normalized,
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
  if (typeof url !== 'string') throw new TypeError('Content Radar URL must be a string');
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
      const keyOrder = compareCodeUnits(leftKey, rightKey);
      return keyOrder || compareCodeUnits(leftValue, rightValue);
    });
  parsed.search = '';
  for (const [key, value] of parameters) parsed.searchParams.append(key, value);
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';

  const canonical = parsed.toString();
  return parsed.pathname === '/' && !parsed.search ? canonical.replace(/\/$/, '') : canonical;
}

export function computeRadarScore(input: RadarScoreInput): RadarScore {
  validateScoreInput(input);
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

export function getRadarAdmission(score: RadarScore): RadarAdmission {
  const recomputedScore = computeRadarScore(score.inputSnapshot);
  return recomputedScore.total >= 50
    ? { admitted: true, reason: null }
    : { admitted: false, reason: 'score_below_50' };
}

function hasDraftTrust(snapshot: RadarScoreInputSnapshot): boolean {
  if (snapshot.sourceIsPrimary) return true;
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
  const coverImageUrl = draft.document.coverImageUrl
    ? canonicalizeRadarUrl(draft.document.coverImageUrl)
    : draft.document.coverImageUrl;
  const carousel: CarouselDocument = {
    ...draft.document,
    sourceUrl,
    coverImageUrl,
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
    radarDraftId: draft.id,
    radarCandidateId: draft.candidateId,
  };
}

export { importRadarDrafts, importRadarDraftsInDb } from './carousel-store';

export interface SyncRadarDraftsOptions {
  workspaceId: string;
  actorId: string;
  fetchDrafts: () => Promise<RadarDraft[]>;
  importDrafts: (drafts: RadarDraft[]) => string[];
  ackDraft: (draftId: string, context: { workspaceId: string; actorId: string }) => Promise<unknown>;
}

export interface SyncRadarDraftsResult {
  total: number;
  imported: string[];
  acked: string[];
  failed: string[];
}

export async function syncRadarDraftImports(
  options: SyncRadarDraftsOptions,
): Promise<SyncRadarDraftsResult> {
  const { workspaceId, actorId, importDrafts, fetchDrafts, ackDraft } = options;

  let drafts: RadarDraft[] = [];
  try {
    drafts = await fetchDrafts();
  } catch {
    return { total: 0, imported: [], acked: [], failed: [] };
  }

  if (!Array.isArray(drafts) || drafts.length === 0) {
    return { total: 0, imported: [], acked: [], failed: [] };
  }

  let importedIds: string[] = [];
  try {
    importedIds = importDrafts(drafts);
  } catch {
    return {
      total: drafts.length,
      imported: [],
      acked: [],
      failed: drafts.map((d) => d.id),
    };
  }

  const importedSet = new Set(importedIds);
  const acked: string[] = [];
  const failed: string[] = [];

  for (const draft of drafts) {
    if (!importedSet.has(draft.id)) {
      failed.push(draft.id);
    }
  }

  for (const draftId of importedIds) {
    try {
      await ackDraft(draftId, { workspaceId, actorId });
      acked.push(draftId);
    } catch {
      failed.push(draftId);
    }
  }

  return {
    total: drafts.length,
    imported: importedIds,
    acked,
    failed,
  };
}
