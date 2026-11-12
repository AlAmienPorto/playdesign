/*
 * API client for the Playdesign Office Worker.
 * The bearer token is stored in localStorage (never in the bundle) and is
 * injected by the Vite dev proxy in development.
 */

const TOKEN_KEY = 'pd_office_token';

export const getOfficeToken = (): string => {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};

export const setOfficeToken = (value: string) => {
  try {
    localStorage.setItem(TOKEN_KEY, value.replace(/\s+/g, ''));
  } catch {
    /* storage blocked — token only lasts this session */
  }
};

export const clearOfficeToken = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
};

const SESSION_KEY = 'pd_office_session';

export const getOfficeSession = (): string => {
  try {
    return localStorage.getItem(SESSION_KEY) ?? '';
  } catch {
    return '';
  }
};

export const setOfficeSession = (value: string) => {
  try {
    localStorage.setItem(SESSION_KEY, value);
  } catch {
    /* storage blocked */
  }
};

/** What we send as the bearer: a login session first, then a raw API token. */
export const getCredential = (): string => getOfficeSession() || getOfficeToken();

export const clearCredential = () => {
  clearOfficeToken();
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
};

export interface ApiLead {
  id: string;
  name: string;
  company: string;
  role: string;
  email: string;
  phone?: string;
  location?: string;
  status: string;
  source: string;
  score: number;
  value: number;
  ownerId: string;
  lastActivity: string;
  tags: string[];
  nextStep?: string;
  notes?: string;
  category?: string;
  fullAddress?: string;
  rating?: number;
  whatsappVerified?: boolean;
  whatsappLink?: string;
  googleMapsUrl?: string;
  sourceUrl?: string;
  sourceType?: 'gmaps' | 'instagram' | 'website' | string;
  instagram?: string;
  confidenceScore?: number;
}

export interface OfficeActor {
  id: string;
  name: string;
  role: 'owner' | 'spv' | 'operator';
  workspaceId: string;
}

