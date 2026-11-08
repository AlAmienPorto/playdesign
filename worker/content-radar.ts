/**
 * Content Radar API — read, ingest, score, draft, and registry routes.
 *
 * Mounted by worker/index.ts for `/api/content-radar/*`. Identity is fixed
 * server-side: the `RADAR_API_TOKEN` bearer maps to `radar-agent`, every other
 * caller resolves through the existing actor/workspace lookup. Factual score
 * components are recomputed from D1 state; the runner only supplies the
 * discrete Hermes judgement values plus its reason.
 */

import type { CarouselDocument } from "../src/data/types";
import {
  canonicalizeRadarUrl,
  computeRadarScore,
  isAutoDraftEligible,
  type RadarCandidate,
  type RadarCandidateStatus,
  type RadarDraftSource,
  type RadarNiche,
  type RadarRiskFlag,
  type RadarScore,
  type RadarScoreComponents,
  type RadarScoreInput,
  type RadarScoreInputSnapshot,
  type RadarSourceTier,
} from "../src/lib/content-radar";
import type { Env } from "./index";

export interface RadarActor {
  id: string;
  name: string;
  role: "owner" | "spv" | "operator";
  workspaceId: string;
}

export interface RadarAuditInput {
  workspaceId: string;
  entityType: "report";
  entityId: string;
  actor: { id: string; role: "owner" | "spv" | "operator" | "agent" };
  action: string;
  result?: "ok" | "failed" | "pending" | "denied";
  meta?: string | null;
}

export interface RadarContext {
  json: (body: unknown, status?: number, extra?: Record<string, string>) => Response;
  fail: (status: number, code: string, message: string, details?: unknown) => never;
  readJson: (req: Request) => Promise<Record<string, unknown>>;
  str: (value: unknown, field: string, min?: number, max?: number) => string;
  optionalStr: (value: unknown, field: string, max?: number) => string | undefined;
  optionalInt: (value: unknown, field: string, min: number, max: number) => number | undefined;
  oneOf: <T extends string>(value: unknown, field: string, allowed: readonly T[]) => T;
  assertToken: (req: Request, env: Env) => Promise<void>;
  authenticate: (env: Env, workspaceId: string, req: Request) => Promise<RadarActor>;
  requireOwner: (actor: RadarActor) => void;
  assertWorkspace: (env: Env, raw: unknown) => Promise<string>;
  auditStatement: (env: Env, input: RadarAuditInput) => D1PreparedStatement;
  machineActor: (req: Request) => "radar-agent" | null;
  uid: (prefix: string) => string;
  nowIso: () => string;
}

const NICHES = ["ai", "technology", "design", "security", "internet", "crypto"] as const;
const SOURCE_TIERS = ["A", "B", "C", "D", "unverified"] as const;
const SOURCE_KINDS = [
  "official",
  "media",
  "community",
  "regulator",
  "research",
  "project",
  "discovered",
] as const;
const CANDIDATE_STATUSES = ["new", "qualified", "rejected", "drafted", "archived"] as const;
const PUBLISHED_AT_SOURCES = ["publisher", "feed", "discovered", "unknown"] as const;
const RELATIONS = ["primary", "crosscheck", "signal"] as const;
const RUN_KINDS = ["collector", "selector"] as const;
const RUN_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
const TERMINAL_RUN_STATUSES = ["succeeded", "failed", "cancelled"] as const;
const RELEVANCE_VALUES = [0, 8, 13, 18, 21, 25] as const;
const POTENTIAL_VALUES = [0, 3, 5, 8, 10] as const;
const RISK_FLAGS = [
  "context_required",
  "disclaimer_required",
  "rumor",
  "defamation",
  "license_conflict",
  "health_claim",
  "financial_claim",
  "investment_solicitation",
  "price_prediction",
  "token_shilling",
  "referral_affiliate",
] as const;
const DOCUMENT_TEMPLATES = ["split-brand", "split-dark", "full-image"] as const;
const SLIDE_KINDS = ["cover", "text"] as const;
const AUTO_DRAFT_DAILY_CAP = 3;
const AUTO_DRAFT_CRYPTO_CAP = 1;
const RUN_STALE_MS = 30 * 60 * 1000;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DOCUMENT_MAX_BYTES = 64 * 1024;
const DOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const CANDIDATE_COLUMNS = `id, cluster_key, canonical_url, title, summary, published_at, published_at_source,
  discovered_at, last_seen_at, timestamp_fallback, niche, language, status, source_domain, source_tier,
  score_components, score_total, rubric_version, score_input_snapshot, score_reason, risk_flags,
  rejection_reason, draft_id, created_at, updated_at`;

