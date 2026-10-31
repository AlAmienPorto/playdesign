import type { Priority, TaskStatus } from "../data/mock";
import {
  type ActorType,
  type ApprovalRecord,
  type AuditEvent,
  type Evidence,
  type OfficeRun,
  type OfficeTask,
  type OutputStatus,
  type RunState,
  type WorkspaceId,
} from "../data/office";
import { timeAgo } from "./utils";

/*
 * Pilot transport for tasks, approvals and runs.
 * The bearer token never reaches the browser: in development the Vite proxy
 * injects it (see vite.config.ts). A deployed build needs a real session or
 * Cloudflare Access in front of /api.
 */
export const officeApiEnabled = import.meta.env.DEV || import.meta.env.VITE_OFFICE_API === "1";

const ACTOR_ID = import.meta.env.VITE_ACTOR_ID ?? "ja";

export class OfficeApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "OfficeApiError";
    this.status = status;
    this.code = code;
  }
}

export const apiErrorMessage = (error: unknown) =>
  error instanceof OfficeApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : "The workspace API could not be reached.";

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-actor-id": ACTOR_ID,
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | null;

  if (!response.ok) {
    throw new OfficeApiError(
      payload?.error?.message ?? `The API returned ${response.status}.`,
      response.status,
      payload?.error?.code ?? "request_failed",
    );
  }
  return payload as T;
};

const idempotencyKey = (prefix: string) => `${prefix}:${crypto.randomUUID()}`;

const stamp = (iso: string) => {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  return `${timeAgo(iso)} ago`;
};

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const TASK_STATUS = ["backlog", "in_progress", "review", "done"] as const;
const PRIORITY = ["high", "medium", "low"] as const;
const APPROVAL = ["none", "pending", "approved", "changes_requested", "rejected"] as const;
const OUTPUT = [
  "draft",
  "research",
  "pending_verification",
  "qc",
  "owner_review",
  "approved",
  "rejected",
  "failed",
] as const;
const RUN_STATE = [
  "queued",
  "running",
  "received",
  "qc",
  "owner_review",
  "approved",
  "changes_requested",
  "rejected",
  "failed",
  "unavailable",
  "cancelled",
] as const;
const DECISION = ["submitted", "approved", "changes_requested", "rejected"] as const;
const ACTOR_TYPE = ["owner", "operator", "agent", "system"] as const;
const VERIFIED = ["verified", "unverified", "missing"] as const;
const AUDIT_ENTITY = [
  "task",
  "approval",
  "run",
  "post",
  "deal",
  "lead",
  "agent",
  "copilot",
  "inbox",
  "report",
  "brief",
  "delivery",
  "client",
  "project",
  "finance",
  "asset",
  "knowledge",
  "automation",
] as const;

interface ApiApproval {
  id: string;
  version: number;
  decision: string;
  actorId: string;
  actorType: string;
  comment?: string;
  at: string;
  idempotencyKey: string;
}

interface ApiEvidence {
  id: string;
  title: string;
  source: string;
  kind: string;
  confidence?: number;
  verified: string;
}

export interface ApiTask {
  id: string;
  workspaceId: WorkspaceId;
  title: string;
  project: string;
  priority: string;
  status: string;
  due: string;
  ownerId: string;
  tags: string[];
  subtasksDone: number;
  subtasksTotal: number;
  board: string;
  brief: string;
  acceptance: string[];
  nextAction: string;
  approval: string;
  outputVersion: number;
  outputStatus: string;
  confidence?: number;
  limitations: string[];
  blockedReason?: string;
  assignedAgentId?: string;
  evidence: ApiEvidence[];
  history: ApiApproval[];
  comments: { id: string; authorId: string; body: string; time: string }[];
  createdAt: string;
  updatedAt: string;
}

interface ApiRun {
  id: string;
  workspaceId: WorkspaceId;
  agentId: string;
  taskId?: string;
  action: string;
  subject: string;
  state: string;
  approvalRequired: boolean;
  outputVersion: number;
  evidence: ApiEvidence[];
  limitations: string[];
  failureReason?: string;
  decisionComment?: string;
  startedAt: string;
  endedAt?: string;
  timeline: { state: string; note?: string; at: string }[];
}

