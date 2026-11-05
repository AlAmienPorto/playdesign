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

export interface OfficeSnapshot {
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
  error?: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  props: Record<string, unknown>;
}

export async function fetchVideoTemplates(): Promise<VideoTemplate[]> {
  const payload = await request<{ templates: VideoTemplate[] }>('/api/video/templates');
  return payload.templates ?? [];
}

export async function fetchVideoJobs(limit = 20): Promise<VideoJob[]> {
  const payload = await request<{ jobs: VideoJob[] }>(`/api/video/jobs?workspace=playdesign&limit=${limit}`);
  return payload.jobs ?? [];
}

export async function createVideoJob(input: {
  templateId: string;
  title: string;
  props: Record<string, unknown>;
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