interface CandidateRow {
  id: string;
  cluster_key: string;
  canonical_url: string;
  title: string;
  summary: string;
  published_at: string | null;
  published_at_source: string | null;
  discovered_at: string;
  last_seen_at: string;
  timestamp_fallback: number;
  niche: string;
  language: string;
  status: string;
  source_domain: string;
  source_tier: string;
  score_components: string;
  score_total: number;
  rubric_version: string;
  score_input_snapshot: string;
  score_reason: string;
  risk_flags: string;
  rejection_reason: string | null;
  draft_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CandidateRef {
  id: string;
  cluster_key: string;
  niche: string;
  draft_id: string | null;
}

interface SourceRow {
  workspace_id: string;
  id: string;
  domain: string;
  name: string;
  tier: string;
  kind: string;
  niches: string;
  feed_url: string | null;
  enabled: number;
  requires_crosscheck: number;
  verified_at: string | null;
  verified_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ProvenanceRow {
  id: string;
  candidate_id: string;
  source_id: string;
  canonical_url: string;
  source_domain: string;
  relation: string;
  title: string;
  published_at: string | null;
  evidence_excerpt: string | null;
  discovered_at: string;
  tier: string;
  name: string;
  enabled: number;
}

interface RunRow {
  id: string;
  kind: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  heartbeat_at: string | null;
  fetched_count: number;
  new_count: number;
  updated_count: number;
  qualified_count: number;
  drafted_count: number;
  rejected_count: number;
  error: string | null;
  meta: string;
  created_at: string;
  updated_at: string;
}

interface DraftRow {
  id: string;
  candidate_id: string;
  post_id: string;
  cluster_key: string;
  auto_date_wib: string | null;
  creation_kind: string;
  title: string;
  document: string;
  status: string;
  score_snapshot: string;
  sources_snapshot: string;
  created_by: string;
  imported_at: string | null;
  created_at: string;
  updated_at: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readJsonColumn(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const readRecordColumn = (raw: string | null | undefined): Record<string, unknown> => {
  const value = readJsonColumn(raw);
  return isRecord(value) ? value : {};
};

const readArrayColumn = <T>(raw: string | null | undefined): T[] => {
  const value = readJsonColumn(raw);
  return Array.isArray(value) ? (value as T[]) : [];
};

const wibDate = (iso: string) => new Date(Date.parse(iso) + WIB_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Deterministic, collision-resistant source id: `src-<slug>-<8 hex of SHA-256(domain)>`.
 * The slug alone is ambiguous (`foo.bar.com` and `foo-bar.com` both slug to
 * `foo-bar-com`), and the id is half of the sources primary key, so a bare slug
 * could make two real domains impossible to register in one workspace.
 */
const sourceIdForDomain = async (domain: string): Promise<string> => {
  const slug = domain.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "domain";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(domain));
  const suffix = [...new Uint8Array(digest).slice(0, 4)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `src-${slug}-${suffix}`;
};

const hostOf = (url: string) => new URL(url).hostname.toLowerCase();

function queryInt(
  ctx: RadarContext,
  raw: string | null,
  field: string,
  min: number,
  max: number,
  fallback: number,
): number {
  if (raw === null || raw.trim() === "") return fallback;
  const parsed = ctx.optionalInt(Number(raw), field, min, max);
  return parsed === undefined ? fallback : parsed;
}

function discrete<T extends number>(
  ctx: RadarContext,
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "number" || !allowed.includes(value as T)) {
    return ctx.fail(400, "validation_failed", `${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

function requireDomain(ctx: RadarContext, value: unknown, field: string): string {
  const raw = ctx.str(value, field, 3, 253).toLowerCase();
  if (!DOMAIN_PATTERN.test(raw)) {
    return ctx.fail(400, "validation_failed", `${field} must be a bare lowercase domain.`);
  }
  return raw;
}

function optionalTimestamp(ctx: RadarContext, value: unknown, field: string): string | null {
  const raw = ctx.optionalStr(value, field, 40);
  if (raw === undefined) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    return ctx.fail(400, "validation_failed", `${field} must be an ISO-8601 timestamp.`);
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    return ctx.fail(400, "validation_failed", `${field} must be an ISO-8601 timestamp.`);
  }
  return new Date(parsed).toISOString();
}

function canonicalUrl(ctx: RadarContext, value: unknown, field: string): string {
  const raw = ctx.str(value, field, 1, 2000);
  try {
    return canonicalizeRadarUrl(raw);
  } catch {
    return ctx.fail(400, "invalid_canonical_url", `${field} must be an absolute HTTP(S) URL.`);
  }
}

function hashtagList(ctx: RadarContext, value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    return ctx.fail(400, "invalid_document", "document.hashtags must be an array.");
  }
  return value.map((tag, index) => ctx.str(tag, `document.hashtags[${index}]`, 1, 60));
}

function radarDocument(ctx: RadarContext, value: unknown): CarouselDocument {
  if (!isRecord(value)) {
    return ctx.fail(400, "invalid_document", "document must be an object.");
  }
  if (!Array.isArray(value.slides) || value.slides.length < 4 || value.slides.length > 8) {
    return ctx.fail(400, "invalid_document", "document.slides must contain 4 to 8 slides.");
  }
  const slides = value.slides.map((slide, index) => {
    if (!isRecord(slide)) {
      return ctx.fail(400, "invalid_document", `document.slides[${index}] must be an object.`);
    }
    return {
      id: ctx.optionalStr(slide.id, `document.slides[${index}].id`, 80) ?? `slide-${index + 1}`,
      kind: ctx.oneOf(
        slide.kind ?? (index === 0 ? "cover" : "text"),
        `document.slides[${index}].kind`,
        SLIDE_KINDS,
      ),
      title: ctx.str(slide.title, `document.slides[${index}].title`, 1, 200),
      body: ctx.optionalStr(slide.body, `document.slides[${index}].body`, 1200) ?? "",
    };
  });
  const sourceUrl = canonicalUrl(ctx, value.sourceUrl, "document.sourceUrl");
  const coverImageUrl = ctx.optionalStr(value.coverImageUrl, "document.coverImageUrl", 2000);
  if (coverImageUrl !== undefined) {
    try {
      canonicalizeRadarUrl(coverImageUrl);
    } catch {
      return ctx.fail(400, "invalid_document", "document.coverImageUrl must be an HTTP(S) URL.");
    }
  }
  const document: CarouselDocument = {
    kicker: ctx.optionalStr(value.kicker, "document.kicker", 120) ?? "",
    template: ctx.oneOf(value.template ?? "split-brand", "document.template", DOCUMENT_TEMPLATES),
    headline: ctx.optionalStr(value.headline, "document.headline", 300) ?? slides[0].title,
    highlight: ctx.optionalStr(value.highlight, "document.highlight", 200) ?? "",
    sourceName: ctx.optionalStr(value.sourceName, "document.sourceName", 200) ?? hostOf(sourceUrl),
    sourceUrl,
    coverImageUrl: coverImageUrl ?? "",
    slides,
    caption: ctx.optionalStr(value.caption, "document.caption", 2000) ?? "",
    hashtags: hashtagList(ctx, value.hashtags),
    updatedAt: ctx.nowIso(),
  };
  if (JSON.stringify(document).length > DOCUMENT_MAX_BYTES) {
    return ctx.fail(400, "invalid_document", "document exceeds 64 KB.");
  }
  return document;
}

function scaffoldDocument(ctx: RadarContext, row: CandidateRow): CarouselDocument {
  const summary = row.summary || row.title;
  return {
    kicker: row.niche.toUpperCase(),
    template: "split-brand",
    headline: row.title,
    highlight: "",
    sourceName: row.source_domain,
    sourceUrl: row.canonical_url,
    coverImageUrl: "",
    slides: [
      { id: "slide-1", kind: "cover", title: row.title, body: "" },
      { id: "slide-2", kind: "text", title: "Ringkasan", body: summary },
      { id: "slide-3", kind: "text", title: "Sumber", body: row.source_domain },
      { id: "slide-4", kind: "text", title: "Baca selengkapnya", body: row.canonical_url },
    ],
    caption: summary,
    hashtags: [],
    updatedAt: ctx.nowIso(),
  };
}

const scoreFromRow = (row: CandidateRow): RadarScore => ({
  rubricVersion: "v1",
  components: readRecordColumn(row.score_components) as unknown as RadarScoreComponents,
  total: row.score_total,
  inputSnapshot: readRecordColumn(row.score_input_snapshot) as unknown as RadarScoreInputSnapshot,
});

const candidateView = (row: CandidateRow) => ({
  id: row.id,
  clusterKey: row.cluster_key,
  canonicalUrl: row.canonical_url,
  title: row.title,
  summary: row.summary,
  publishedAt: row.published_at,
  publishedAtSource: row.published_at_source,
  discoveredAt: row.discovered_at,
  lastSeenAt: row.last_seen_at,
  timestampFallback: row.timestamp_fallback === 1,
  niche: row.niche,
  language: row.language,
  status: row.status,
  sourceDomain: row.source_domain,
  sourceTier: row.source_tier,
  score: {
    rubricVersion: row.rubric_version,
    components: readRecordColumn(row.score_components),
    total: row.score_total,
    inputSnapshot: readRecordColumn(row.score_input_snapshot),
  },
  scoreReason: row.score_reason,
  riskFlags: readArrayColumn<string>(row.risk_flags),
  rejectionReason: row.rejection_reason,
  draftId: row.draft_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const sourceView = (row: SourceRow) => ({
  id: row.id,
  domain: row.domain,
  name: row.name,
  tier: row.tier,
  kind: row.kind,
  niches: readArrayColumn<string>(row.niches),
  feedUrl: row.feed_url,
  enabled: row.enabled === 1,
  requiresCrosscheck: row.requires_crosscheck === 1,
  verifiedAt: row.verified_at,
  verifiedBy: row.verified_by,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const provenanceView = (row: ProvenanceRow) => ({
  id: row.id,
  url: row.canonical_url,
  domain: row.source_domain,
  relation: row.relation,
  title: row.title,
  publishedAt: row.published_at,
  excerpt: row.evidence_excerpt,
  tier: row.tier,
  name: row.name,
  enabled: row.enabled === 1,
});

const runView = (row: RunRow) => ({
  id: row.id,
  kind: row.kind,
  status: row.status,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  heartbeatAt: row.heartbeat_at,
  counts: {
    fetched: row.fetched_count,
    new: row.new_count,
    updated: row.updated_count,
    qualified: row.qualified_count,
    drafted: row.drafted_count,
    rejected: row.rejected_count,
  },
  error: row.error,
  meta: readRecordColumn(row.meta),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const draftView = (row: DraftRow) => ({
  id: row.id,
  candidateId: row.candidate_id,
  postId: row.post_id,
  clusterKey: row.cluster_key,
  title: row.title,
  status: row.status,
  creationKind: row.creation_kind,
  autoDateWib: row.auto_date_wib,
  document: readRecordColumn(row.document),
  scoreSnapshot: readRecordColumn(row.score_snapshot),
  sourcesSnapshot: readArrayColumn<RadarDraftSource>(row.sources_snapshot),
  createdBy: row.created_by,
  importedAt: row.imported_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

type Credential = { kind: "agent"; id: string } | { kind: "human" };

/**
 * Step 1 of every radar request: prove the caller is allowed to talk to the
 * API at all. Nothing workspace-shaped happens before this, so an
 * unauthenticated caller cannot tell an existing workspace id from a missing
 * one.
 */
async function verifyCredential(req: Request, env: Env, ctx: RadarContext): Promise<Credential> {
  const agent = ctx.machineActor(req);
  if (agent) return { kind: "agent", id: agent };
  await ctx.assertToken(req, env);
  return { kind: "human" };
}

/**
 * Step 2: resolve the workspace. The machine identity is bound to
 * `RADAR_WORKSPACE_ID` and fails closed when that binding is missing, so one
 * leaked collector secret cannot read or write another workspace's Radar data.
 *
 * The requested id is compared against the binding *before* `assertWorkspace`,
 * so a bound machine gets the same `403 forbidden_workspace` whether the
 * workspace it names exists or not — the machine cannot enumerate workspaces
 * with a valid secret either.
 */
async function resolveWorkspace(
  env: Env,
  ctx: RadarContext,
  credential: Credential,
  raw: unknown,
): Promise<string> {
  if (credential.kind === "human") return ctx.assertWorkspace(env, raw);
  const bound = env.RADAR_WORKSPACE_ID?.trim();
  if (!bound) {
    return ctx.fail(
      503,
      "machine_not_configured",
      "RADAR_WORKSPACE_ID is not configured. Bind the machine identity to one workspace before serving ingest.",
    );
  }
  const trimmed = typeof raw === "string" ? raw.trim() : raw;
  const requested = trimmed === undefined || trimmed === null || trimmed === "" ? bound : trimmed;
  if (typeof requested === "string" && requested !== bound) {
    return ctx.fail(403, "forbidden_workspace", "The radar-agent identity is bound to another workspace.");
  }
  const workspaceId = await ctx.assertWorkspace(env, requested);
  if (workspaceId !== bound) {
    return ctx.fail(403, "forbidden_workspace", "The radar-agent identity is bound to another workspace.");
  }
  return workspaceId;
}

/** Step 3 (human callers only): resolve the workspace actor. */
async function resolveActor(
  env: Env,
  workspaceId: string,
  req: Request,
  ctx: RadarContext,
): Promise<RadarActor> {
  return ctx.authenticate(env, workspaceId, req);
}

/** Shared read-path gate: credential, then workspace, then actor. */
async function authorizeRead(
  req: Request,
  env: Env,
  ctx: RadarContext,
  rawWorkspace: unknown,
): Promise<string> {
  const credential = await verifyCredential(req, env, ctx);
  const workspaceId = await resolveWorkspace(env, ctx, credential, rawWorkspace);
  if (credential.kind === "human") await resolveActor(env, workspaceId, req, ctx);
  return workspaceId;
}

/**
 * Owner-only routes need an explicit `x-actor-id`; the shared API_TOKEN must not
 * inherit an implicit human identity, otherwise the collector/script secret
 * silently becomes an Owner.
 */
function requireActorHeader(req: Request, ctx: RadarContext): string {
  const header = (req.headers.get("x-actor-id") ?? "").trim();
  if (!header) {
    return ctx.fail(400, "actor_required", "An explicit x-actor-id header is required for Owner actions.");
  }
  return header;
}

function requireAgent(req: Request, ctx: RadarContext): string {
  const agent = ctx.machineActor(req);
  if (!agent) {
    return ctx.fail(403, "forbidden_machine_only", "This endpoint requires the Content Radar machine token.");
  }
  return agent;
}

/**
 * Authenticated Owner resolution for the three human-only mutations. The
 * machine identity is refused before any workspace lookup.
 */
async function requireOwnerActor(
  req: Request,
  env: Env,
  ctx: RadarContext,
  credential: Credential,
  rawWorkspace: unknown,
): Promise<{ workspaceId: string; actor: RadarActor }> {
  if (credential.kind === "agent") {
    return ctx.fail(
      403,
      "forbidden_owner_only",
      "The radar-agent identity cannot change the registry or create manual drafts.",
    );
  }
  requireActorHeader(req, ctx);
  const workspaceId = await ctx.assertWorkspace(env, rawWorkspace);
  const actor = await resolveActor(env, workspaceId, req, ctx);
  ctx.requireOwner(actor);
  return { workspaceId, actor };
}

interface TrustView {
  tier: RadarSourceTier;
  primary: boolean;
  crossChecks: { domain: string; tier: RadarSourceTier }[];
}

/**
 * Trust is derived from the registry, never from the request or from the stored
 * score snapshot: a `primary` provenance row only counts when its domain is a
 * registered, enabled, non-`unverified` source, and a cross-check only counts
 * when it comes from a registered, enabled, non-`unverified` domain.
 */
async function loadTrust(
  env: Env,
  workspaceId: string,
  row: CandidateRow,
): Promise<{ trust: TrustView; provenance: ProvenanceRow[] }> {
  const registry = await env.DB.prepare(
    `SELECT tier, enabled FROM content_radar_sources WHERE workspace_id = ? AND domain = ?`,
  )
    .bind(workspaceId, row.source_domain)
    .first<{ tier: string; enabled: number }>();
  const tier = (registry?.tier ?? "unverified") as RadarSourceTier;
  const trusted = (entry: ProvenanceRow) => entry.enabled === 1 && entry.tier !== "unverified";
  const originTrusted = registry?.enabled === 1 && tier !== "unverified";
  const provenance = await loadProvenance(env, workspaceId, row.id);
  return {
    provenance,
    trust: {
      tier,
      primary:
        originTrusted &&
        provenance.some(
          (entry) =>
            entry.relation === "primary" && entry.source_domain === row.source_domain && trusted(entry),
        ),
      crossChecks: provenance
        .filter(
          (entry) =>
            entry.relation === "crosscheck" &&
            entry.source_domain !== row.source_domain &&
            trusted(entry),
        )
        .map((entry) => ({ domain: entry.source_domain, tier: entry.tier as RadarSourceTier })),
    },
  };
}

async function loadCandidate(env: Env, workspaceId: string, id: string) {
  return env.DB.prepare(
    `SELECT ${CANDIDATE_COLUMNS} FROM content_radar_candidates WHERE workspace_id = ? AND id = ?`,
  )
    .bind(workspaceId, id)
    .first<CandidateRow>();
}

async function loadProvenance(env: Env, workspaceId: string, candidateId: string) {
  const rows = await env.DB.prepare(
    `SELECT cs.id, cs.candidate_id, cs.source_id, cs.canonical_url, cs.source_domain, cs.relation,
            cs.title, cs.published_at, cs.evidence_excerpt, cs.discovered_at,
            COALESCE(s.tier, 'unverified') AS tier,
            COALESCE(s.name, cs.source_domain) AS name,
            COALESCE(s.enabled, 1) AS enabled
       FROM content_radar_candidate_sources cs
       LEFT JOIN content_radar_sources s
         ON s.workspace_id = cs.workspace_id AND s.id = cs.source_id
      WHERE cs.workspace_id = ? AND cs.candidate_id = ?
      ORDER BY CASE cs.relation WHEN 'primary' THEN 0 WHEN 'crosscheck' THEN 1 ELSE 2 END,
               cs.canonical_url ASC`,
  )
    .bind(workspaceId, candidateId)
    .all<ProvenanceRow>();
  return rows.results ?? [];
}

const countAutomaticDrafts = async (env: Env, workspaceId: string, date: string) => {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM content_radar_drafts
      WHERE workspace_id = ? AND creation_kind = 'automatic' AND auto_date_wib = ?`,
  )
    .bind(workspaceId, date)
    .first<{ total: number }>();
  return row?.total ?? 0;
};

const countCryptoDrafts = async (env: Env, workspaceId: string, date: string) => {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM content_radar_drafts d
       JOIN content_radar_candidates c
         ON c.workspace_id = d.workspace_id AND c.id = d.candidate_id
      WHERE d.workspace_id = ? AND d.creation_kind = 'automatic' AND d.auto_date_wib = ?
        AND c.niche = 'crypto'`,
  )
    .bind(workspaceId, date)
    .first<{ total: number }>();
  return row?.total ?? 0;
};

function uniqueDraftConflict(ctx: RadarContext, message: string): never {
  if (message.includes("content_radar_drafts.workspace_id, content_radar_drafts.auto_date_wib")) {
    ctx.fail(409, "cluster_already_drafted", "This cluster already produced an automatic draft today.");
  }
  if (message.includes("content_radar_drafts.workspace_id, content_radar_drafts.candidate_id")) {
    ctx.fail(409, "candidate_already_drafted", "This candidate already has a draft.");
  }
  ctx.fail(409, "draft_conflict", "The draft could not be created because it conflicts with existing data.");
}

export async function routeContentRadar(
  req: Request,
  env: Env,
  ctx: RadarContext,
): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/api/content-radar" && !path.startsWith("/api/content-radar/")) return null;
  const sub = path.slice("/api/content-radar".length) || "/";
  const method = req.method;

  if (sub === "/candidates" && method === "GET") return listCandidates(req, env, ctx);
  if (sub === "/candidates:ingest" && method === "POST") return ingestCandidates(req, env, ctx);
  if (sub === "/sources" && method === "GET") return listSources(req, env, ctx);
  if (sub === "/runs" && method === "GET") return listRuns(req, env, ctx);
  if (sub === "/runs" && method === "POST") return createRun(req, env, ctx);
  if (sub === "/drafts" && method === "GET") return listDrafts(req, env, ctx);
  if (sub === "/internal/runs:force" && method === "POST") return forceRun(req, env, ctx);

  const candidateMatch = /^\/candidates\/([^/]+)$/.exec(sub);
  if (candidateMatch && method === "GET") {
    return getCandidate(req, env, ctx, decodeURIComponent(candidateMatch[1]));
  }
  const scoreMatch = /^\/candidates\/([^/]+)\/score$/.exec(sub);
  if (scoreMatch && method === "POST") {
    return scoreCandidate(req, env, ctx, decodeURIComponent(scoreMatch[1]));
  }
  const draftMatch = /^\/candidates\/([^/]+)\/draft$/.exec(sub);
  if (draftMatch && method === "POST") {
    return createDraft(req, env, ctx, decodeURIComponent(draftMatch[1]));
  }
  const rejectMatch = /^\/candidates\/([^/]+)\/reject$/.exec(sub);
  if (rejectMatch && method === "POST") {
    return rejectCandidate(req, env, ctx, decodeURIComponent(rejectMatch[1]));
  }
  const sourceMatch = /^\/sources\/([^/]+)$/.exec(sub);
  if (sourceMatch && method === "PATCH") {
    return patchSource(req, env, ctx, decodeURIComponent(sourceMatch[1]));
  }
  const runMatch = /^\/runs\/([^/]+)$/.exec(sub);
  if (runMatch && method === "POST") {
    return updateRun(req, env, ctx, decodeURIComponent(runMatch[1]));
  }
  const importedMatch = /^\/drafts\/([^/]+)\/imported$/.exec(sub);
  if (importedMatch && method === "POST") {
    return acknowledgeDraft(req, env, ctx, decodeURIComponent(importedMatch[1]));
  }

  return ctx.fail(404, "not_found", "Unknown Content Radar route.");
}

async function listCandidates(req: Request, env: Env, ctx: RadarContext) {
  const url = new URL(req.url);
  const workspaceId = await authorizeRead(req, env, ctx, url.searchParams.get("workspace"));

  const status = url.searchParams.get("status");
  const niche = url.searchParams.get("niche");
  const tier = url.searchParams.get("tier");
  const search = url.searchParams.get("query");
  const minScore = queryInt(ctx, url.searchParams.get("minScore"), "minScore", 0, 100, 50);
  const windowHours = queryInt(ctx, url.searchParams.get("window"), "window", 1, 168, 24);
  const limit = queryInt(ctx, url.searchParams.get("limit"), "limit", 1, 200, 50);
  const offset = queryInt(ctx, url.searchParams.get("offset"), "offset", 0, 100_000, 0);

  const where = ["workspace_id = ?"];
  const params: (string | number)[] = [workspaceId];
  if (status !== null && status !== "") {
    where.push("status = ?");
    params.push(ctx.oneOf(status, "status", CANDIDATE_STATUSES));
  }
  if (niche !== null && niche !== "") {
    where.push("niche = ?");
    params.push(ctx.oneOf(niche, "niche", NICHES));
  }
  if (tier !== null && tier !== "") {
    where.push("source_tier = ?");
    params.push(ctx.oneOf(tier, "tier", SOURCE_TIERS));
  }
  if (search !== null && search.trim() !== "") {
    const term = `%${ctx.str(search, "query", 1, 120).replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    where.push("(title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\')");
    params.push(term, term);
  }
  where.push("score_total >= ?");
  params.push(minScore);
  where.push("COALESCE(published_at, discovered_at) >= ?");
  params.push(new Date(Date.now() - windowHours * 3_600_000).toISOString());
  where.push("COALESCE(published_at, discovered_at) <= ?");
  params.push(ctx.nowIso());

  const rows = await env.DB.prepare(
    `SELECT ${CANDIDATE_COLUMNS} FROM content_radar_candidates
      WHERE ${where.join(" AND ")}
      ORDER BY score_total DESC, COALESCE(published_at, discovered_at) DESC, id ASC
      LIMIT ? OFFSET ?`,
  )
    .bind(...params, limit, offset)
    .all<CandidateRow>();
  const candidates = (rows.results ?? []).map(candidateView);
  return ctx.json({
    candidates,
    pagination: { limit, offset, count: candidates.length, hasMore: candidates.length === limit },
  });
}

async function getCandidate(req: Request, env: Env, ctx: RadarContext, id: string) {
  const url = new URL(req.url);
  const workspaceId = await authorizeRead(req, env, ctx, url.searchParams.get("workspace"));
  const row = await loadCandidate(env, workspaceId, id);
  if (!row) return ctx.fail(404, "candidate_not_found", "Unknown candidate.");
  const sources = await loadProvenance(env, workspaceId, id);
  return ctx.json({ candidate: { ...candidateView(row), sources: sources.map(provenanceView) } });
}

async function listSources(req: Request, env: Env, ctx: RadarContext) {
  const url = new URL(req.url);
  const workspaceId = await authorizeRead(req, env, ctx, url.searchParams.get("workspace"));
  const tier = url.searchParams.get("tier");
  const kind = url.searchParams.get("kind");
  const enabled = url.searchParams.get("enabled");
  const limit = queryInt(ctx, url.searchParams.get("limit"), "limit", 1, 200, 50);
  const offset = queryInt(ctx, url.searchParams.get("offset"), "offset", 0, 100_000, 0);

  const where = ["workspace_id = ?"];
  const params: (string | number)[] = [workspaceId];
  if (tier !== null && tier !== "") {
    where.push("tier = ?");
    params.push(ctx.oneOf(tier, "tier", SOURCE_TIERS));
  }
  if (kind !== null && kind !== "") {
    where.push("kind = ?");
    params.push(ctx.oneOf(kind, "kind", SOURCE_KINDS));
  }
  if (enabled !== null && enabled !== "") {
    where.push("enabled = ?");
    params.push(ctx.oneOf(enabled, "enabled", ["true", "false"] as const) === "true" ? 1 : 0);
  }

  const rows = await env.DB.prepare(
    `SELECT workspace_id, id, domain, name, tier, kind, niches, feed_url, enabled,
            requires_crosscheck, verified_at, verified_by, notes, created_at, updated_at
       FROM content_radar_sources
      WHERE ${where.join(" AND ")}
      ORDER BY tier ASC, domain ASC
      LIMIT ? OFFSET ?`,
  )
    .bind(...params, limit, offset)
    .all<SourceRow>();
  const sources = (rows.results ?? []).map(sourceView);
  return ctx.json({
    sources,
    pagination: { limit, offset, count: sources.length, hasMore: sources.length === limit },
  });
}

async function listRuns(req: Request, env: Env, ctx: RadarContext) {
  const url = new URL(req.url);
  const workspaceId = await authorizeRead(req, env, ctx, url.searchParams.get("workspace"));
  const kind = url.searchParams.get("kind");
  const status = url.searchParams.get("status");
  const limit = queryInt(ctx, url.searchParams.get("limit"), "limit", 1, 100, 20);
  const offset = queryInt(ctx, url.searchParams.get("offset"), "offset", 0, 100_000, 0);

  const where = ["workspace_id = ?"];
  const params: string[] = [workspaceId];
  if (kind !== null && kind !== "") {
    where.push("kind = ?");
    params.push(ctx.oneOf(kind, "kind", RUN_KINDS));
  }
  if (status !== null && status !== "") {
    where.push("status = ?");
    params.push(ctx.oneOf(status, "status", RUN_STATUSES));
  }

  const rows = await env.DB.prepare(
    `SELECT id, kind, status, started_at, finished_at, heartbeat_at, fetched_count, new_count,
            updated_count, qualified_count, drafted_count, rejected_count, error, meta,
            created_at, updated_at
       FROM content_radar_runs
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC, id ASC
      LIMIT ? OFFSET ?`,
  )
    .bind(...params, limit, offset)
    .all<RunRow>();
  const runs = (rows.results ?? []).map(runView);
  return ctx.json({
    runs,
    pagination: { limit, offset, count: runs.length, hasMore: runs.length === limit },
  });
}

async function listDrafts(req: Request, env: Env, ctx: RadarContext) {
  const url = new URL(req.url);
  const workspaceId = await authorizeRead(req, env, ctx, url.searchParams.get("workspace"));
  const unimported = url.searchParams.get("unimported");
  if (unimported !== null && unimported !== "" && unimported !== "true" && unimported !== "false") {
    return ctx.fail(400, "validation_failed", "unimported must be true or false.");
  }
  const limit = queryInt(ctx, url.searchParams.get("limit"), "limit", 1, 200, 50);
  const offset = queryInt(ctx, url.searchParams.get("offset"), "offset", 0, 100_000, 0);

  const where = ["workspace_id = ?"];
  const params: (string | number)[] = [workspaceId];
  if (unimported === "true") where.push("imported_at IS NULL");

  const rows = await env.DB.prepare(
    `SELECT id, candidate_id, post_id, cluster_key, auto_date_wib, creation_kind, title, document,
            status, score_snapshot, sources_snapshot, created_by, imported_at, created_at, updated_at
       FROM content_radar_drafts
      WHERE ${where.join(" AND ")}
      ORDER BY created_at ASC, id ASC
      LIMIT ? OFFSET ?`,
  )
    .bind(...params, limit, offset)
    .all<DraftRow>();
  const drafts = (rows.results ?? []).map(draftView);
  return ctx.json({
    drafts,
    pagination: { limit, offset, count: drafts.length, hasMore: drafts.length === limit },
  });
}

async function ingestCandidates(req: Request, env: Env, ctx: RadarContext) {
  const body = await ctx.readJson(req);
  const agent = requireAgent(req, ctx);
  const workspaceId = await resolveWorkspace(
    env,
    ctx,
    { kind: "agent", id: agent },
    body.workspaceId ?? body.workspace,
  );

  if (!isRecord(body.candidate)) {
    return ctx.fail(400, "validation_failed", "candidate must be an object.");
  }
  const input = body.candidate;
  const canonical = canonicalUrl(ctx, input.canonicalUrl, "candidate.canonicalUrl");
  const title = ctx.str(input.title, "candidate.title", 1, 300);
  const summary = ctx.optionalStr(input.summary, "candidate.summary", 2000) ?? "";
  const publishedAt = optionalTimestamp(ctx, input.publishedAt, "candidate.publishedAt");
  const publishedAtSource = ctx.oneOf(
    input.publishedAtSource ?? "unknown",
    "candidate.publishedAtSource",
    PUBLISHED_AT_SOURCES,
  );
  const discoveredAt = optionalTimestamp(ctx, input.discoveredAt, "candidate.discoveredAt") ?? ctx.nowIso();
  // `niche` is optional on re-ingest: a collector that omits it (or whose
  // classifier is silent for one run) must not turn every routine refresh of a
  // known candidate into an error. Only an explicit value can conflict with the
  // stored classification, and a brand-new candidate still has to declare one.
  const declaredNiche = input.niche === undefined || input.niche === null || input.niche === ""
    ? null
    : ctx.oneOf(input.niche, "candidate.niche", NICHES);
  const language = ctx.optionalStr(input.language, "candidate.language", 16) ?? "id";
  const clusterKey = ctx.optionalStr(input.clusterKey, "candidate.clusterKey", 200) ?? canonical;

  const declaredDomain = input.sourceDomain === undefined || input.sourceDomain === null
    ? null
    : requireDomain(ctx, input.sourceDomain, "candidate.sourceDomain");
  const sourceDomain = declaredDomain ?? hostOf(canonical);

  const sourceInput = body.source === undefined || body.source === null ? null : body.source;
  if (sourceInput !== null && !isRecord(sourceInput)) {
    return ctx.fail(400, "validation_failed", "source must be an object.");
  }
  // `source.tier` / `source.kind` are validated for shape only and then dropped:
  // ingest never chooses trust. A domain that is not already in the registry is
  // always stored as `unverified`/`discovered`; promotion stays Owner-only via
  // PATCH /sources/:id.
  if (sourceInput?.tier !== undefined && sourceInput.tier !== null) {
    ctx.oneOf(sourceInput.tier, "source.tier", SOURCE_TIERS);
  }
  if (sourceInput?.kind !== undefined && sourceInput.kind !== null) {
    ctx.oneOf(sourceInput.kind, "source.kind", SOURCE_KINDS);
  }
  const sourceName = ctx.optionalStr(sourceInput?.name, "source.name", 200) ?? sourceDomain;
  const feedUrl = ctx.optionalStr(sourceInput?.feedUrl, "source.feedUrl", 500);
  if (feedUrl !== undefined) canonicalUrl(ctx, feedUrl, "source.feedUrl");

  const provenanceInput = body.provenance === undefined || body.provenance === null ? [] : body.provenance;
  if (!Array.isArray(provenanceInput)) {
    return ctx.fail(400, "validation_failed", "provenance must be an array.");
  }
  const provenance = provenanceInput.map((entry, index) => {
    if (!isRecord(entry)) {
      return ctx.fail(400, "validation_failed", `provenance[${index}] must be an object.`);
    }
    const entryUrl = canonicalUrl(ctx, entry.url, `provenance[${index}].url`);
    const entryDomain = entry.domain === undefined || entry.domain === null
      ? hostOf(entryUrl)
      : requireDomain(ctx, entry.domain, `provenance[${index}].domain`);
    return {
      url: entryUrl,
      domain: entryDomain,
      relation: ctx.oneOf(
        entry.relation ?? (index === 0 ? "primary" : "crosscheck"),
        `provenance[${index}].relation`,
        RELATIONS,
      ),
      title: ctx.optionalStr(entry.title, `provenance[${index}].title`, 300) ?? title,
      publishedAt: optionalTimestamp(ctx, entry.publishedAt, `provenance[${index}].publishedAt`),
      excerpt: ctx.optionalStr(entry.excerpt, `provenance[${index}].excerpt`, 1000) ?? null,
    };
  });
  if (provenance.length === 0) {
    provenance.push({
      url: canonical,
      domain: sourceDomain,
      relation: "primary",
      title,
      publishedAt,
      excerpt: null,
    });
  }

  const existingSource = await env.DB.prepare(
    `SELECT workspace_id, id, domain, name, tier, kind, niches, feed_url, enabled,
            requires_crosscheck, verified_at, verified_by, notes, created_at, updated_at
       FROM content_radar_sources WHERE workspace_id = ? AND domain = ?`,
  )
    .bind(workspaceId, sourceDomain)
    .first<SourceRow>();
  const resolvedSourceId = existingSource?.id ?? (await sourceIdForDomain(sourceDomain));
  const resolvedTier = (existingSource?.tier ?? "unverified") as RadarSourceTier;
  const now = ctx.nowIso();

  const byUrl = await env.DB.prepare(
    `SELECT id, cluster_key, niche, draft_id FROM content_radar_candidates
      WHERE workspace_id = ? AND canonical_url = ?`,
  )
    .bind(workspaceId, canonical)
    .first<CandidateRef>();
  const byCluster = byUrl
    ? null
    : await env.DB.prepare(
        `SELECT id, cluster_key, niche, draft_id FROM content_radar_candidates
          WHERE workspace_id = ? AND cluster_key = ?`,
      )
        .bind(workspaceId, clusterKey)
        .first<CandidateRef>();

  const stored = byUrl ?? byCluster;
  // The stored row owns the classification; `declaredNiche` can only describe a
  // candidate that does not exist yet.
  const niche = stored ? stored.niche : declaredNiche;
  if (niche === null) {
    return ctx.fail(400, "validation_failed", "candidate.niche is required for a new candidate.");
  }

  // The stored niche is authoritative once a candidate exists: a drifting
  // classifier must not be able to re-label a candidate, because the crypto
  // quota is counted through `candidates.niche`. An explicit differing value is
  // therefore never written. When the candidate (or its cluster) already owns a
  // draft the refresh still has to go through — the collector has no way to fix
  // the payload and a 409 would leave the candidate stale — so the request
  // succeeds with `nicheLocked: true` and the stored niche in the response. An
  // undrafted candidate is refused instead of silently ignoring the value, so a
  // genuine re-classification is never mistaken for a successful update.
  let nicheLocked = false;
  if (stored && declaredNiche !== null && declaredNiche !== stored.niche) {
    const clusterDraft = stored.draft_id
      ? true
      : Boolean(
          await env.DB.prepare(
            `SELECT 1 AS present FROM content_radar_drafts WHERE workspace_id = ? AND cluster_key = ? LIMIT 1`,
          )
            .bind(workspaceId, stored.cluster_key)
            .first<{ present: number }>(),
        );
    if (!clusterDraft) {
      return ctx.fail(
        409,
        "niche_locked",
        "This candidate is already stored under another niche; recreate it to reclassify.",
      );
    }
    nicheLocked = true;
  }

  const sourceNiches = sourceInput?.niches === undefined
    ? [niche]
    : (Array.isArray(sourceInput.niches)
        ? sourceInput.niches.map((value, index) => ctx.oneOf(value, `source.niches[${index}]`, NICHES))
        : ctx.fail(400, "validation_failed", "source.niches must be an array."));

  const statements: D1PreparedStatement[] = [];
  if (!existingSource) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO content_radar_sources
           (workspace_id, id, domain, name, tier, kind, niches, feed_url, enabled,
            requires_crosscheck, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'unverified', 'discovered', ?, ?, 1, 0, ?, ?)
         ON CONFLICT(workspace_id, domain) DO NOTHING`,
      ).bind(
        workspaceId,
        resolvedSourceId,
        sourceDomain,
        sourceName,
        JSON.stringify(sourceNiches),
        feedUrl ?? null,
        now,
        now,
      ),
    );
  }

  const candidateId = byUrl?.id ?? byCluster?.id ?? ctx.uid("radcand");
  const created = !byUrl && !byCluster;

  if (byCluster) {
    statements.push(
      env.DB.prepare(
        `UPDATE content_radar_candidates
            SET last_seen_at = ?, updated_at = ?, timestamp_fallback = ?
          WHERE workspace_id = ? AND id = ?`,
      ).bind(now, now, publishedAt === null ? 1 : 0, workspaceId, candidateId),
    );
  } else if (byUrl) {
    // Re-ingest never re-points the candidate: `source_domain`, `source_tier`
    // and `niche` stay exactly as stored (trust is the Owner's decision).
    statements.push(
      env.DB.prepare(
        `UPDATE content_radar_candidates
            SET title = ?, summary = ?, published_at = COALESCE(?, published_at),
                published_at_source = ?, discovered_at = ?, last_seen_at = ?,
                timestamp_fallback = ?, language = ?, updated_at = ?
          WHERE workspace_id = ? AND id = ?`,
      ).bind(
        title,
        summary,
        publishedAt,
        publishedAtSource,
        discoveredAt,
        now,
        publishedAt === null ? 1 : 0,
        language,
        now,
        workspaceId,
        candidateId,
      ),
    );
  } else {
    statements.push(
      env.DB.prepare(
        `INSERT INTO content_radar_candidates
           (workspace_id, id, cluster_key, canonical_url, title, summary, published_at,
            published_at_source, discovered_at, last_seen_at, timestamp_fallback, niche, language,
            status, source_domain, source_tier, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)
         ON CONFLICT(workspace_id, canonical_url) DO UPDATE SET
           last_seen_at = excluded.last_seen_at,
           updated_at = excluded.updated_at`,
      ).bind(
        workspaceId,
        candidateId,
        clusterKey,
        canonical,
        title,
        summary,
        publishedAt,
        publishedAtSource,
        discoveredAt,
        now,
        publishedAt === null ? 1 : 0,
        niche,
        language,
        sourceDomain,
        resolvedTier,
        now,
        now,
      ),
    );
  }

  const registered = await env.DB.prepare(
    `SELECT id, domain FROM content_radar_sources WHERE workspace_id = ?`,
  )
    .bind(workspaceId)
    .all<{ id: string; domain: string }>();
  const sourceIdByDomain = new Map<string, string>();
  for (const entry of registered.results ?? []) sourceIdByDomain.set(entry.domain, entry.id);
  sourceIdByDomain.set(sourceDomain, resolvedSourceId);
  for (const entry of provenance) {
    if (sourceIdByDomain.has(entry.domain)) continue;
    sourceIdByDomain.set(entry.domain, await sourceIdForDomain(entry.domain));
  }

  for (const entry of provenance) {
    const entrySourceId = sourceIdByDomain.get(entry.domain) as string;
    if (!(registered.results ?? []).some((row) => row.domain === entry.domain) && entry.domain !== sourceDomain) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO content_radar_sources
             (workspace_id, id, domain, name, tier, kind, niches, enabled, requires_crosscheck,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, 'unverified', 'discovered', '[]', 1, 0, ?, ?)
           ON CONFLICT(workspace_id, domain) DO NOTHING`,
        ).bind(workspaceId, entrySourceId, entry.domain, entry.domain, now, now),
      );
    }
    statements.push(
      env.DB.prepare(
        `INSERT INTO content_radar_candidate_sources
           (workspace_id, id, candidate_id, source_id, canonical_url, source_domain, relation,
            title, published_at, evidence_excerpt, discovered_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, candidate_id, source_id, canonical_url) DO UPDATE SET
           relation = excluded.relation,
           title = excluded.title,
           published_at = COALESCE(excluded.published_at, content_radar_candidate_sources.published_at),
           evidence_excerpt = COALESCE(excluded.evidence_excerpt, content_radar_candidate_sources.evidence_excerpt),
           updated_at = excluded.updated_at`,
      ).bind(
        workspaceId,
        ctx.uid("radsrc"),
        candidateId,
        entrySourceId,
        entry.url,
        entry.domain,
        entry.relation,
        entry.title,
        entry.publishedAt,
        entry.excerpt,
        discoveredAt,
        now,
        now,
      ),
    );
  }