interface ApiActivity {
  id: string;
  entityType: string;
  entityId: string;
  taskId?: string;
  actorType: string;
  actorId: string;
  action: string;
  result: string;
  meta?: string;
  at: string;
}

interface OfficeSnapshot {
  tasks: ApiTask[];
  runs: ApiRun[];
  activity: ApiActivity[];
}

const mapEvidence = (items: ApiEvidence[] | undefined): Evidence[] =>
  (items ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    source: item.source,
    kind: pick(item.kind, ["source", "artifact", "note"] as const, "note"),
    confidence: typeof item.confidence === "number" ? item.confidence : 0,
    verified: pick(item.verified, VERIFIED, "unverified"),
  }));

const mapHistory = (items: ApiApproval[] | undefined): ApprovalRecord[] =>
  (items ?? []).map((item) => ({
    id: item.id,
    version: item.version,
    decision: pick(item.decision, DECISION, "submitted"),
    actorId: item.actorId,
    actorType: pick(item.actorType, ACTOR_TYPE, "owner") as ActorType,
    comment: item.comment,
    at: Date.parse(item.at) || Date.now(),
    time: stamp(item.at),
    idempotencyKey: item.idempotencyKey,
  }));

export const mapTask = (task: ApiTask): OfficeTask => ({
  id: task.id,
  workspaceId: task.workspaceId,
  title: task.title,
  project: task.project,
  priority: pick(task.priority, PRIORITY, "medium") as Priority,
  status: pick(task.status, TASK_STATUS, "backlog") as TaskStatus,
  due: task.due,
  ownerId: task.ownerId,
  tags: task.tags ?? [],
  subtasksDone: task.subtasksDone,
  subtasksTotal: task.subtasksTotal,
  board: task.board,
  brief: task.brief,
  acceptance: task.acceptance ?? [],
  nextAction: task.nextAction,
  approval: pick(task.approval, APPROVAL, "none"),
  outputVersion: task.outputVersion,
  outputStatus: pick(task.outputStatus, OUTPUT, "draft") as OutputStatus,
  confidence: task.confidence,
  limitations: task.limitations ?? [],
  blockedReason: task.blockedReason,
  assignedAgentId: task.assignedAgentId,
  evidence: mapEvidence(task.evidence),
  comments: task.comments ?? [],
  history: mapHistory(task.history),
});

const durationLabel = (startedAt: string, endedAt?: string) => {
  if (!endedAt) return "—";
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "—";
  return `${Math.max(1, Math.round((end - start) / 1000))}s`;
};

export const mapRun = (run: ApiRun): OfficeRun => ({
  id: run.id,
  workspaceId: run.workspaceId,
  agentId: run.agentId,
  taskId: run.taskId,
  action: run.action,
  subject: run.subject,
  state: pick(run.state, RUN_STATE, "queued") as RunState,
  startedAt: Date.parse(run.startedAt) || Date.now(),
  time: stamp(run.startedAt),
  duration: durationLabel(run.startedAt, run.endedAt),
  approvalRequired: run.approvalRequired,
  outputVersion: run.outputVersion,
  evidence: mapEvidence(run.evidence),
  limitations: run.limitations ?? [],
  failureReason: run.failureReason,
  decisionComment: run.decisionComment,
  timeline: (run.timeline ?? []).map((event) => ({
    state: pick(event.state, RUN_STATE, "queued") as RunState,
    at: Date.parse(event.at) || Date.now(),
    time: stamp(event.at),
    note: event.note,
  })),
});

export const mapActivity = (event: ApiActivity): AuditEvent => ({
  id: event.id,
  workspaceId: "playdesign",
  entityType: pick(event.entityType, AUDIT_ENTITY, "task"),
  entityId: event.entityId,
  taskId: event.taskId,
  actorType: pick(event.actorType, ACTOR_TYPE, "system") as ActorType,
  actorId: event.actorId,
  action: event.action,
  result: pick(event.result, ["ok", "failed", "pending", "denied"] as const, "ok"),
  meta: event.meta,
  at: Date.parse(event.at) || Date.now(),
  time: stamp(event.at),
});

