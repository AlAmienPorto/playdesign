import type { RadarCandidateRecord, RadarDraftRecord, RadarRun, RadarSourceRecord } from './api';

export type RadarEmptyState = 'first-run' | 'filtered' | 'quiet';

const wibDay = (iso: string) => {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

export function buildRadarSummary(input: {
  candidates: Array<Pick<RadarCandidateRecord, 'score' | 'publishedAt' | 'discoveredAt'>>;
  sources: Array<Pick<RadarSourceRecord, 'tier'>>;
  drafts: Array<Pick<RadarDraftRecord, 'createdAt'>>;
  now?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  const cutoff = Date.parse(now) - 24 * 60 * 60 * 1000;
  return {
    candidates24h: input.candidates.filter((candidate) =>
      Date.parse(candidate.publishedAt ?? candidate.discoveredAt) >= cutoff,
    ).length,
    score75Plus: input.candidates.filter((candidate) => candidate.score.total >= 75).length,
    draftsTodayWib: input.drafts.filter((draft) => wibDay(draft.createdAt) === wibDay(now)).length,
    unverifiedSources: input.sources.filter((source) => source.tier === 'unverified').length,
  };
}

export function isRadarRunStale(
  run: Pick<RadarRun, 'heartbeatAt' | 'createdAt'> | null | undefined,
  now = new Date().toISOString(),
) {
  if (!run) return true;
  const lastSignal = Date.parse(run.heartbeatAt ?? run.createdAt);
  return !Number.isFinite(lastSignal) || Date.parse(now) - lastSignal > 4 * 60 * 60 * 1000;
}

export function classifyRadarEmptyState(input: {
  candidates: unknown[];
  sources: unknown[];
  runs: unknown[];
  drafts: unknown[];
  hasFilters: boolean;
}): RadarEmptyState {
  if (input.hasFilters) return 'filtered';
  if (input.sources.length === 0 && input.runs.length === 0 && input.drafts.length === 0) return 'first-run';
  return 'quiet';
}