  try {
    await env.DB.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed: content_radar_candidates")) {
      return ctx.fail(409, "candidate_conflict", "This cluster key or canonical URL belongs to another candidate.");
    }
    if (message.includes("UNIQUE constraint failed: content_radar_sources")) {
      return ctx.fail(
        409,
        "source_conflict",
        "This source id or domain is already registered in another row.",
      );
    }
    throw error;
  }

  return ctx.json(
    {
      ok: true,
      candidateId,
      created,
      clustered: byCluster !== null,
      niche,
      nicheLocked,
      provenance: provenance.length,
      source: { id: resolvedSourceId, domain: sourceDomain, tier: resolvedTier },
    },
    created ? 201 : 200,
  );
}

async function scoreCandidate(req: Request, env: Env, ctx: RadarContext, id: string) {
  const body = await ctx.readJson(req);
  const agent = requireAgent(req, ctx);
  const workspaceId = await resolveWorkspace(
    env,
    ctx,
    { kind: "agent", id: agent },
    body.workspaceId ?? body.workspace,
  );

  const row = await loadCandidate(env, workspaceId, id);
  if (!row) return ctx.fail(404, "candidate_not_found", "Unknown candidate.");

  const relevance = discrete(ctx, body.relevance, "relevance", RELEVANCE_VALUES);
  const carouselPotential = discrete(ctx, body.carouselPotential, "carouselPotential", POTENTIAL_VALUES);
  const reason = ctx.str(body.reason, "reason", 1, 500);
  const riskFlags = body.riskFlags === undefined
    ? []
    : (Array.isArray(body.riskFlags)
        ? body.riskFlags.map((flag, index) => ctx.oneOf(flag, `riskFlags[${index}]`, RISK_FLAGS))
        : ctx.fail(400, "validation_failed", "riskFlags must be an array."));
  // The evaluation clock is always the server's. A client-supplied `asOf` is
  // ignored (never validated, never stored), so it cannot move `ageHours`,
  // `freshness`, or the 24 h eligibility window.
  const { trust } = await loadTrust(env, workspaceId, row);

  const input: RadarScoreInput = {
    rubricVersion: "v1",
    asOf: ctx.nowIso(),
    sourceTier: trust.tier,
    sourceIsPrimary: trust.primary,
    publishedAt: row.published_at,
    discoveredAt: row.discovered_at,
    independentCrossChecks: trust.crossChecks,
    relevance,
    carouselPotential,
    riskFlags: riskFlags as RadarRiskFlag[],
  };

  let score: RadarScore;
  try {
    score = computeRadarScore(input);
  } catch (error) {
    return ctx.fail(
      400,
      "invalid_score_input",
      error instanceof Error ? error.message : "Invalid Content Radar score input.",
    );
  }

  const nextStatus = row.status === "new" && score.total >= 50 ? "qualified" : row.status;
  await env.DB.prepare(
    `UPDATE content_radar_candidates
        SET score_components = ?, score_total = ?, rubric_version = ?, score_input_snapshot = ?,
            score_reason = ?, risk_flags = ?, status = ?, updated_at = ?
      WHERE workspace_id = ? AND id = ?`,
  )
    .bind(
      JSON.stringify(score.components),
      score.total,
      score.rubricVersion,
      JSON.stringify(score.inputSnapshot),
      reason,
      JSON.stringify([...new Set(riskFlags)].sort()),
      nextStatus,
      ctx.nowIso(),
      workspaceId,
      id,
    )
    .run();

  const updated = await loadCandidate(env, workspaceId, id);
  return ctx.json({ ok: true, candidate: updated ? candidateView(updated) : null, score });
}

