/**
 * Office CRM API — Cloudflare Worker + D1.
 *
 * Implements the PRD §12 contract: authenticated, workspace-scoped,
 * validated, idempotent mutations with an append-only audit trail.
 * The bundled SPA is demo-seeded and is served from Workers Assets; this
 * API is the production data surface and never presents seeded data as live.
 */

import { handleAgentChat, handleClearAgentMessages, handleGetAgentMessages } from "./chat";
import { runQcGate, saveQcNote } from "./qc";

import { insertScrapedLeads } from "./scraper";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AI: Ai;
  API_TOKEN?: string;
  /**
   * Set to "1" hanya setelah Cloudflare Access aktif untuk domain ini.
   * Saat aktif, edge Access sudah memvalidasi identitas, jadi header
   * cf-access-authenticated-user-email boleh dipercaya (workers.dev dimatikan).
   */
  ACCESS_ENABLED?: string;
}

/* ------------------------------------------------------------------ */
/* HTTP primitives                                                     */
/* ------------------------------------------------------------------ */

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

const json = (body: unknown, status = 200, extra?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function fail(status: number, code: string, message: string, details?: unknown): never {
  throw new ApiError(status, code, message, details);
}

const errorResponse = (error: ApiError) =>
  json(
    { error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) } },
    error.status,
  );

const nowIso = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const parseArray = <T>(raw: string | null | undefined): T[] => {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
};
const parseRecord = (raw: string | null | undefined): Record<string, unknown> => {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    fail(415, "unsupported_media_type", "Send a JSON body with content-type application/json.");
  }
  const raw = await req.text();
  if (raw.length > 100_000) fail(413, "payload_too_large", "The request body exceeds 100 KB.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail(400, "invalid_json", "The request body is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(400, "invalid_body", "The request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

const str = (value: unknown, field: string, min = 1, max = 2000) => {
  if (typeof value !== "string") fail(400, "validation_failed", `${field} must be a string.`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    fail(400, "validation_failed", `${field} must be between ${min} and ${max} characters.`);
  }
  return trimmed;
};

const optionalStr = (value: unknown, field: string, max = 2000) => {
  if (value === undefined || value === null || value === "") return undefined;
  return str(value, field, 1, max);
};

const optionalBool = (value: unknown, field: string) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") fail(400, "validation_failed", `${field} must be a boolean.`);
  return value;
};

const optionalInt = (value: unknown, field: string, min: number, max: number) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    fail(400, "validation_failed", `${field} must be an integer between ${min} and ${max}.`);
  }
  return value;
};