export interface OfficeSnapshot {
  actor?: OfficeActor;
  workspace?: { id: string; name: string } | null;
  leads?: ApiLead[];
  tasks?: unknown[];
  runs?: unknown[];
  activity?: unknown[];
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const credential = getCredential();
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'ja',
      ...(credential ? { authorization: `Bearer ${credential}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 401) {
    clearCredential();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('pd-auth-cleared'));
  }

  const payload = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | null;

  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message ?? `The API returned ${response.status}.`,
      response.status,
      payload?.error?.code ?? 'request_failed',
    );
  }
  return payload as T;
};

export async function fetchOffice(workspaceId = 'playdesign'): Promise<OfficeSnapshot> {
  return request<OfficeSnapshot>(`/api/office?workspace=${encodeURIComponent(workspaceId)}`);
}

export type ScrapeRequestStatus = 'pending' | 'running' | 'done' | 'failed';

export interface ScrapeRequestRow {
  id: string;
  city: string;
  keyword: string;
  max_leads: number;
  status: ScrapeRequestStatus;
  requested_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  inserted?: number | null;
  error?: string | null;
}

export async function createScrapeRequest(input: {
  city: string;
  keyword: string;
  maxLeads?: number;
}): Promise<ScrapeRequestRow> {
  const payload = await request<{ ok: boolean; request: ScrapeRequestRow }>(
    '/api/scrape/requests',
    {
      method: 'POST',
      body: JSON.stringify({
        city: input.city,
        keyword: input.keyword,
        maxLeads: input.maxLeads ?? 10,
        workspace: 'playdesign',
      }),
    },
  );
  return payload.request;
}

export async function listScrapeRequests(): Promise<ScrapeRequestRow[]> {
  const payload = await request<{ requests: ScrapeRequestRow[] }>(
    '/api/scrape/requests?workspace=playdesign',
  );
  return payload.requests ?? [];
}

export type OutreachStatus = 'contacted' | 'replied' | 'interested' | 'not_interested' | 'deal';

export interface OutreachRow {
  id: string;
  leadId: string;
  leadName?: string | null;
  company?: string | null;
  phone?: string | null;
  category?: string | null;
  city?: string | null;
  status: OutreachStatus;
  channel: string;
  note?: string | null;
  contactedAt: string;
  repliedAt?: string | null;
  updatedAt: string;
}

export async function fetchOutreach(): Promise<OutreachRow[]> {
  const payload = await request<{ outreach: OutreachRow[] }>('/api/outreach?workspace=playdesign');
  return payload.outreach ?? [];
}

export async function saveOutreach(input: {
  leadId: string;
  leadName?: string;
  company?: string;
  phone?: string;
  category?: string;
  city?: string;
  status: OutreachStatus;
  note?: string;
}): Promise<void> {
  await request<{ ok: boolean }>('/api/outreach', {
    method: 'POST',
    body: JSON.stringify({ ...input, workspace: 'playdesign' }),
  });
}

export async function loginWithPassword(password: string): Promise<void> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { session?: string; error?: { message?: string; code?: string } }
    | null;
  if (!response.ok || !payload?.session) {
    throw new ApiError(
      payload?.error?.message ?? 'Password ditolak.',
      response.status,
      payload?.error?.code ?? 'login_failed',
    );
  }
  clearOfficeToken();
  setOfficeSession(payload.session);
}

export async function probeToken(token: string): Promise<boolean> {
  const response = await fetch('/api/office?workspace=playdesign', {
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'ja',
      authorization: `Bearer ${token}`,
    },
  });
  return response.ok;
}

/* ------------------------------------------------------------------ */
/* Video Studio — jobs point at Google Drive, never at this server     */
/* ------------------------------------------------------------------ */

import type { VideoScene, VideoSpec } from './video-spec';

export type VideoJobStatus = 'queued' | 'rendering' | 'uploading' | 'done' | 'failed' | 'canceled';

export interface VideoTemplateField {
  key: string;
  label: string;
  type: 'text' | 'color' | 'number';
  default?: string | number;
}

export interface VideoTemplate {
  id: string;
  name: string;
  compositionId: string;
  aspect: string;
  propsSchema: { fields: VideoTemplateField[] };
}

export interface VideoJob {
  id: string;
  templateId: string;
  title: string;
  status: VideoJobStatus;
  engine: string;
  fps: number;
  durationFrames: number;
  width: number;
  height: number;
  bytes?: number | null;
  driveFileId?: string | null;
  driveWebLink?: string | null;
  driveFolderId?: string | null;
  error?: string | null;
  attempts?: number;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  props: Record<string, unknown>;
  spec?: VideoSpec | null;
  specVersion?: number;
  localPath?: string | null;
}

export async function updateVideoJob(
  id: string,
  patch: { status?: VideoJobStatus; error?: string | null; spec?: VideoSpec; localPath?: string | null },
): Promise<VideoJob> {
  const payload = await request<{ job: VideoJob }>(`/api/video/jobs/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return payload.job;
}

export async function fetchVideoTemplates(): Promise<VideoTemplate[]> {
  const payload = await request<{ templates: VideoTemplate[] }>('/api/video/templates');
  return payload.templates ?? [];
}

export async function fetchVideoJobs(limit = 20): Promise<VideoJob[]> {
  const payload = await request<{ jobs: VideoJob[] }>(`/api/video/jobs?workspace=playdesign&limit=${limit}`);
  return payload.jobs ?? [];
}

export interface VideoReferenceRecord {
  id: string;
  name: string;
  kind: 'image' | 'video' | 'audio';
  role: 'style' | 'motion' | 'subject' | 'music' | 'sfx';
  url: string;
  strength: number;
  tags: string[];
  note: string | null;
  palette: { bg?: string; accent?: string } | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
}

export async function listVideoReferences(): Promise<VideoReferenceRecord[]> {
  const payload = await request<{ references: VideoReferenceRecord[] }>('/api/video/references');
  return payload.references ?? [];
}

export async function createVideoReference(input: {
  name: string;
  kind: VideoReferenceRecord['kind'];
  url: string;
  role?: VideoReferenceRecord['role'];
  strength?: number;
  tags?: string[];
  note?: string;
}): Promise<VideoReferenceRecord> {
  const payload = await request<{ reference: VideoReferenceRecord }>('/api/video/references', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.reference;
}

export async function updateVideoReference(
  id: string,
  patch: Partial<Pick<VideoReferenceRecord, 'name' | 'role' | 'url' | 'strength' | 'tags' | 'note'>>,
): Promise<VideoReferenceRecord> {
  const payload = await request<{ reference: VideoReferenceRecord }>(`/api/video/references/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return payload.reference;
}

export async function deleteVideoReference(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/video/references/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function createVideoJob(input: {
  templateId: string;
  title: string;
  props?: Record<string, unknown>;
  spec?: VideoSpec;
}): Promise<VideoJob> {
  const key =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload = await request<{ job: VideoJob }>('/api/video/jobs', {
    method: 'POST',
    headers: { 'idempotency-key': key },
    body: JSON.stringify({ ...input, workspace: 'playdesign' }),
  });
  return payload.job;
}

/** Revisi satu scene lewat Workers AI. Server memaksa id dan media.refId tetap. */
export async function reviseVideoScene(input: {
  scene: VideoScene;
  instruction: string;
  prompt?: string;
  style?: VideoSpec['style'];
  sceneIndex?: number;
  sceneCount?: number;
}): Promise<VideoScene> {
  const payload = await request<{ scene: VideoScene; model?: string }>('/api/video/scenes/revise', {
    method: 'POST',
    body: JSON.stringify({
      workspace: 'playdesign',
      instruction: input.instruction,
      scene: input.scene,
      context: {
        prompt: input.prompt ?? '',
        style: input.style ?? {},
        sceneIndex: input.sceneIndex ?? 0,
        sceneCount: input.sceneCount ?? 1,
      },
    }),
  });
  return payload.scene;
}

/* ------------------------------------------------------------------ */
/* Carousel export — job menyimpan pointer Drive, bukan byte gambar    */
/* ------------------------------------------------------------------ */

import type { CarouselDocument } from '../data/types';
import type { RadarDraftSource, RadarScore } from './content-radar';

export type CarouselJobStatus = 'queued' | 'rendering' | 'uploading' | 'done' | 'failed' | 'canceled';
export type CarouselPublishStatus = 'idle' | 'queued' | 'scheduling' | 'scheduled' | 'failed';
export type CarouselPublishPlatform = 'instagram' | 'threads' | 'tiktok' | 'facebook' | 'youtube' | 'x' | 'linkedin';

export interface CarouselExportJob {
  id: string;
  postId: string;
  title: string;
  status: CarouselJobStatus;
  slideCount: number;
  bytes?: number | null;
  driveFolderId?: string | null;
  driveFolderLink?: string | null;
  manifestFileId?: string | null;
  error?: string | null;
  attempts?: number;
  publishStatus?: CarouselPublishStatus;
  publishAt?: string | null;
  publishAccounts?: CarouselPublishPlatform[];
  tebarPostId?: string | null;
  publishError?: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  updatedAt: string;
}

export async function createCarouselExportJob(input: {
  postId: string;
  title: string;
  document: CarouselDocument;
}): Promise<CarouselExportJob> {
  const payload = await request<{ ok: boolean; job: CarouselExportJob }>('/api/carousel/jobs', {
    method: 'POST',
    body: JSON.stringify({ ...input, workspace: 'playdesign' }),
  });
  return payload.job;
}

export async function fetchCarouselExportJobs(postId: string, limit = 5): Promise<CarouselExportJob[]> {
  const payload = await request<{ jobs: CarouselExportJob[] }>(
    `/api/carousel/jobs?workspace=playdesign&postId=${encodeURIComponent(postId)}&limit=${limit}`,
  );
  return payload.jobs ?? [];
}

export async function scheduleCarouselPublish(input: {
  jobId: string;
  accounts: CarouselPublishPlatform[];
  scheduledAt: string | null;
}): Promise<CarouselExportJob> {
  const payload = await request<{ ok: boolean; job: CarouselExportJob }>(
    `/api/carousel/jobs/${encodeURIComponent(input.jobId)}/publish`,
    {
      method: 'POST',
      body: JSON.stringify({
        workspace: 'playdesign',
        accounts: input.accounts,
        scheduledAt: input.scheduledAt,
      }),
    },
  );
  return payload.job;
}

export type RadarNiche = 'ai' | 'technology' | 'design' | 'security' | 'internet' | 'crypto';
export type RadarSourceTier = 'A' | 'B' | 'C' | 'D' | 'unverified';
export type RadarCandidateStatus = 'new' | 'qualified' | 'rejected' | 'drafted' | 'archived';
export type RadarSourceKind = 'official' | 'media' | 'community' | 'regulator' | 'research' | 'project' | 'discovered';
export type RadarRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface RadarScoreComponents {
  credibility: number;
  relevance: number;
  freshness: number;
  evidence: number;
  carouselPotential: number;
  safety: number;
}

export interface RadarCandidateRecord {
  id: string;
  clusterKey: string;
  canonicalUrl: string;
  title: string;
  summary: string;
  publishedAt: string | null;
  publishedAtSource: string | null;
  discoveredAt: string;
  lastSeenAt: string;
  timestampFallback: boolean;
  niche: RadarNiche;
  language: string;
  status: RadarCandidateStatus;
  sourceDomain: string;
  sourceTier: RadarSourceTier;
  score: {
    rubricVersion: 'v1';
    components: RadarScoreComponents;
    total: number;
    inputSnapshot: {
      independentCrossChecks?: Array<{ domain: string; tier: RadarSourceTier }>;
      ageHours?: number | null;
      [key: string]: unknown;
    };
  };
  scoreReason: string;
  riskFlags: string[];
  rejectionReason: string | null;
  draftId: string | null;
  createdAt: string;
  updatedAt: string;
  sources?: RadarProvenanceSource[];
}

export interface RadarProvenanceSource {
  id: string;
  url: string;
  domain: string;
  relation: 'primary' | 'crosscheck' | 'signal';
  title: string;
  publishedAt: string | null;
  excerpt: string | null;
  tier: RadarSourceTier;
  name: string;
  enabled: boolean;
}

export interface RadarSourceRecord {
  id: string;
  domain: string;
  name: string;
  tier: RadarSourceTier;
  kind: RadarSourceKind;
  niches: RadarNiche[];
  feedUrl: string | null;
  enabled: boolean;
  requiresCrosscheck: boolean;
  verifiedAt: string | null;
  verifiedBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RadarRun {
  id: string;
  kind: 'collector' | 'selector';
  status: RadarRunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  heartbeatAt: string | null;
  counts: {
    fetched: number;
    new: number;
    updated: number;
    qualified: number;
    drafted: number;
    rejected: number;
  };
  error: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RadarDraftRecord {
  id: string;
  candidateId: string;
  postId: string;
  clusterKey: string;
  title: string;
  status: 'Draft';
  creationKind: 'automatic' | 'manual';
  autoDateWib: string | null;
  document: CarouselDocument;
  scoreSnapshot: RadarScore;
  sourcesSnapshot: RadarDraftSource[];
  createdBy: string;
  importedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RadarCandidateFilters {
  workspaceId: string;
  niche?: RadarNiche;
  status?: RadarCandidateStatus;
  tier?: RadarSourceTier;
  minScore?: number;
  query?: string;
  windowHours?: number;
  limit?: number;
  offset?: number;
}

interface RadarOwnerContext {
  workspaceId: string;
  actorId: string;
}

const radarQuery = (workspaceId: string, values: Record<string, unknown>) => {
  const params = new URLSearchParams({ workspace: workspaceId });
  for (const [key, value] of Object.entries(values)) {
    if (key === 'workspaceId' || value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  return params.toString();
};

const ownerHeaders = (actorId: string) => {
  const resolved = actorId.trim();
  if (!resolved) throw new Error('Actor autentik wajib tersedia untuk aksi Owner.');
  return { 'x-actor-id': resolved };
};

export async function fetchRadarCandidates(filters: RadarCandidateFilters): Promise<RadarCandidateRecord[]> {
  const payload = await request<{ candidates: RadarCandidateRecord[] }>(
    `/api/content-radar/candidates?${radarQuery(filters.workspaceId, {
      niche: filters.niche,
      status: filters.status,
      tier: filters.tier,
      minScore: filters.minScore,
      query: filters.query,
      window: filters.windowHours,
      limit: filters.limit,
      offset: filters.offset,
    })}`,
  );
  return payload.candidates ?? [];
}

export async function fetchRadarCandidate(workspaceId: string, id: string): Promise<RadarCandidateRecord> {
  const payload = await request<{ candidate: RadarCandidateRecord }>(
    `/api/content-radar/candidates/${encodeURIComponent(id)}?${radarQuery(workspaceId, {})}`,
  );
  return payload.candidate;
}

export async function fetchRadarSources(input: {
  workspaceId: string;
  tier?: RadarSourceTier;
  kind?: RadarSourceKind;
  enabled?: boolean;
  limit?: number;
}): Promise<RadarSourceRecord[]> {
  const payload = await request<{ sources: RadarSourceRecord[] }>(
    `/api/content-radar/sources?${radarQuery(input.workspaceId, input)}`,
  );
  return payload.sources ?? [];
}

export async function fetchRadarRuns(input: {
  workspaceId: string;
  kind?: RadarRun['kind'];
  status?: RadarRunStatus;
  limit?: number;
}): Promise<RadarRun[]> {
  const payload = await request<{ runs: RadarRun[] }>(
    `/api/content-radar/runs?${radarQuery(input.workspaceId, input)}`,
  );
  return payload.runs ?? [];
}

export async function fetchRadarDrafts(input: {
  workspaceId: string;
  unimported?: boolean;
  limit?: number;
}): Promise<RadarDraftRecord[]> {
  const payload = await request<{ drafts: RadarDraftRecord[] }>(
    `/api/content-radar/drafts?${radarQuery(input.workspaceId, input)}`,
  );
  return payload.drafts ?? [];
}

export async function createRadarDraft(candidateId: string, context: RadarOwnerContext): Promise<RadarDraftRecord> {
  const payload = await request<{ draft: RadarDraftRecord }>(
    `/api/content-radar/candidates/${encodeURIComponent(candidateId)}/draft`,
    {
      method: 'POST',
      headers: ownerHeaders(context.actorId),
      body: JSON.stringify({ workspaceId: context.workspaceId }),
    },
  );
  return payload.draft;
}

export async function rejectRadarCandidate(
  candidateId: string,
  input: RadarOwnerContext & { reason: string },
): Promise<RadarCandidateRecord> {
  const payload = await request<{ candidate: RadarCandidateRecord }>(
    `/api/content-radar/candidates/${encodeURIComponent(candidateId)}/reject`,
    {
      method: 'POST',
      headers: ownerHeaders(input.actorId),
      body: JSON.stringify({ workspaceId: input.workspaceId, reason: input.reason }),
    },
  );
  return payload.candidate;
}

export async function reclassifyRadarCandidate(
  candidateId: string,
  input: RadarOwnerContext & { niche: RadarNiche },
): Promise<RadarCandidateRecord> {
  const payload = await request<{ candidate: RadarCandidateRecord }>(
    `/api/content-radar/candidates/${encodeURIComponent(candidateId)}`,
    {
      method: 'PATCH',
      headers: ownerHeaders(input.actorId),
      body: JSON.stringify({ workspaceId: input.workspaceId, niche: input.niche }),
    },
  );
  return payload.candidate;
}

export async function updateRadarSource(
  sourceId: string,
  input: RadarOwnerContext & Partial<Pick<RadarSourceRecord, 'tier' | 'kind' | 'enabled' | 'requiresCrosscheck' | 'notes'>>,
): Promise<RadarSourceRecord> {
  const { workspaceId, actorId, ...patch } = input;
  const payload = await request<{ source: RadarSourceRecord }>(
    `/api/content-radar/sources/${encodeURIComponent(sourceId)}`,
    {
      method: 'PATCH',
      headers: ownerHeaders(actorId),
      body: JSON.stringify({ workspaceId, ...patch }),
    },
  );
  return payload.source;
}

export async function acknowledgeRadarDraftImport(
  draftId: string,
  context: { workspaceId: string; actorId: string },
): Promise<{ ok: boolean; draftId: string; importedAt: string; alreadyImported: boolean }> {
  const payload = await request<{ ok: boolean; draftId: string; importedAt: string; alreadyImported: boolean }>(
    `/api/content-radar/drafts/${encodeURIComponent(draftId)}/imported`,
    {
      method: 'POST',
      headers: ownerHeaders(context.actorId),
      body: JSON.stringify({ workspaceId: context.workspaceId }),
    },
  );
  return payload;
}