async function createDraft(req: Request, env: Env, ctx: RadarContext, candidateId: string) {
  const body = await ctx.readJson(req);
  const credential = await verifyCredential(req, env, ctx);
  if (credential.kind === "agent") {
    const workspaceId = await resolveWorkspace(env, ctx, credential, body.workspaceId ?? body.workspace);
    const row = await loadCandidate(env, workspaceId, candidateId);
    if (!row) return ctx.fail(404, "candidate_not_found", "Unknown candidate.");
    return createAutomaticDraft(env, ctx, workspaceId, row, body);
  }
  const { workspaceId, actor } = await requireOwnerActor(
    req,
    env,
    ctx,
    credential,
    body.workspaceId ?? body.workspace,
  );
  const row = await loadCandidate(env, workspaceId, candidateId);
  if (!row) return ctx.fail(404, "candidate_not_found", "Unknown candidate.");
  return createManualDraft(env, ctx, workspaceId, row, body, actor);
}

async function createAutomaticDraft(
  env: Env,
  ctx: RadarContext,
  workspaceId: string,
  row: CandidateRow,
  body: Record<string, unknown>,
) {
  const storedSnapshot = readRecordColumn(row.score_input_snapshot);
  if (!Object.keys(storedSnapshot).length) {
    return ctx.fail(409, "candidate_not_scored", "Score this candidate before requesting an automatic draft.");
  }
  // Eligibility is re-evaluated at draft time: the discrete Hermes judgement
  // (relevance, carousel potential, risk flags) and the cross-checks come from
  // the stored snapshot, but the clock is fresh and trust comes from the live
  // registry. A snapshot frozen at score time can therefore never keep a stale
  // candidate inside the 24 h window, and an `unverified` origin stays
  // trust-less no matter what the snapshot recorded.
  const { trust, provenance } = await loadTrust(env, workspaceId, row);
  const eligibilitySnapshot = {
    ...storedSnapshot,
    asOf: ctx.nowIso(),
    sourceTier: trust.tier,
    sourceIsPrimary: trust.primary,
    independentCrossChecks: trust.crossChecks,
  } as unknown as RadarScoreInputSnapshot;
  const candidate: RadarCandidate = {
    id: row.id,
    clusterKey: row.cluster_key,
    canonicalUrl: row.canonical_url,
    title: row.title,
    summary: row.summary,
    publishedAt: row.published_at,
    discoveredAt: row.discovered_at,
    niche: row.niche as RadarNiche,
    sourceDomain: row.source_domain,
    sourceTier: trust.tier,
    status: row.status as RadarCandidateStatus,
    score: { ...scoreFromRow(row), inputSnapshot: eligibilitySnapshot },
    draftId: row.draft_id,
  };
  let eligibility;
  try {
    eligibility = isAutoDraftEligible(candidate);
  } catch {
    return ctx.fail(409, "candidate_not_scored", "The stored score snapshot is incomplete; re-score the candidate.");
  }
  if (!eligibility.eligible) {
    return ctx.fail(
      409,
      "draft_not_eligible",
      "This candidate does not satisfy the automatic draft rules.",
      { reasons: eligibility.reasons },
    );
  }

  const document = radarDocument(ctx, body.document);
  const now = ctx.nowIso();
  const date = wibDate(now);
  if ((await countAutomaticDrafts(env, workspaceId, date)) >= AUTO_DRAFT_DAILY_CAP) {
    return ctx.fail(409, "daily_draft_cap_reached", "Three automatic drafts already exist for today (Asia/Jakarta).");
  }
  if (row.niche === "crypto" && (await countCryptoDrafts(env, workspaceId, date)) >= AUTO_DRAFT_CRYPTO_CAP) {
    return ctx.fail(409, "crypto_draft_cap_reached", "One automatic crypto draft already exists for today (Asia/Jakarta).");
  }

  const sourcesSnapshot: RadarDraftSource[] = provenance.map((entry) => ({
    name: entry.name,
    url: entry.canonical_url,
    domain: entry.source_domain,
    tier: entry.tier as RadarSourceTier,
    relation: entry.relation as RadarDraftSource["relation"],
  }));
  const score = scoreFromRow(row);
  const draftId = ctx.uid("radardraft");
  const cryptoGuard = row.niche === "crypto"
    ? `AND (SELECT COUNT(*) FROM content_radar_drafts d
             JOIN content_radar_candidates c
               ON c.workspace_id = d.workspace_id AND c.id = d.candidate_id
            WHERE d.workspace_id = ? AND d.creation_kind = 'automatic'
              AND d.auto_date_wib = ? AND c.niche = 'crypto') < ${AUTO_DRAFT_CRYPTO_CAP}`
    : "";
  const insertParams: (string | number | null)[] = [
    workspaceId,
    draftId,
    row.id,
    draftId,
    row.cluster_key,
    date,
    row.title,
    JSON.stringify(document),
    JSON.stringify(score),
    JSON.stringify(sourcesSnapshot),
    now,
    now,
    workspaceId,
    date,
    workspaceId,
    row.id,
  ];
  if (cryptoGuard) insertParams.push(workspaceId, date);

  const insert = env.DB.prepare(
    `INSERT INTO content_radar_drafts
       (workspace_id, id, candidate_id, post_id, cluster_key, auto_date_wib, creation_kind, title,
        document, status, score_snapshot, sources_snapshot, created_by, created_at, updated_at)
     SELECT ?, ?, ?, ?, ?, ?, 'automatic', ?, ?, 'Draft', ?, ?, 'radar-agent', ?, ?
      WHERE (SELECT COUNT(*) FROM content_radar_drafts
              WHERE workspace_id = ? AND creation_kind = 'automatic' AND auto_date_wib = ?)
            < ${AUTO_DRAFT_DAILY_CAP}
        AND NOT EXISTS (SELECT 1 FROM content_radar_candidates
                         WHERE workspace_id = ? AND id = ? AND draft_id IS NOT NULL)
        ${cryptoGuard}`,
  ).bind(...insertParams);

  const markDrafted = env.DB.prepare(
    `UPDATE content_radar_candidates
        SET draft_id = ?, status = 'drafted', updated_at = ?
      WHERE workspace_id = ? AND id = ? AND draft_id IS NULL
        AND EXISTS (SELECT 1 FROM content_radar_drafts WHERE workspace_id = ? AND id = ?)`,
  ).bind(draftId, now, workspaceId, row.id, workspaceId, draftId);

  const audit = ctx.auditStatement(env, {
    workspaceId,
    entityType: "report",
    entityId: draftId,
    actor: { id: "radar-agent", role: "agent" },
    action: "content_radar.draft_created",
    meta: JSON.stringify({
      radarEntityType: "draft",
      candidateId: row.id,
      clusterKey: row.cluster_key,
      creationKind: "automatic",
      scoreTotal: score.total,
    }),
  });

  let results: D1Result[];
  try {
    results = await env.DB.batch([insert, markDrafted, audit]);
  } catch (error) {
    return uniqueDraftConflict(
      ctx,
      error instanceof Error ? error.message : "content_radar_drafts constraint failed",
    );
  }
  if (!results[0]?.meta.changes) {
    if (row.draft_id) {
      return ctx.fail(409, "candidate_already_drafted", "This candidate already has a draft.");
    }
    if ((await countAutomaticDrafts(env, workspaceId, date)) >= AUTO_DRAFT_DAILY_CAP) {
      return ctx.fail(409, "daily_draft_cap_reached", "Three automatic drafts already exist for today (Asia/Jakarta).");
    }
    if (row.niche === "crypto" && (await countCryptoDrafts(env, workspaceId, date)) >= AUTO_DRAFT_CRYPTO_CAP) {
      return ctx.fail(409, "crypto_draft_cap_reached", "One automatic crypto draft already exists for today (Asia/Jakarta).");
    }
    return ctx.fail(409, "draft_conflict", "The draft could not be created because the candidate is no longer eligible.");
  }

  const draft = await env.DB.prepare(
    `SELECT id, candidate_id, post_id, cluster_key, auto_date_wib, creation_kind, title, document,
            status, score_snapshot, sources_snapshot, created_by, imported_at, created_at, updated_at
       FROM content_radar_drafts WHERE workspace_id = ? AND id = ?`,
  )
    .bind(workspaceId, draftId)
    .first<DraftRow>();
  return ctx.json({ ok: true, draft: draft ? draftView(draft) : null }, 201);
}