const oneOf = <T extends string>(value: unknown, field: string, allowed: readonly T[]): T => {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(400, "validation_failed", `${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
};

/* ------------------------------------------------------------------ */
/* Auth + audit                                                        */
/* ------------------------------------------------------------------ */

type ActorRole = "owner" | "spv" | "operator";
type ActorType = "owner" | "spv" | "operator" | "agent" | "system";

interface Actor {
  id: string;
  name: string;
  role: ActorRole;
  workspaceId: string;
}

const tokenMatches = (provided: string, expected: string) => {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < provided.length; index += 1) {
    diff |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return diff === 0;
};

function assertToken(req: Request, env: Env) {
  // Jalur Cloudflare Access: edge sudah menolak request tanpa sesi valid, dan
  // header ini hanya bisa muncul kalau Access aktif untuk domain ini
  // (workers.dev dimatikan). Digerbangi env flag supaya tidak jadi celah
  // sebelum Access benar-benar menyala.
  if (env.ACCESS_ENABLED === "1" && req.headers.get("cf-access-authenticated-user-email")) {
    return;
  }
  const expected = env.API_TOKEN?.trim();
  if (!expected) {
    fail(503, "auth_not_configured", "API_TOKEN is not configured. Set the secret before serving the API.");
  }
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || !tokenMatches((match[1] ?? "").trim(), expected)) {
    fail(401, "unauthorized", "A valid bearer token is required.");
  }
}

const actorTypeFor = (role: ActorRole): ActorType => role;

async function authenticate(env: Env, workspaceId: string, req: Request): Promise<Actor> {
  const header = (req.headers.get("x-actor-id") ?? "ja").trim();
  if (!header || header.length > 80) fail(400, "validation_failed", "x-actor-id is invalid.");
  const row = await env.DB.prepare(
    "SELECT id, name, role FROM actors WHERE workspace_id = ? AND id = ?",
  )
    .bind(workspaceId, header)
    .first<{ id: string; name: string; role: ActorRole }>();
  if (!row) fail(403, "forbidden", "This actor is not a member of the workspace.");
  return { ...row, workspaceId };
}

const requireOwner = (actor: Actor) => {
  if (actor.role !== "owner") {
    fail(403, "forbidden", "Only the workspace owner can make approval decisions.");
  }
};

async function assertWorkspace(env: Env, raw: unknown): Promise<string> {
  const workspaceId = str(raw, "workspaceId", 1, 80);
  const row = await env.DB.prepare("SELECT id FROM workspaces WHERE id = ?").bind(workspaceId).first<{ id: string }>();
  if (!row) fail(404, "workspace_not_found", "Unknown workspace.");
  return workspaceId;
}

const auditStatement = (
  env: Env,
  input: {
    workspaceId: string;
    entityType: "task" | "approval" | "run" | "post" | "deal" | "lead" | "agent" | "copilot" | "inbox" | "report";
    entityId: string;
    taskId?: string | null;
    actor: Actor;
    action: string;
    result?: "ok" | "failed" | "pending" | "denied";
    meta?: string | null;
  },
) =>
  env.DB.prepare(
    `INSERT INTO activity_events
      (id, workspace_id, entity_type, entity_id, task_id, actor_type, actor_id, action, result, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    uid("ev"),
    input.workspaceId,
    input.entityType,
    input.entityId,
    input.taskId ?? null,
    actorTypeFor(input.actor.role),
    input.actor.id,
    input.action,
    input.result ?? "ok",
    input.meta ?? null,
    nowIso(),
  );

/* ------------------------------------------------------------------ */
/* Idempotency                                                         */
/* ------------------------------------------------------------------ */

const hashRequest = async (raw: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

interface MutationResult {
  status: number;
  body: unknown;
}

async function runIdempotent(
  env: Env,
  input: { key: string; scope: string; actor: Actor; raw: string },
  handler: () => Promise<MutationResult>,
): Promise<Response> {
  const ledgerKey = `${input.scope}:${input.key}`;
  if (input.key.length > 128) fail(400, "validation_failed", "Idempotency key is too long.");

  const hash = await hashRequest(input.raw);
  const existing = await env.DB.prepare(
    "SELECT request_hash, status, response FROM idempotency_keys WHERE key = ?",
  )
    .bind(ledgerKey)
    .first<{ request_hash: string; status: number; response: string }>();

  if (existing) {
    if (existing.request_hash !== hash) {
      fail(409, "idempotency_conflict", "This idempotency key was already used with a different payload.");
    }
    return json(JSON.parse(existing.response), existing.status, { "idempotent-replay": "true" });
  }

  const result = await handler();
  try {
    await env.DB.prepare(
      `INSERT INTO idempotency_keys (key, scope, actor_id, request_hash, status, response, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(ledgerKey, input.scope, input.actor.id, hash, result.status, JSON.stringify(result.body), nowIso())
      .run();
  } catch {
    // A concurrent retry won the insert; replay its stored response.
    const replay = await env.DB.prepare(
      "SELECT request_hash, status, response FROM idempotency_keys WHERE key = ?",
    )
      .bind(ledgerKey)
      .first<{ request_hash: string; status: number; response: string }>();
    if (replay) {
      if (replay.request_hash !== hash) {
        fail(409, "idempotency_conflict", "This idempotency key was already used with a different payload.");
      }
      return json(JSON.parse(replay.response), replay.status, { "idempotent-replay": "true" });
    }
  }
  return json(result.body, result.status);
}

/* ------------------------------------------------------------------ */
/* Row mapping                                                         */
/* ------------------------------------------------------------------ */

interface AgentRow {
  id: string;
  workspace_id: string;
  name: string;
  role: string;
  jobdesk: string;
  availability: string;
  capabilities: string;
  skills: string;
  provider: string;
  model: string;
  last_seen: string;
  note: string | null;
}

interface TaskRow {
  id: string;
  workspace_id: string;
  title: string;
  project: string;
  priority: string;
  status: string;
  due: string;
  owner_id: string;
  tags: string;
  subtasks_done: number;
  subtasks_total: number;
  board: string;
  brief: string;
  acceptance: string;
  next_action: string;
  approval: string;
  output_version: number;
  output_status: string;
  confidence: number | null;
  limitations: string;
  blocked_reason: string | null;
  assigned_agent_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ApprovalRow {
  id: string;
  task_id: string;
  version: number;
  decision: string;
  actor_id: string;
  actor_type: string;
  comment: string | null;
  idempotency_key: string;
  decided_at: string;
}

interface EvidenceRow {
  id: string;
  task_id: string;
  title: string;
  source: string;
  kind: string;
  confidence: number | null;
  verified: string;
}

interface CommentRow {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

interface RunRow {
  id: string;
  workspace_id: string;
  agent_id: string;
  task_id: string | null;
  action: string;
  subject: string;
  state: string;
  approval_required: number;
  output_version: number;
  evidence: string;
  limitations: string;
  failure_reason: string | null;
  decision_comment: string | null;
  started_at: string;
  ended_at: string | null;
}

interface RunEventRow {
  run_id: string;
  state: string;
  note: string | null;
  at: string;
}

const mapAgent = (row: AgentRow) => ({
  id: row.id,
  workspaceId: row.workspace_id,
  name: row.name,
  role: row.role,
  jobdesk: row.jobdesk,
  availability: row.availability,
  capabilities: parseArray<string>(row.capabilities),
  skills: parseArray<string>(row.skills),
  provider: row.provider,
  model: row.model,
  lastSeen: row.last_seen,
  note: row.note ?? undefined,
});

const mapTask = (
  row: TaskRow,
  evidence: EvidenceRow[],
  approvals: ApprovalRow[],
  comments: CommentRow[],
) => ({
  id: row.id,
  workspaceId: row.workspace_id,
  title: row.title,
  project: row.project,
  priority: row.priority,
  status: row.status,
  due: row.due,
  ownerId: row.owner_id,
  tags: parseArray<string>(row.tags),
  subtasksDone: row.subtasks_done,
  subtasksTotal: row.subtasks_total,
  board: row.board,
  brief: row.brief,
  acceptance: parseArray<string>(row.acceptance),
  nextAction: row.next_action,
  approval: row.approval,
  outputVersion: row.output_version,
  outputStatus: row.output_status,
  confidence: row.confidence ?? undefined,
  limitations: parseArray<string>(row.limitations),
  blockedReason: row.blocked_reason ?? undefined,
  assignedAgentId: row.assigned_agent_id ?? undefined,
  evidence: evidence
    .filter((item) => item.task_id === row.id)
    .map((item) => ({
      id: item.id,
      title: item.title,
      source: item.source,
      kind: item.kind,
      confidence: item.confidence ?? 0,
      verified: item.verified,
    })),
  history: approvals
    .filter((item) => item.task_id === row.id)
    .map((item) => ({
      id: item.id,
      version: item.version,
      decision: item.decision,
      actorId: item.actor_id,
      actorType: item.actor_type,
      comment: item.comment ?? undefined,
      at: item.decided_at,
      idempotencyKey: item.idempotency_key,
    })),
  comments: comments
    .filter((item) => item.task_id === row.id)
    .map((item) => ({ id: item.id, authorId: item.author_id, body: item.body, time: item.created_at })),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapRun = (row: RunRow, events: RunEventRow[]) => ({
  id: row.id,
  workspaceId: row.workspace_id,
  agentId: row.agent_id,
  taskId: row.task_id ?? undefined,
  action: row.action,
  subject: row.subject,
  state: row.state,
  approvalRequired: row.approval_required === 1,
  outputVersion: row.output_version,
  evidence: parseArray(row.evidence),
  limitations: parseArray<string>(row.limitations),
  failureReason: row.failure_reason ?? undefined,
  decisionComment: row.decision_comment ?? undefined,
  startedAt: row.started_at,
  endedAt: row.ended_at ?? undefined,
  timeline: events
    .filter((event) => event.run_id === row.id)
    .map((event) => ({ state: event.state, note: event.note ?? undefined, at: event.at })),
});

/* ------------------------------------------------------------------ */
/* Loaders                                                             */
/* ------------------------------------------------------------------ */

async function listWorkspace(env: Env, workspaceId: string) {
  return env.DB.prepare(
    "SELECT id, name, slug, meta, initial, approval_policy AS approvalPolicy FROM workspaces WHERE id = ?",
  )
    .bind(workspaceId)
    .first();
}

async function loadAgents(env: Env, workspaceId: string) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM agents WHERE workspace_id = ? ORDER BY sort_order ASC, name ASC",
  )
    .bind(workspaceId)
    .all<AgentRow>();
  return results.map(mapAgent);
}

async function loadTasks(env: Env, workspaceId: string, taskId?: string) {
  const scoped = taskId
    ? env.DB.prepare("SELECT * FROM tasks WHERE workspace_id = ? AND id = ?").bind(workspaceId, taskId)
    : env.DB.prepare("SELECT * FROM tasks WHERE workspace_id = ? ORDER BY updated_at DESC").bind(workspaceId);
  const { results: tasks } = await scoped.all<TaskRow>();
  if (tasks.length === 0) return [];

  const ids = tasks.map((task) => task.id);
  const placeholders = ids.map(() => "?").join(",");
  const [evidence, approvals, comments] = await Promise.all([
    env.DB.prepare(`SELECT * FROM evidence WHERE task_id IN (${placeholders}) ORDER BY created_at DESC`)
      .bind(...ids)
      .all<EvidenceRow>(),
    env.DB.prepare(`SELECT * FROM approvals WHERE task_id IN (${placeholders}) ORDER BY decided_at DESC`)
      .bind(...ids)
      .all<ApprovalRow>(),
    env.DB.prepare(`SELECT * FROM task_comments WHERE task_id IN (${placeholders}) ORDER BY created_at DESC`)
      .bind(...ids)
      .all<CommentRow>(),
  ]);

  return tasks.map((task) => mapTask(task, evidence.results, approvals.results, comments.results));
}

async function loadRuns(env: Env, workspaceId: string, runId?: string) {
  const scoped = runId
    ? env.DB.prepare("SELECT * FROM runs WHERE workspace_id = ? AND id = ?").bind(workspaceId, runId)
    : env.DB.prepare("SELECT * FROM runs WHERE workspace_id = ? ORDER BY started_at DESC").bind(workspaceId);
  const { results: runs } = await scoped.all<RunRow>();
  if (runs.length === 0) return [];

  const ids = runs.map((run) => run.id);
  const placeholders = ids.map(() => "?").join(",");
  const { results: events } = await env.DB.prepare(
    `SELECT run_id, state, note, at FROM run_events WHERE run_id IN (${placeholders}) ORDER BY at ASC`,
  )
    .bind(...ids)
    .all<RunEventRow>();

  return runs.map((run) => mapRun(run, events));
}

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

const TASK_STATUS = ["backlog", "in_progress", "review", "done"] as const;
const PRIORITY = ["high", "medium", "low"] as const;
const DECISIONS = ["approved", "changes_requested", "rejected"] as const;
const ACTIVE_RUN_STATES = ["queued", "running", "received", "qc", "owner_review"] as const;

const nextActionFor = (status: string) => {
  if (status === "done") return "Approved output archived — keep the audit trail.";
  if (status === "review") return "Owner review and approval decision.";
  if (status === "in_progress") return "Finish the output and attach evidence.";
  return "Confirm the brief and start production.";
};

async function health(env: Env) {
  let database = "ok";
  try {
    await env.DB.prepare("SELECT 1").first();
  } catch {
    database = "unavailable";
  }
  return json({
    ok: database === "ok",
    service: "playdesign-office-crm",
    api: "v1",
    database,
    dataMode: "demo-seed",
    time: nowIso(),
  });
}

async function office(env: Env, req: Request) {
  const url = new URL(req.url);
  const workspaceId = await assertWorkspace(env, url.searchParams.get("workspace"));
  const actor = await authenticate(env, workspaceId, req);
  const [workspace, agents, tasks, runs, activity, schedules, reports, deals, leads, posts] = await Promise.all([
    listWorkspace(env, workspaceId),
    loadAgents(env, workspaceId),
    loadTasks(env, workspaceId),
    loadRuns(env, workspaceId),
    env.DB.prepare(
      "SELECT * FROM activity_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50",
    )
      .bind(workspaceId)
      .all(),
    env.DB.prepare(
      `SELECT s.*, p.title, p.caption FROM schedules s
       JOIN posts p ON p.id = s.post_id
       WHERE s.workspace_id = ? ORDER BY s.scheduled_for ASC`,
    )
      .bind(workspaceId)
      .all(),
    env.DB.prepare("SELECT * FROM reports WHERE workspace_id = ? ORDER BY generated_at DESC")
      .bind(workspaceId)
      .all(),
    env.DB.prepare("SELECT * FROM deals WHERE workspace_id = ? ORDER BY value DESC")
      .bind(workspaceId)
      .all(),
    env.DB.prepare("SELECT * FROM leads WHERE workspace_id = ? ORDER BY score DESC")
      .bind(workspaceId)
      .all(),
    env.DB.prepare("SELECT * FROM posts WHERE workspace_id = ? ORDER BY scheduled_for ASC")
      .bind(workspaceId)
      .all(),
  ]);

  const pendingApprovals = tasks.filter((task) => task.approval === "pending").length;
  const openRuns = runs.filter((run) => (ACTIVE_RUN_STATES as readonly string[]).includes(run.state)).length;

  return json({
    workspace,
    actor,
    agents,
    tasks,
    approvals: tasks.filter((task) => task.approval === "pending"),
    runs,
    activity: activity.results.map((row) => ({
      id: row.id as string,
      entityType: row.entity_type as string,
      entityId: row.entity_id as string,
      taskId: (row.task_id as string | null) ?? undefined,
      actorType: row.actor_type as string,
      actorId: row.actor_id as string,
      action: row.action as string,
      result: row.result as string,
      meta: (row.meta as string | null) ?? undefined,
      at: row.created_at as string,
    })),
    schedules: schedules.results.map((row) => ({
      id: row.id as string,
      postId: row.post_id as string,
      title: row.title as string,
      caption: row.caption as string,
      platform: row.platform as string,
      scheduledFor: row.scheduled_for as string,
      status: row.status as string,
      ownerId: row.owner_id as string,
    })),
    reports: reports.results.map((row) => ({
      id: row.id as string,
      kind: row.kind as string,
      period: row.period as string,
      payload: parseRecord(row.payload as string),
      generatedAt: row.generated_at as string,
    })),
    deals: deals.results.map((row) => ({
      id: row.id as string,
      company: row.company as string,
      title: row.title as string,
      value: row.value as number,
      stage: row.stage as string,
      contact: row.contact as string,
      ownerId: row.owner_id as string,
      score: row.score as number,
      due: row.due as string,
      tags: parseArray<string>(row.tags as string),
      source: row.source as string,
    })),
    leads: leads.results.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      company: row.company as string,
      role: row.role as string,
      email: row.email as string,
      phone: (row.phone as string | null) ?? undefined,
      location: (row.location as string | null) ?? undefined,
      status: row.status as string,
      source: row.source as string,
      score: row.score as number,
      value: row.value as number,
      ownerId: row.owner_id as string,
      lastActivity: row.last_activity as string,
      tags: parseArray<string>(row.tags as string),
      nextStep: (row.next_step as string | null) ?? undefined,
      notes: (row.notes as string | null) ?? undefined,
      category: (row.category as string | null) ?? undefined,
      fullAddress: (row.full_address as string | null) ?? undefined,
      rating: (row.rating as number | null) ?? undefined,
      whatsappVerified: row.whatsapp_verified === 1,
      whatsappLink: (row.whatsapp_link as string | null) ?? undefined,
      googleMapsUrl: (row.google_maps_url as string | null) ?? undefined,
      confidenceScore: (row.confidence_score as number | null) ?? undefined,
    })),
    posts: posts.results.map((row) => ({
      id: row.id as string,
      title: row.title as string,
      caption: row.caption as string,
      platform: row.platform as string,
      scheduledFor: row.scheduled_for as string,
      status: row.status as string,
      format: row.format as string,
      ownerId: row.owner_id as string,
      reach: (row.reach as number | null) ?? undefined,
      engagement: (row.engagement as number | null) ?? undefined,
    })),
    counts: { tasks: tasks.length, pendingApprovals, openRuns, agents: agents.length },
    dataMode: "demo-seed",
  });
}

async function createTask(env: Env, req: Request) {
  const body = await readJson(req);
  const workspaceId = await assertWorkspace(env, body.workspaceId);
  const actor = await authenticate(env, workspaceId, req);
  const raw = JSON.stringify(body);

  const key = req.headers.get("idempotency-key")?.trim();
  if (!key) fail(400, "idempotency_key_required", "POST /api/tasks requires an Idempotency-Key header.");

  return runIdempotent(env, { key, scope: "task:create", actor, raw }, async () => {
    const title = str(body.title, "title", 3, 200);
    const project = str(body.project, "project", 1, 120);
    const priority = oneOf(body.priority, "priority", PRIORITY);
    const status = body.status === undefined ? "backlog" : oneOf(body.status, "status", TASK_STATUS);
    if (status === "review" || status === "done") {
      fail(400, "validation_failed", "Create tasks in backlog or in_progress; submit for review with PATCH.");
    }
    const due = str(body.due, "due", 4, 40);
    const ownerId = str(body.ownerId, "ownerId", 1, 80);
    const tags = Array.isArray(body.tags) ? body.tags.map((tag) => str(tag, "tags", 1, 40)) : [];
    const subtasksDone = optionalInt(body.subtasksDone, "subtasksDone", 0, 999) ?? 0;
    const subtasksTotal = optionalInt(body.subtasksTotal, "subtasksTotal", 0, 999) ?? 0;
    if (subtasksDone > subtasksTotal) {
      fail(400, "validation_failed", "subtasksDone cannot exceed subtasksTotal.");
    }

    const owner = await env.DB.prepare("SELECT id FROM actors WHERE workspace_id = ? AND id = ?")
      .bind(workspaceId, ownerId)
      .first();
    if (!owner) fail(400, "validation_failed", "ownerId must be a member of the workspace.");

    const assignedAgentId = optionalStr(body.assignedAgentId, "assignedAgentId", 80);
    if (assignedAgentId) {
      const agent = await env.DB.prepare("SELECT id FROM agents WHERE workspace_id = ? AND id = ?")
        .bind(workspaceId, assignedAgentId)
        .first();
      if (!agent) fail(400, "validation_failed", "assignedAgentId must belong to the workspace.");
    }

    const id = uid("t");
    const at = nowIso();
    const task = {
      id,
      workspaceId,
      title,
      project,
      priority,
      status,
      due,
      ownerId,
      tags,
      subtasksDone,
      subtasksTotal,
      board: optionalStr(body.board, "board", 120) ?? "Studio delivery",
      brief:
        optionalStr(body.brief, "brief", 4000) ??
        `New work for ${project}. Add acceptance criteria and evidence before submitting for approval.`,
      acceptance: Array.isArray(body.acceptance)
        ? body.acceptance.map((item) => str(item, "acceptance", 1, 300))
        : ["Brief confirmed", "Evidence attached where claims are made", "Owner approval before external action"],
      nextAction: nextActionFor(status),
      approval: "none",
      outputVersion: 0,
      outputStatus: "draft",
      blockedReason: null,
      assignedAgentId: assignedAgentId ?? null,
    };

    const statements = [
      env.DB.prepare(
        `INSERT INTO tasks
          (id, workspace_id, title, project, priority, status, due, owner_id, tags, subtasks_done, subtasks_total,
           board, brief, acceptance, next_action, approval, output_version, output_status, confidence, limitations,
           blocked_reason, assigned_agent_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', 0, 'draft', NULL, '[]', NULL, ?, ?, ?)`,
      ).bind(
        id,
        workspaceId,
        title,
        project,
        priority,
        status,
        due,
        ownerId,
        JSON.stringify(tags),
        subtasksDone,
        subtasksTotal,
        task.board,
        task.brief,
        JSON.stringify(task.acceptance),
        task.nextAction,
        assignedAgentId ?? null,
        at,
        at,
      ),
      auditStatement(env, {
        workspaceId,
        entityType: "task",
        entityId: id,
        taskId: id,
        actor,
        action: "Created task",
        meta: `${title} · ${project}`,
      }),
    ];
    await env.DB.batch(statements);

    const created = await loadTasks(env, workspaceId, id);
    return { status: 201, body: { task: created[0] } };
  });
}

async function getTask(env: Env, req: Request, taskId: string) {
  const url = new URL(req.url);
  const workspaceId = await assertWorkspace(env, url.searchParams.get("workspace"));
  await authenticate(env, workspaceId, req);
  const task = await loadTasks(env, workspaceId, taskId);
  if (task.length === 0) fail(404, "task_not_found", "Task not found in this workspace.");
  return json({ task: task[0] });
}

async function patchTask(env: Env, req: Request, taskId: string) {
  const body = await readJson(req);
  const workspaceId = await assertWorkspace(env, body.workspaceId);
  const actor = await authenticate(env, workspaceId, req);
  const raw = JSON.stringify(body);
  const key = req.headers.get("idempotency-key")?.trim();
  if (!key) fail(400, "idempotency_key_required", "PATCH /api/tasks/:id requires an Idempotency-Key header.");

  return runIdempotent(env, { key, scope: `task:patch:${taskId}`, actor, raw }, async () => {
    const current = await env.DB.prepare("SELECT * FROM tasks WHERE workspace_id = ? AND id = ?")
      .bind(workspaceId, taskId)
      .first<TaskRow>();
    if (!current) fail(404, "task_not_found", "Task not found in this workspace.");

    const sets: string[] = [];
    const values: (string | number | null)[] = [];
    const push = (column: string, value: string | number | null) => {
      sets.push(`${column} = ?`);
      values.push(value);
    };

    if (body.title !== undefined) push("title", str(body.title, "title", 3, 200));
    if (body.priority !== undefined) push("priority", oneOf(body.priority, "priority", PRIORITY));
    if (body.due !== undefined) push("due", str(body.due, "due", 4, 40));
    if (body.nextAction !== undefined) push("next_action", str(body.nextAction, "nextAction", 1, 300));

    if (body.ownerId !== undefined) {
      const ownerId = str(body.ownerId, "ownerId", 1, 80);
      const owner = await env.DB.prepare("SELECT id FROM actors WHERE workspace_id = ? AND id = ?")
        .bind(workspaceId, ownerId)
        .first();
      if (!owner) fail(400, "validation_failed", "ownerId must be a member of the workspace.");
      push("owner_id", ownerId);
    }

    if (body.assignedAgentId !== undefined) {
      if (body.assignedAgentId === null) {
        push("assigned_agent_id", null);
      } else {
        const assignedAgentId = str(body.assignedAgentId, "assignedAgentId", 1, 80);
        const agent = await env.DB.prepare("SELECT id FROM agents WHERE workspace_id = ? AND id = ?")
          .bind(workspaceId, assignedAgentId)
          .first();
        if (!agent) fail(400, "validation_failed", "assignedAgentId must belong to the workspace.");
        push("assigned_agent_id", assignedAgentId);
      }
    }

    if (body.subtasksDone !== undefined || body.subtasksTotal !== undefined) {
      const done = optionalInt(body.subtasksDone, "subtasksDone", 0, 999) ?? current.subtasks_done;
      const total = optionalInt(body.subtasksTotal, "subtasksTotal", 0, 999) ?? current.subtasks_total;
      if (done > total) fail(400, "validation_failed", "subtasksDone cannot exceed subtasksTotal.");
      if (body.subtasksDone !== undefined) push("subtasks_done", done);
      if (body.subtasksTotal !== undefined) push("subtasks_total", total);
    }

    const extra: D1PreparedStatement[] = [];
    const status = body.status === undefined ? current.status : oneOf(body.status, "status", TASK_STATUS);
    const resubmitting =
      current.approval === "changes_requested" || current.approval === "rejected";
    const movingToReview =
      status === "review" && current.status !== "review" && (current.approval === "none" || resubmitting);
    const movingToDone = status === "done" && current.status !== "done";

    if (movingToDone && current.approval !== "approved") {
      fail(409, "approval_required", "A task can only be marked done after its current output is approved.");
    }

    if (status !== current.status) {
      push("status", status);
      if (!body.nextAction) push("next_action", nextActionFor(status));
    }

    if (movingToReview) {
      const version = resubmitting
        ? current.output_version + 1
        : Math.max(current.output_version, 1);
      extra.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO task_outputs
            (id, task_id, version, status, content, confidence, limitations, created_by, created_at)
           VALUES (?, ?, ?, 'owner_review', NULL, ?, '[]', ?, ?)`,
        ).bind(uid("out"), taskId, version, current.confidence, actor.id, nowIso()),
        env.DB.prepare(
          `INSERT INTO approvals
            (id, task_id, version, decision, actor_id, actor_type, comment, idempotency_key, decided_at)
           VALUES (?, ?, ?, 'submitted', ?, ?, NULL, ?, ?)`,
        ).bind(uid("ap"), taskId, version, actor.id, actor.role, `${taskId}:v${version}:submitted`, nowIso()),
      );
      push("approval", "pending");
      push("output_version", version);
      push("output_status", "owner_review");
      push("next_action", `Owner review of output v${version}.`);
    }

    push("updated_at", nowIso());

    if (sets.length === 0 && extra.length === 0) {
      fail(400, "validation_failed", "No supported fields were provided.");
    }

    const update = env.DB.prepare(
      `UPDATE tasks SET ${sets.join(", ")} WHERE workspace_id = ? AND id = ?`,
    ).bind(...values, workspaceId, taskId);

    const audit = auditStatement(env, {
      workspaceId,
      entityType: "task",
      entityId: taskId,
      taskId,
      actor,
      action: movingToReview ? "Submitted output for owner review" : `Updated task (${status})`,
      result: movingToReview ? "pending" : "ok",
      meta: current.title,
    });

    await env.DB.batch([update, ...extra, audit]);

    const updated = await loadTasks(env, workspaceId, taskId);
    return { status: 200, body: { task: updated[0] } };
  });
}

async function listApprovals(env: Env, req: Request) {
  const url = new URL(req.url);
  const workspaceId = await assertWorkspace(env, url.searchParams.get("workspace"));
  await authenticate(env, workspaceId, req);
  const tasks = await loadTasks(env, workspaceId);
  const approvals = tasks.filter((task) => task.approval === "pending");
  return json({ approvals, count: approvals.length });
}

async function decideApproval(env: Env, req: Request, id: string) {
  const body = await readJson(req);
  const workspaceId = await assertWorkspace(env, body.workspaceId);
  const actor = await authenticate(env, workspaceId, req);
  requireOwner(actor);

  const decision = oneOf(body.decision, "decision", DECISIONS);
  const comment = optionalStr(body.comment, "comment", 1000) ?? "";
  if (decision !== "approved" && !comment) {
    fail(400, "validation_failed", "A short reason is required to request changes or reject.");
  }

  const byApproval = await env.DB.prepare("SELECT task_id FROM approvals WHERE id = ?").bind(id).first<{
    task_id: string;
  }>();
  const taskId = byApproval?.task_id ?? id;

  const task = await env.DB.prepare("SELECT * FROM tasks WHERE workspace_id = ? AND id = ?")
    .bind(workspaceId, taskId)
    .first<TaskRow>();
  if (!task) fail(404, "task_not_found", "Task not found in this workspace.");

  const expectedVersion = optionalInt(body.version, "version", 1, 1000);
  const raw = JSON.stringify(body);
  const key = req.headers.get("idempotency-key")?.trim() || `${taskId}:v${task.output_version}:${decision}`;
  const scope = "approval:decision";

  return runIdempotent(env, { key, scope, actor, raw }, async () => {
    // Re-read inside the idempotency boundary so a replay returns the stored
    // response instead of tripping the pending/version guards.
    const fresh = await env.DB.prepare("SELECT * FROM tasks WHERE workspace_id = ? AND id = ?")
      .bind(workspaceId, taskId)
      .first<TaskRow>();
    if (!fresh) fail(404, "task_not_found", "Task not found in this workspace.");
    if (fresh.approval !== "pending") {
      fail(409, "no_pending_approval", "There is no pending approval for this task.");
    }
    if (expectedVersion !== undefined && expectedVersion !== fresh.output_version) {
      fail(409, "stale_version", "This approval targets an older output version. Reload before deciding.");
    }

    const version = fresh.output_version;
    const nextStatus = decision === "approved" ? "done" : decision === "rejected" ? "backlog" : "in_progress";
    const outputStatus = decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "draft";
    const nextAction =
      decision === "approved"
        ? "Approved — schedule from the content queue and publish explicitly."
        : decision === "changes_requested"
          ? "Apply the requested changes, then submit a new version."
          : "Revise the brief before resubmitting.";

    const statements: D1PreparedStatement[] = [
      env.DB.prepare(
        `INSERT INTO approvals
          (id, task_id, version, decision, actor_id, actor_type, comment, idempotency_key, decided_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        uid("ap"),
        taskId,
        version,
        decision,
        actor.id,
        actor.role,
        comment || null,
        `${taskId}:v${version}:${decision}`,
        nowIso(),
      ),
      env.DB.prepare(
        `UPDATE tasks SET status = ?, approval = ?, output_status = ?, next_action = ?,
           subtasks_done = CASE WHEN ? = 'approved' THEN subtasks_total ELSE subtasks_done END,
           updated_at = ?
         WHERE workspace_id = ? AND id = ?`,
      ).bind(nextStatus, decision, outputStatus, nextAction, decision, nowIso(), workspaceId, taskId),
      env.DB.prepare(
        `UPDATE task_outputs SET status = ? WHERE task_id = ? AND version = ?`,
      ).bind(outputStatus, taskId, version),
      auditStatement(env, {
        workspaceId,
        entityType: "approval",
        entityId: taskId,
        taskId,
        actor,
        action: `Approval decision: ${decision.replace("_", " ")}`,
        meta: `${fresh.title} · v${version}${comment ? ` · ${comment}` : ""}`,
      }),
    ];

    try {
      await env.DB.batch(statements);
    } catch {
      const duplicate = await env.DB.prepare(
        "SELECT id FROM approvals WHERE idempotency_key = ?",
      )
        .bind(`${taskId}:v${version}:${decision}`)
        .first();
      if (duplicate) {
        fail(409, "duplicate_decision", "This output version already has that decision.");
      }
      throw new Error("approval_write_failed");
    }

    const updated = await loadTasks(env, workspaceId, taskId);
    return { status: 200, body: { task: updated[0], decision, version } };
  });
}

async function activity(env: Env, req: Request) {
  const url = new URL(req.url);
  const workspaceId = await assertWorkspace(env, url.searchParams.get("workspace"));
  await authenticate(env, workspaceId, req);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 200);
  const { results } = await env.DB.prepare(
    "SELECT * FROM activity_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?",
  )
    .bind(workspaceId, limit)
    .all();
  return json({
    activity: results.map((row) => ({
      id: row.id as string,
      entityType: row.entity_type as string,
      entityId: row.entity_id as string,
      taskId: (row.task_id as string | null) ?? undefined,
      actorType: row.actor_type as string,
      actorId: row.actor_id as string,
      action: row.action as string,
      result: row.result as string,
      meta: (row.meta as string | null) ?? undefined,
      at: row.created_at as string,
    })),
    count: results.length,
  });
}

async function schedules(env: Env, req: Request) {
  const url = new URL(req.url);
  const workspaceId = await assertWorkspace(env, url.searchParams.get("workspace"));
  await authenticate(env, workspaceId, req);
  const { results } = await env.DB.prepare(
    `SELECT s.*, p.title, p.caption, p.status AS post_status FROM schedules s
     JOIN posts p ON p.id = s.post_id
     WHERE s.workspace_id = ? ORDER BY s.scheduled_for ASC`,
  )
    .bind(workspaceId)
    .all();
  return json({
    schedules: results.map((row) => ({
      id: row.id,
      postId: row.post_id,
      title: row.title,
      caption: row.caption,
      platform: row.platform,
      scheduledFor: row.scheduled_for,
      status: row.status,
      postStatus: row.post_status,
      ownerId: row.owner_id,
    })),
    count: results.length,
  });
}

async function reports(env: Env, req: Request) {
  const url = new URL(req.url);
  const workspaceId = await assertWorkspace(env, url.searchParams.get("workspace"));
  await authenticate(env, workspaceId, req);

  const [stored, taskStats, runStats, dealStats] = await Promise.all([
    env.DB.prepare("SELECT * FROM reports WHERE workspace_id = ? ORDER BY generated_at DESC")
      .bind(workspaceId)
      .all(),
    env.DB.prepare(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
        SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) AS review,
        SUM(CASE WHEN approval = 'pending' THEN 1 ELSE 0 END) AS pending
       FROM tasks WHERE workspace_id = ?`,
    )
      .bind(workspaceId)
      .first<{ total: number; done: number; review: number; pending: number }>(),
    env.DB.prepare("SELECT state, COUNT(*) AS count FROM runs WHERE workspace_id = ? GROUP BY state")
      .bind(workspaceId)
      .all<{ state: string; count: number }>(),
    env.DB.prepare(
      `SELECT stage, COUNT(*) AS count, SUM(value) AS value FROM deals
       WHERE workspace_id = ? GROUP BY stage`,
    )
      .bind(workspaceId)
      .all<{ stage: string; count: number; value: number }>(),
  ]);

  const openRuns = runStats.results
    .filter((row) => (ACTIVE_RUN_STATES as readonly string[]).includes(row.state))
    .reduce((sum, row) => sum + row.count, 0);

  return json({
    reports: stored.results.map((row) => ({
      id: row.id,
      kind: row.kind,
      period: row.period,
      payload: parseRecord(row.payload as string),
      generatedAt: row.generated_at,
    })),
    summary: {
      tasks: taskStats ?? { total: 0, done: 0, review: 0, pending: 0 },
      openRuns,
      runsByState: runStats.results,
      dealsByStage: dealStats.results.map((row) => ({
        stage: row.stage,
        count: row.count,
        value: row.value,
      })),
    },
    dataMode: "demo-seed",
  });
}

async function copilotPreview(env: Env, req: Request) {
  const body = await readJson(req);
  const workspaceId = await assertWorkspace(env, body.workspaceId);
  const actor = await authenticate(env, workspaceId, req);
  const raw = JSON.stringify(body);
  const key = req.headers.get("idempotency-key")?.trim();
  if (!key) fail(400, "idempotency_key_required", "Copilot preview requires an Idempotency-Key header.");

  return runIdempotent(env, { key, scope: "copilot:preview", actor, raw }, async () => {
    const action = str(body.action, "action", 3, 200);
    const subject = str(body.subject, "subject", 2, 200);
    const agentId = body.agentId === undefined ? "nova" : str(body.agentId, "agentId", 1, 80);
    const approvalRequired = optionalBool(body.approvalRequired, "approvalRequired") ?? true;

    const agent = await env.DB.prepare("SELECT * FROM agents WHERE workspace_id = ? AND id = ?")
      .bind(workspaceId, agentId)
      .first<AgentRow>();
    if (!agent) fail(400, "validation_failed", "agentId must belong to the workspace.");
    if (agent.availability === "unavailable") {
      fail(
        409,
        "agent_unavailable",
        `${agent.name} is unavailable${agent.note ? ` (${agent.note})` : ""}. No run was created.`,
      );
    }

    const taskId = optionalStr(body.taskId, "taskId", 80) ?? null;
    if (taskId) {
      const task = await env.DB.prepare("SELECT id FROM tasks WHERE workspace_id = ? AND id = ?")
        .bind(workspaceId, taskId)
        .first();
      if (!task) fail(400, "validation_failed", "taskId must belong to the workspace.");
    }

    const id = uid("cp");
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO copilot_proposals
          (id, workspace_id, actor_id, agent_id, action, subject, task_id, approval_required, token, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        workspaceId,
        actor.id,
        agentId,
        action,
        subject,
        taskId,
        approvalRequired ? 1 : 0,
        token,
        expiresAt,
        nowIso(),
      ),
      auditStatement(env, {
        workspaceId,
        entityType: "copilot",
        entityId: id,
        taskId,
        actor,
        action: "Copilot preview generated",
        result: "pending",
        meta: `${agent.name} · ${action} · ${subject}`,
      }),
    ]);

    return {
      status: 201,
      body: {
        proposal: {
          id,
          action,
          subject,
          agent: { id: agent.id, name: agent.name, role: agent.role, availability: agent.availability },
          taskId,
          approvalRequired,
          requiresConfirmation: true,
          confirmationToken: token,
          expiresAt,
          sideEffects: [
            `Creates a run for ${agent.name} in this workspace.`,
            approvalRequired
              ? "Output waits for owner approval before any external action."
              : "No external action is taken without an explicit owner decision.",
          ],
        },
        dataMode: "demo-seed",
      },
    };
  });
}

async function copilotExecute(env: Env, req: Request) {
  const body = await readJson(req);
  const workspaceId = await assertWorkspace(env, body.workspaceId);
  const actor = await authenticate(env, workspaceId, req);
  const raw = JSON.stringify(body);
  const key = req.headers.get("idempotency-key")?.trim();
  if (!key) fail(400, "idempotency_key_required", "Copilot execute requires an Idempotency-Key header.");

  return runIdempotent(env, { key, scope: "copilot:execute", actor, raw }, async () => {
    const token = str(body.token, "token", 16, 200);
    const proposal = await env.DB.prepare(
      "SELECT * FROM copilot_proposals WHERE workspace_id = ? AND token = ?",
    )
      .bind(workspaceId, token)
      .first<{
        id: string;
        actor_id: string;
        agent_id: string;
        action: string;
        subject: string;
        task_id: string | null;
        approval_required: number;
        expires_at: string;
        executed_at: string | null;
      }>();

    if (!proposal) fail(404, "proposal_not_found", "No matching copilot proposal for this workspace.");
    if (proposal.actor_id !== actor.id) fail(403, "forbidden", "This proposal belongs to another actor.");
    if (proposal.executed_at) fail(409, "already_executed", "This proposal was already executed.");
    if (Date.parse(proposal.expires_at) <= Date.now()) {
      fail(410, "proposal_expired", "This proposal expired. Generate a new preview.");
    }

    const agent = await env.DB.prepare("SELECT * FROM agents WHERE id = ?").bind(proposal.agent_id).first<AgentRow>();
    if (!agent) fail(409, "agent_missing", "The selected agent no longer exists.");
    if (agent.availability === "unavailable") {
      fail(
        409,
        "agent_unavailable",
        `${agent.name} is unavailable${agent.note ? ` (${agent.note})` : ""}. No run was created.`,
      );
    }

    const runId = uid("r");
    const at = nowIso();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO runs
          (id, workspace_id, agent_id, task_id, action, subject, state, approval_required, output_version,
           evidence, limitations, failure_reason, decision_comment, started_at, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, 1, '[]', '[]', NULL, NULL, ?, NULL)`,
      ).bind(
        runId,
        workspaceId,
        agent.id,
        proposal.task_id,
        proposal.action,
        proposal.subject,
        proposal.approval_required,
        at,
      ),
      env.DB.prepare("INSERT INTO run_events (id, run_id, state, note, at) VALUES (?, ?, 'queued', NULL, ?)").bind(
        uid("re"),
        runId,
        at,
      ),
      env.DB.prepare("UPDATE copilot_proposals SET executed_at = ? WHERE id = ?").bind(at, proposal.id),
      auditStatement(env, {
        workspaceId,
        entityType: "copilot",
        entityId: proposal.id,
        taskId: proposal.task_id,
        actor,
        action: "Copilot proposal confirmed",
        meta: `${agent.name} · ${proposal.action} · ${proposal.subject}`,
      }),
      auditStatement(env, {
        workspaceId,
        entityType: "run",
        entityId: runId,
        taskId: proposal.task_id,
        actor,
        action: "Agent run queued",
        result: "pending",
        meta: `${agent.name} · ${proposal.subject}`,
      }),
    ]);

    const runs = await loadRuns(env, workspaceId, runId);
    return { status: 201, body: { run: runs[0] } };
  });
}