export interface OfficeData {
  tasks: OfficeTask[];
  runs: OfficeRun[];
  activity: AuditEvent[];
}

export async function fetchOffice(workspaceId: WorkspaceId): Promise<OfficeData> {
  const snapshot = await request<OfficeSnapshot>(`/api/office?workspace=${encodeURIComponent(workspaceId)}`);
  return {
    tasks: (snapshot.tasks ?? []).map(mapTask),
    runs: (snapshot.runs ?? []).map(mapRun),
    activity: (snapshot.activity ?? []).map((event) => ({ ...mapActivity(event), workspaceId })),
  };
}

export interface TaskPatch {
  status?: TaskStatus;
  ownerId?: string;
  title?: string;
  priority?: Priority;
  due?: string;
  nextAction?: string;
  assignedAgentId?: string | null;
  subtasksDone?: number;
  subtasksTotal?: number;
}

export async function patchTask(workspaceId: WorkspaceId, taskId: string, patch: TaskPatch): Promise<OfficeTask> {
  const result = await request<{ task: ApiTask }>(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    headers: { "idempotency-key": idempotencyKey(`task:${taskId}`) },
    body: JSON.stringify({ workspaceId, ...patch }),
  });
  return mapTask(result.task);
}

export interface CreateTaskInput {
  title: string;
  project: string;
  priority: Priority;
  status: TaskStatus;
  due: string;
  ownerId: string;
  tags: string[];
  subtasksDone: number;
  subtasksTotal: number;
}

export async function createTask(workspaceId: WorkspaceId, input: CreateTaskInput): Promise<OfficeTask> {
  const result = await request<{ task: ApiTask }>("/api/tasks", {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey("task:create") },
    body: JSON.stringify({
      workspaceId,
      ...input,
      status: input.status === "review" || input.status === "done" ? "in_progress" : input.status,
    }),
  });
  return mapTask(result.task);
}

export async function decideApproval(
  workspaceId: WorkspaceId,
  taskId: string,
  version: number,
  decision: "approved" | "changes_requested" | "rejected",
  comment: string,
): Promise<OfficeTask> {
  const result = await request<{ task: ApiTask }>(
    `/api/approvals/${encodeURIComponent(taskId)}/decision`,
    {
      method: "POST",
      headers: { "idempotency-key": `${taskId}:v${version}:${decision}` },
      body: JSON.stringify({ workspaceId, version, decision, comment }),
    },
  );
  return mapTask(result.task);
}

export async function decideRun(
  workspaceId: WorkspaceId,
  runId: string,
  decision: "approved" | "changes_requested" | "rejected",
  comment: string,
): Promise<OfficeRun> {
  const result = await request<{ run: ApiRun }>(`/api/runs/${encodeURIComponent(runId)}/decision`, {
    method: "POST",
    headers: { "idempotency-key": `run:${runId}:${decision}` },
    body: JSON.stringify({ workspaceId, decision, comment }),
  });
  return mapRun(result.run);
}

export async function stopRun(workspaceId: WorkspaceId, runId: string): Promise<OfficeRun> {
  const result = await request<{ run: ApiRun }>(`/api/runs/${encodeURIComponent(runId)}/stop`, {
    method: "POST",
    headers: { "idempotency-key": `run:${runId}:cancelled` },
    body: JSON.stringify({ workspaceId }),
  });
  return mapRun(result.run);
}

export async function startRunFromProposal(input: {
  workspaceId: WorkspaceId;
  agentId: string;
  action: string;
  subject: string;
  taskId?: string;
  approvalRequired?: boolean;
}): Promise<OfficeRun> {
  const preview = await request<{ proposal: { confirmationToken: string } }>("/api/copilot/preview", {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey("copilot:preview") },
    body: JSON.stringify({
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      action: input.action,
      subject: input.subject,
      taskId: input.taskId,
      approvalRequired: input.approvalRequired ?? true,
    }),
  });

  const executed = await request<{ run: ApiRun }>("/api/copilot/execute", {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey("copilot:execute") },
    body: JSON.stringify({ workspaceId: input.workspaceId, token: preview.proposal.confirmationToken }),
  });
  return mapRun(executed.run);
}