async function createManualDraft(
  env: Env,
  ctx: RadarContext,
  workspaceId: string,
  row: CandidateRow,
  body: Record<string, unknown>,
  actor: RadarActor,
) {
  if (row.draft_id) {
    return ctx.fail(409, "candidate_already_drafted", "This candidate already has a draft.");
  }
  const document = body.document === undefined || body.document === null
    ? scaffoldDocument(ctx, row)
    : radarDocument(ctx, body.document);
  const now = ctx.nowIso();
  const draftId = ctx.uid("radardraft");
  const provenance = await loadProvenance(env, workspaceId, row.id);
  const sourcesSnapshot: RadarDraftSource[] = provenance.map((entry) => ({
    name: entry.name,
    url: entry.canonical_url,
    domain: entry.source_domain,
    tier: entry.tier as RadarSourceTier,
    relation: entry.relation as RadarDraftSource["relation"],
  }));

  const insert = env.DB.prepare(
    `INSERT INTO content_radar_drafts
       (workspace_id, id, candidate_id, post_id, cluster_key, auto_date_wib, creation_kind, title,
        document, status, score_snapshot, sources_snapshot, created_by, created_at, updated_at)
     SELECT ?, ?, ?, ?, ?, NULL, 'manual', ?, ?, 'Draft', ?, ?, 'Owner', ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM content_radar_candidates
                         WHERE workspace_id = ? AND id = ? AND draft_id IS NOT NULL)`,
  ).bind(
    workspaceId,
    draftId,
    row.id,
    draftId,
    row.cluster_key,
    row.title,
    JSON.stringify(document),
    JSON.stringify(scoreFromRow(row)),
    JSON.stringify(sourcesSnapshot),
    now,
    now,
    workspaceId,
    row.id,
  );

  const markDrafted = env.DB.prepare(
    `UPDATE content_radar_candidates
        SET draft_id = ?, status = 'drafted', updated_at = ?
      WHERE workspace_id = ? AND id = ? AND draft_id IS NULL
        AND EXISTS (SELECT 1 FROM content_radar_drafts WHERE workspace_id = ? AND id = ?)`,
  ).bind(draftId, now, workspaceId, row.id, workspaceId, draftId);

  const audit = ctx.auditStatement(env, {
    workspaceId,
    entityType: "report",
    entityId: draftId,
    actor: { id: actor.id, role: actor.role },
    action: "content_radar.manual_draft_created",
    meta: JSON.stringify({
      radarEntityType: "draft",
      candidateId: row.id,
      clusterKey: row.cluster_key,
      creationKind: "manual",
      scoreTotal: row.score_total,
    }),
  });

  let results: D1Result[];
  try {
    results = await env.DB.batch([insert, markDrafted, audit]);
  } catch (error) {
    return uniqueDraftConflict(
      ctx,
      error instanceof Error ? error.message : "content_radar_drafts constraint failed",
    );
  }
  if (!results[0]?.meta.changes) {
    return ctx.fail(409, "candidate_already_drafted", "This candidate already has a draft.");
  }

  const draft = await env.DB.prepare(
    `SELECT id, candidate_id, post_id, cluster_key, auto_date_wib, creation_kind, title, document,
            status, score_snapshot, sources_snapshot, created_by, imported_at, created_at, updated_at
       FROM content_radar_drafts WHERE workspace_id = ? AND id = ?`,
  )
    .bind(workspaceId, draftId)
    .first<DraftRow>();
  return ctx.json({ ok: true, draft: draft ? draftView(draft) : null }, 201);
}