async function listRuns(env: Env, req: Request) {
  const url = new URL(req.url);
  const workspaceId = await assertWorkspace(env, url.searchParams.get("workspace"));
  await authenticate(env, workspaceId, req);
  return json({ runs: await loadRuns(env, workspaceId) });
}

async function getRun(env: Env, req: Request, runId: string) {
  const url = new URL(req.url);
  const workspaceId = await assertWorkspace(env, url.searchParams.get("workspace"));
  await authenticate(env, workspaceId, req);
  const runs = await loadRuns(env, workspaceId, runId);
  if (runs.length === 0) fail(404, "run_not_found", "Run not found in this workspace.");
  return json({ run: runs[0] });
}

async function decideRun(env: Env, req: Request, runId: string) {
  const body = await readJson(req);
  const workspaceId = await assertWorkspace(env, body.workspaceId);
  const actor = await authenticate(env, workspaceId, req);
  requireOwner(actor);

  const decision = oneOf(body.decision, "decision", DECISIONS);
  const comment = optionalStr(body.comment, "comment", 1000) ?? "";
  if (decision !== "approved" && !comment) {
    fail(400, "validation_failed", "A short reason is required to request changes or reject.");
  }

  const raw = JSON.stringify(body);
  const key = req.headers.get("idempotency-key")?.trim() || `run:${runId}:${decision}`;

  return runIdempotent(env, { key, scope: "run:decision", actor, raw }, async () => {
    const run = await env.DB.prepare("SELECT * FROM runs WHERE workspace_id = ? AND id = ?")
      .bind(workspaceId, runId)
      .first<RunRow>();
    if (!run) fail(404, "run_not_found", "Run not found in this workspace.");
    if (run.state === decision) {
      const replay = await loadRuns(env, workspaceId, runId);
      return { status: 200, body: { run: replay[0], duplicate: true } };
    }
    if (run.state !== "owner_review") {
      fail(409, "invalid_run_state", "Only runs in owner review can receive a decision.");
    }

    await env.DB.batch([
      env.DB.prepare(
        "UPDATE runs SET state = ?, decision_comment = ?, ended_at = ? WHERE workspace_id = ? AND id = ?",
      ).bind(decision, comment || null, nowIso(), workspaceId, runId),
      env.DB.prepare("INSERT INTO run_events (id, run_id, state, note, at) VALUES (?, ?, ?, ?, ?)").bind(
        uid("re"),
        runId,
        decision,
        comment || null,
        nowIso(),
      ),
      auditStatement(env, {
        workspaceId,
        entityType: "run",
        entityId: runId,
        taskId: run.task_id,
        actor,
        action: `Run decision: ${decision.replace("_", " ")}`,
        meta: `${run.action} · ${run.subject}${comment ? ` · ${comment}` : ""}`,
      }),
    ]);

    const updated = await loadRuns(env, workspaceId, runId);
    return { status: 200, body: { run: updated[0], decision } };
  });
}

