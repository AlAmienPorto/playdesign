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
  const token = getOfficeToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'ja',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 401) {
    clearOfficeToken();
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