async function rejectCandidate(req: Request, env: Env, ctx: RadarContext, candidateId: string) {
  const body = await ctx.readJson(req);
  const credential = await verifyCredential(req, env, ctx);
  const { workspaceId, actor } = await requireOwnerActor(
    req,
    env,
    ctx,
    credential,
    body.workspaceId ?? body.workspace,
  );
  const reason = ctx.str(body.reason, "reason", 1, 500);

  const row = await loadCandidate(env, workspaceId, candidateId);
  if (!row) return ctx.fail(404, "candidate_not_found", "Unknown candidate.");
  if (row.draft_id) {
    return ctx.fail(409, "candidate_already_drafted", "A drafted candidate cannot be rejected.");
  }

  const now = ctx.nowIso();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE content_radar_candidates
          SET status = 'rejected', rejection_reason = ?, updated_at = ?
        WHERE workspace_id = ? AND id = ?`,
    ).bind(reason, now, workspaceId, candidateId),
    ctx.auditStatement(env, {
      workspaceId,
      entityType: "report",
      entityId: candidateId,
      actor: { id: actor.id, role: actor.role },
      action: "content_radar.candidate_rejected",
      meta: JSON.stringify({ radarEntityType: "candidate", reason }),
    }),
  ]);

  const updated = await loadCandidate(env, workspaceId, candidateId);
  return ctx.json({ ok: true, candidate: updated ? candidateView(updated) : null });
}

async function patchSource(req: Request, env: Env, ctx: RadarContext, sourceId: string) {
  const body = await ctx.readJson(req);
  const credential = await verifyCredential(req, env, ctx);
  const { workspaceId, actor } = await requireOwnerActor(
    req,
    env,
    ctx,
    credential,
    body.workspaceId ?? body.workspace,
  );

  const current = await env.DB.prepare(
    `SELECT workspace_id, id, domain, name, tier, kind, niches, feed_url, enabled,
            requires_crosscheck, verified_at, verified_by, notes, created_at, updated_at
       FROM content_radar_sources WHERE workspace_id = ? AND id = ?`,
  )
    .bind(workspaceId, sourceId)
    .first<SourceRow>();
  if (!current) return ctx.fail(404, "source_not_found", "Unknown source.");

  const tier = body.tier === undefined || body.tier === null
    ? current.tier
    : ctx.oneOf(body.tier, "tier", SOURCE_TIERS);
  // `kind` is Owner-correctable: ingest always files a new domain as
  // `discovered`, so an official/regulator feed needs this route to be labelled
  // truthfully. It travels in the same UPDATE as `tier`, which keeps the Tier D
  // `requires_crosscheck = 1` coupling (computed below) atomic with the relabel.
  const kind = body.kind === undefined || body.kind === null
    ? current.kind
    : ctx.oneOf(body.kind, "kind", SOURCE_KINDS);
  if (kind === "discovered" && tier !== "unverified") {
    return ctx.fail(
      400,
      "discovered_source_requires_unverified",
      "Promote a discovered source with an explicit kind, not by changing tier alone.",
    );
  }
  const enabled = body.enabled === undefined || body.enabled === null
    ? current.enabled
    : (typeof body.enabled === "boolean"
        ? (body.enabled ? 1 : 0)
        : ctx.fail(400, "validation_failed", "enabled must be a boolean."));
  const requiresCrosscheck = tier === "D"
    ? 1
    : (body.requiresCrosscheck === undefined || body.requiresCrosscheck === null
        ? (current.tier === "D" ? 0 : current.requires_crosscheck)
        : (typeof body.requiresCrosscheck === "boolean"
            ? (body.requiresCrosscheck ? 1 : 0)
            : ctx.fail(400, "validation_failed", "requiresCrosscheck must be a boolean.")));
  const notes = body.notes === undefined ? current.notes : ctx.optionalStr(body.notes, "notes", 2000) ?? null;
  const niches = body.niches === undefined
    ? current.niches
    : (Array.isArray(body.niches)
        ? JSON.stringify(body.niches.map((value, index) => ctx.oneOf(value, `niches[${index}]`, NICHES)))
        : ctx.fail(400, "validation_failed", "niches must be an array."));
  const feedUrl = body.feedUrl === undefined
    ? current.feed_url
    : (body.feedUrl === null ? null : canonicalUrl(ctx, body.feedUrl, "feedUrl"));
  const now = ctx.nowIso();
  const verified = tier !== "unverified" && current.tier === "unverified";

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE content_radar_sources
          SET tier = ?, kind = ?, enabled = ?, requires_crosscheck = ?, notes = ?, niches = ?,
              feed_url = ?, verified_at = ?, verified_by = ?, updated_at = ?
        WHERE workspace_id = ? AND id = ?`,
    ).bind(
      tier,
      kind,
      enabled,
      requiresCrosscheck,
      notes,
      niches,
      feedUrl,
      verified ? now : current.verified_at,
      verified ? actor.id : current.verified_by,
      now,
      workspaceId,
      sourceId,
    ),
    ctx.auditStatement(env, {
      workspaceId,
      entityType: "report",
      entityId: sourceId,
      actor: { id: actor.id, role: actor.role },
      action: "content_radar.source_updated",
      meta: JSON.stringify({
        radarEntityType: "source",
        domain: current.domain,
        from: { tier: current.tier, kind: current.kind, enabled: current.enabled === 1 },
        to: { tier, kind, enabled: enabled === 1, requiresCrosscheck: requiresCrosscheck === 1 },
      }),
    }),
  ]);

  const updated = await env.DB.prepare(
    `SELECT workspace_id, id, domain, name, tier, kind, niches, feed_url, enabled,
            requires_crosscheck, verified_at, verified_by, notes, created_at, updated_at
       FROM content_radar_sources WHERE workspace_id = ? AND id = ?`,
  )
    .bind(workspaceId, sourceId)
    .first<SourceRow>();
  return ctx.json({ ok: true, source: updated ? sourceView(updated) : null });
}