async function stopRun(env: Env, req: Request, runId: string) {
  const body = await readJson(req);
  const workspaceId = await assertWorkspace(env, body.workspaceId);
  const actor = await authenticate(env, workspaceId, req);
  const raw = JSON.stringify(body);
  const key = req.headers.get("idempotency-key")?.trim() || `run:${runId}:cancelled`;

  return runIdempotent(env, { key, scope: "run:stop", actor, raw }, async () => {
    const run = await env.DB.prepare("SELECT * FROM runs WHERE workspace_id = ? AND id = ?")
      .bind(workspaceId, runId)
      .first<RunRow>();
    if (!run) fail(404, "run_not_found", "Run not found in this workspace.");
    if (!(ACTIVE_RUN_STATES as readonly string[]).includes(run.state)) {
      fail(409, "invalid_run_state", "Only active runs can be stopped.");
    }

    await env.DB.batch([
      env.DB.prepare(
        "UPDATE runs SET state = 'cancelled', failure_reason = ?, ended_at = ? WHERE workspace_id = ? AND id = ?",
      ).bind(`Stopped by ${actor.name} before completion. Nothing further was executed.`, nowIso(), workspaceId, runId),
      env.DB.prepare("INSERT INTO run_events (id, run_id, state, note, at) VALUES (?, ?, 'cancelled', ?, ?)").bind(
        uid("re"),
        runId,
        `Stopped by ${actor.name}`,
        nowIso(),
      ),
      auditStatement(env, {
        workspaceId,
        entityType: "run",
        entityId: runId,
        taskId: run.task_id,
        actor,
        action: "Run stopped",
        meta: `${run.action} · ${run.subject}`,
      }),
    ]);

    const updated = await loadRuns(env, workspaceId, runId);
    return { status: 200, body: { run: updated[0] } };
  });
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method;

  if (!path.startsWith("/api/")) {
    return env.ASSETS.fetch(req);
  }

  if (path !== "/api/health") assertToken(req, env);

  if (path === "/api/health" && method === "GET") return health(env);

  if (path === "/api/agent/chat" && method === "POST") return handleAgentChat(env, req, json);

  if (path === "/api/agent/messages" && method === "GET") return handleGetAgentMessages(env, req, json);
  if (path === "/api/agent/messages" && method === "DELETE") return handleClearAgentMessages(env, req, json);

  if (path === "/api/qc/run" && method === "POST") return json(await runQcGate(env));

  if (path === "/api/leads/sync" && method === "POST") {
    try {
      const body = (await req.json().catch(() => ({}))) as { leads?: any[] };
      const leads = Array.isArray(body?.leads) ? body.leads : [];
      const result = await insertScrapedLeads(env, leads);
      return json({
        ok: true,
        inserted: result.inserted,
        errors: result.errors,
      });
    } catch (err: any) {
      return json({ ok: false, error: err.message }, 500);
    }
  }

  if (path === "/api/qc/report" && method === "POST") {
    const body = (await req.json().catch(() => null)) as
      | { postId?: string; comment?: string; state?: string }
      | null;
    if (!body?.postId || !body?.comment) {
      return json({ error: { code: "invalid_request", message: "postId dan comment wajib diisi." } }, 400);
    }
    const saved = await saveQcNote(env, {
      postId: body.postId,
      comment: body.comment,
      state: body.state as never,
    });
    if (!saved) {
      return json({ error: { code: "run_not_found", message: "Belum ada run QC untuk post ini." } }, 404);
    }
    return json(saved);
  }

  if (path === "/api/office" && method === "GET") return office(env, req);
  if (path === "/api/tasks" && method === "GET") {
    const workspaceId = await assertWorkspace(env, url.searchParams.get("workspace"));
    await authenticate(env, workspaceId, req);
    return json({ tasks: await loadTasks(env, workspaceId) });
  }
  if (path === "/api/tasks" && method === "POST") return createTask(env, req);

  const taskMatch = /^\/api\/tasks\/([^/]+)$/.exec(path);
  if (taskMatch) {
    const taskId = decodeURIComponent(taskMatch[1]);
    if (method === "GET") return getTask(env, req, taskId);
    if (method === "PATCH") return patchTask(env, req, taskId);
    return json({ error: { code: "method_not_allowed", message: "Use GET or PATCH." } }, 405, {
      allow: "GET, PATCH",
    });
  }

  if (path === "/api/approvals" && method === "GET") return listApprovals(env, req);
  const approvalMatch = /^\/api\/approvals\/([^/]+)\/decision$/.exec(path);
  if (approvalMatch && method === "POST") return decideApproval(env, req, decodeURIComponent(approvalMatch[1]));

  if (path === "/api/activity" && method === "GET") return activity(env, req);
  if (path === "/api/schedules" && method === "GET") return schedules(env, req);
  if (path === "/api/reports" && method === "GET") return reports(env, req);
  if (path === "/api/copilot/preview" && method === "POST") return copilotPreview(env, req);
  if (path === "/api/copilot/execute" && method === "POST") return copilotExecute(env, req);

  if (path === "/api/runs" && method === "GET") return listRuns(env, req);
  const runDecision = /^\/api\/runs\/([^/]+)\/decision$/.exec(path);
  if (runDecision && method === "POST") return decideRun(env, req, decodeURIComponent(runDecision[1]));
  const runStop = /^\/api\/runs\/([^/]+)\/stop$/.exec(path);
  if (runStop && method === "POST") return stopRun(env, req, decodeURIComponent(runStop[1]));
  const runMatch = /^\/api\/runs\/([^/]+)$/.exec(path);
  if (runMatch && method === "GET") return getRun(env, req, decodeURIComponent(runMatch[1]));

  fail(404, "not_found", "Unknown API route.");
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: { allow: "GET, POST, PATCH, OPTIONS" },
        });
      }
      return await route(req, env);
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error);
      console.error("unhandled_api_error", error);
      return json({ error: { code: "internal_error", message: "The request could not be completed." } }, 500);
    }
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runQcGate(env).then(
        (summary) =>
          console.log(
            "qc_gate_ok",
            JSON.stringify({ posts: summary.posts, passed: summary.passed, blocked: summary.blocked }),
          ),
        (error) => console.error("qc_gate_failed", error),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