async function createRun(req: Request, env: Env, ctx: RadarContext) {
  const body = await ctx.readJson(req);
  const agent = requireAgent(req, ctx);
  const workspaceId = await resolveWorkspace(
    env,
    ctx,
    { kind: "agent", id: agent },
    body.workspaceId ?? body.workspace,
  );
  const kind = ctx.oneOf(body.kind, "kind", RUN_KINDS);
  const meta = body.meta === undefined || body.meta === null ? {} : body.meta;
  if (!isRecord(meta)) return ctx.fail(400, "validation_failed", "meta must be an object.");

  const now = ctx.nowIso();
  const cutoff = new Date(Date.now() - RUN_STALE_MS).toISOString();
  const runId = ctx.uid("radar-run");
  let results: D1Result[];
  try {
    results = await env.DB.batch([
      env.DB.prepare(
        `UPDATE content_radar_runs
            SET status = 'cancelled', finished_at = ?, updated_at = ?
          WHERE workspace_id = ? AND kind = ?
            AND ((status = 'running' AND (heartbeat_at IS NULL OR heartbeat_at < ?))
              OR (status = 'queued' AND created_at < ?))`,
      ).bind(now, now, workspaceId, kind, cutoff, cutoff),
      env.DB.prepare(
        `INSERT INTO content_radar_runs
           (workspace_id, id, kind, status, meta, created_at, updated_at)
         VALUES (?, ?, ?, 'queued', ?, ?, ?)`,
      ).bind(workspaceId, runId, kind, JSON.stringify(meta), now, now),
    ]);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed: content_radar_runs")
    ) {
      return ctx.fail(409, "run_locked", `A ${kind} run is already queued or running.`);
    }
    throw error;
  }

  const run = await env.DB.prepare(
    `SELECT id, kind, status, started_at, finished_at, heartbeat_at, fetched_count, new_count,
            updated_count, qualified_count, drafted_count, rejected_count, error, meta,
            created_at, updated_at
       FROM content_radar_runs WHERE workspace_id = ? AND id = ?`,
  )
    .bind(workspaceId, runId)
    .first<RunRow>();
  return ctx.json({ ok: true, reaped: results[0]?.meta.changes ?? 0, run: run ? runView(run) : null }, 201);
}

async function updateRun(req: Request, env: Env, ctx: RadarContext, runId: string) {
  const body = await ctx.readJson(req);
  const agent = requireAgent(req, ctx);
  const workspaceId = await resolveWorkspace(
    env,
    ctx,
    { kind: "agent", id: agent },
    body.workspaceId ?? body.workspace,
  );

  const current = await env.DB.prepare(
    `SELECT id, kind, status, started_at, finished_at, heartbeat_at, fetched_count, new_count,
            updated_count, qualified_count, drafted_count, rejected_count, error, meta,
            created_at, updated_at
       FROM content_radar_runs WHERE workspace_id = ? AND id = ?`,
  )
    .bind(workspaceId, runId)
    .first<RunRow>();
  if (!current) return ctx.fail(404, "run_not_found", "Unknown run.");

  const status = body.status === undefined || body.status === null
    ? null
    : ctx.oneOf(body.status, "status", RUN_STATUSES);
  if (status === null && body.heartbeat !== true) {
    return ctx.fail(400, "validation_failed", "Provide status or heartbeat:true.");
  }
  if (status !== null && TERMINAL_RUN_STATUSES.includes(current.status as never)) {
    return ctx.fail(409, "run_state_conflict", `Run is already ${current.status}.`);
  }
  if (status === "queued" && current.status !== "queued") {
    return ctx.fail(409, "run_state_conflict", "A run cannot return to queued.");
  }

  const counts = {
    fetched: ctx.optionalInt(body.fetched, "fetched", 0, 1_000_000),
    new: ctx.optionalInt(body.new, "new", 0, 1_000_000),
    updated: ctx.optionalInt(body.updated, "updated", 0, 1_000_000),
    qualified: ctx.optionalInt(body.qualified, "qualified", 0, 1_000_000),
    drafted: ctx.optionalInt(body.drafted, "drafted", 0, 1_000_000),
    rejected: ctx.optionalInt(body.rejected, "rejected", 0, 1_000_000),
  };
  const meta = body.meta === undefined || body.meta === null ? null : body.meta;
  if (meta !== null && !isRecord(meta)) {
    return ctx.fail(400, "validation_failed", "meta must be an object.");
  }
  const error = body.error === undefined ? null : ctx.optionalStr(body.error, "error", 2000) ?? null;
  const now = ctx.nowIso();

  await env.DB.prepare(
    `UPDATE content_radar_runs
        SET status = COALESCE(?, status),
            started_at = CASE WHEN ? = 'running' AND started_at IS NULL THEN ? ELSE started_at END,
            finished_at = CASE WHEN ? IN ('succeeded', 'failed', 'cancelled') THEN ? ELSE finished_at END,
            heartbeat_at = ?,
            fetched_count = COALESCE(?, fetched_count),
            new_count = COALESCE(?, new_count),
            updated_count = COALESCE(?, updated_count),
            qualified_count = COALESCE(?, qualified_count),
            drafted_count = COALESCE(?, drafted_count),
            rejected_count = COALESCE(?, rejected_count),
            error = COALESCE(?, error),
            meta = COALESCE(?, meta),
            updated_at = ?
      WHERE workspace_id = ? AND id = ?`,
  )
    .bind(
      status,
      status,
      now,
      status,
      now,
      now,
      counts.fetched ?? null,
      counts.new ?? null,
      counts.updated ?? null,
      counts.qualified ?? null,
      counts.drafted ?? null,
      counts.rejected ?? null,
      error,
      meta === null ? null : JSON.stringify(meta),
      now,
      workspaceId,
      runId,
    )
    .run();

  const updated = await env.DB.prepare(
    `SELECT id, kind, status, started_at, finished_at, heartbeat_at, fetched_count, new_count,
            updated_count, qualified_count, drafted_count, rejected_count, error, meta,
            created_at, updated_at
       FROM content_radar_runs WHERE workspace_id = ? AND id = ?`,
  )
    .bind(workspaceId, runId)
    .first<RunRow>();
  return ctx.json({ ok: true, run: updated ? runView(updated) : null });
}

async function forceRun(req: Request, env: Env, ctx: RadarContext) {
  const body = await ctx.readJson(req);
  const agent = requireAgent(req, ctx);
  const workspaceId = await resolveWorkspace(
    env,
    ctx,
    { kind: "agent", id: agent },
    body.workspaceId ?? body.workspace,
  );
  const kind = ctx.oneOf(body.kind, "kind", RUN_KINDS);
  const dryRun = body.dryRun === undefined ? false : body.dryRun === true;
  if (body.dryRun !== undefined && typeof body.dryRun !== "boolean") {
    return ctx.fail(400, "validation_failed", "dryRun must be a boolean.");
  }

  const now = ctx.nowIso();
  const runId = ctx.uid("radar-run");
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE content_radar_runs
          SET status = 'cancelled', finished_at = ?, updated_at = ?
        WHERE workspace_id = ? AND kind = ? AND status IN ('queued', 'running')`,
    ).bind(now, now, workspaceId, kind),
    env.DB.prepare(
      `INSERT INTO content_radar_runs
         (workspace_id, id, kind, status, meta, created_at, updated_at)
       VALUES (?, ?, ?, 'queued', ?, ?, ?)`,
    ).bind(workspaceId, runId, kind, JSON.stringify({ forced: true, dryRun }), now, now),
  ]);

  const run = await env.DB.prepare(
    `SELECT id, kind, status, started_at, finished_at, heartbeat_at, fetched_count, new_count,
            updated_count, qualified_count, drafted_count, rejected_count, error, meta,
            created_at, updated_at
       FROM content_radar_runs WHERE workspace_id = ? AND id = ?`,
  )
    .bind(workspaceId, runId)
    .first<RunRow>();
  return ctx.json(
    { ok: true, cancelled: results[0]?.meta.changes ?? 0, run: run ? runView(run) : null },
    201,
  );
}

async function acknowledgeDraft(req: Request, env: Env, ctx: RadarContext, draftId: string) {
  const body = await ctx.readJson(req);
  const credential = await verifyCredential(req, env, ctx);
  // The ACK exists for the Owner's browser after a successful store upsert; the
  // collector must not be able to empty the Owner's queue by acknowledging.
  if (credential.kind === "agent") {
    return ctx.fail(403, "forbidden_human_only", "The radar-agent identity cannot acknowledge a draft import.");
  }
  const workspaceId = await ctx.assertWorkspace(env, body.workspaceId ?? body.workspace);
  requireActorHeader(req, ctx);
  await resolveActor(env, workspaceId, req, ctx);

  const current = await env.DB.prepare(
    `SELECT id, candidate_id, post_id, cluster_key, auto_date_wib, creation_kind, title, document,
            status, score_snapshot, sources_snapshot, created_by, imported_at, created_at, updated_at
       FROM content_radar_drafts WHERE workspace_id = ? AND id = ?`,
  )
    .bind(workspaceId, draftId)
    .first<DraftRow>();
  if (!current) return ctx.fail(404, "draft_not_found", "Unknown draft.");
  if (current.imported_at) {
    return ctx.json({ ok: true, draftId, importedAt: current.imported_at, alreadyImported: true });
  }

  const now = ctx.nowIso();
  await env.DB.prepare(
    `UPDATE content_radar_drafts SET imported_at = ?, updated_at = ?
      WHERE workspace_id = ? AND id = ? AND imported_at IS NULL`,
  )
    .bind(now, now, workspaceId, draftId)
    .run();

  const updated = await env.DB.prepare(
    `SELECT imported_at FROM content_radar_drafts WHERE workspace_id = ? AND id = ?`,
  )
    .bind(workspaceId, draftId)
    .first<{ imported_at: string | null }>();
  return ctx.json({
    ok: true,
    draftId,
    importedAt: updated?.imported_at ?? now,
    alreadyImported: false,
  });
}
