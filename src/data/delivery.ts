import type { WorkspaceId } from "./office";

export type DeliveryMode = "analysis" | "planning" | "implementation";

/* ------------------------------------------------------------------ */
/* PRD source                                                          */
/* ------------------------------------------------------------------ */

export interface PrdModule {
  id: string;
  name: string;
  area: string;
  coverage: "shipped" | "partial" | "missing";
}

export const PRD_DOC = {
  name: "PLAYDESIGN_CRM_AI_READY_PRD.md",
  version: "1.0",
  status: "Ready for Technical Analysis",
  source: "Owner-provided PRD · read-only reference",
} as const;

export const PRD_MODULES: PrdModule[] = [
  { id: "MOD-001", name: "Overview dashboard", area: "Overview", coverage: "shipped" },
  { id: "MOD-002", name: "CRM & client management", area: "CRM", coverage: "partial" },
  { id: "MOD-003", name: "Sales pipeline", area: "Sales", coverage: "shipped" },
  { id: "MOD-004", name: "Project management", area: "Projects", coverage: "missing" },
  { id: "MOD-005", name: "Task & Kanban", area: "Work", coverage: "shipped" },
  { id: "MOD-006", name: "Creative studio", area: "Creative", coverage: "partial" },
  { id: "MOD-007", name: "Client portal", area: "Client", coverage: "missing" },
  { id: "MOD-008", name: "Basic finance", area: "Finance", coverage: "missing" },
  { id: "MOD-009", name: "Team management", area: "Team", coverage: "partial" },
  { id: "MOD-010", name: "Communication", area: "Comms", coverage: "partial" },
  { id: "MOD-011", name: "Knowledge base", area: "Knowledge", coverage: "partial" },
  { id: "MOD-012", name: "Analytics & reporting", area: "Analytics", coverage: "partial" },
  { id: "MOD-013", name: "AI agent operations", area: "AI ops", coverage: "shipped" },
  { id: "MOD-014", name: "Workflow automation", area: "Automation", coverage: "partial" },
];

/* ------------------------------------------------------------------ */
/* Analysis output                                                     */
/* ------------------------------------------------------------------ */

export type FindingKind = "gap" | "partial" | "risk" | "decision" | "ready";

export interface DeliveryFinding {
  id: string;
  kind: FindingKind;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  refs: string[];
}

export interface RepoAuditRow {
  label: string;
  value: string;
  status: "detected" | "gap" | "decision";
}

export interface DeliveryDecision {
  id: string;
  title: string;
  status: "decided" | "pending";
  note: string;
}

export interface DeliveryAnalysis {
  id: string;
  workspaceId: WorkspaceId;
  createdAt: number;
  docName: string;
  docVersion: string;
  understanding: string[];
  repo: RepoAuditRow[];
  findings: DeliveryFinding[];
  decisions: DeliveryDecision[];
  limitations: string[];
}

export const FINDING_META: Record<FindingKind, { label: string; tone: "accent" | "success" | "warning" | "info" | "neutral" }> = {
  gap: { label: "Gap", tone: "warning" },
  partial: { label: "Partial", tone: "accent" },
  risk: { label: "Risk", tone: "warning" },
  decision: { label: "Decision", tone: "info" },
  ready: { label: "Ready", tone: "success" },
};

const FINDINGS: DeliveryFinding[] = [
  {
    id: "f-projects",
    kind: "gap",
    severity: "high",
    title: "No project record behind the work",
    detail:
      "Tasks carry a project name string, but there is no project entity, membership, progress roll-up or deadline tracking. The PRD requires projects as the container for tasks, assets and client feedback.",
    refs: ["MOD-004", "REQ-PROJECT-001..004"],
  },
  {
    id: "f-portal",
    kind: "gap",
    severity: "high",
    title: "Client portal and client approval are absent",
    detail:
      "Clients cannot see progress, approve assets or download deliverables. Approvals currently model internal owner review only; client review and revision loops are not represented.",
    refs: ["MOD-007", "MOD-006", "REQ-CREATIVE-004"],
  },
  {
    id: "f-finance",
    kind: "gap",
    severity: "high",
    title: "No finance ledger or cashflow",
    detail:
      "Revenue on the dashboard comes from deal values. The PRD separates deal value from cash: income and expenses need their own transactions, categories and opening balance.",
    refs: ["MOD-008", "REQ-FIN-001..004"],
  },
  {
    id: "f-rbac",
    kind: "gap",
    severity: "high",
    title: "Role permissions are descriptive, not enforced",
    detail:
      "Workspace switching and owner-only approvals exist in the UI, but there is no membership table, role matrix or server-side authorization. Organization isolation is only a client-side filter today.",
    refs: ["REQ-AUTH-001", "REQ-AUTH-002"],
  },
  {
    id: "f-persistence",
    kind: "gap",
    severity: "high",
    title: "UI state is in-memory demo data",
    detail:
      "The React store is seeded and resets on reload. D1 has 18 tables and a Worker API, but the interface does not read or write them yet.",
    refs: ["§7.3", "§12.12"],
  },
  {
    id: "f-creative",
    kind: "partial",
    severity: "high",
    title: "Creative versions and approvals are simplified",
    detail:
      "Versioned task output and evidence exist, but creative assets have no version chain, file storage or client sign-off. Production is represented by tasks and posts.",
    refs: ["MOD-006", "REQ-CREATIVE-002"],
  },
  {
    id: "f-knowledge",
    kind: "gap",
    severity: "medium",
    title: "Knowledge base is a static list",
    detail:
      "The agent page shows indexed-source counts, but documents, chunks, access rules and retrieval references are not modeled.",
    refs: ["MOD-011", "REQ-AI-004"],
  },
  {
    id: "f-analytics",
    kind: "partial",
    severity: "medium",
    title: "Reporting lacks metric definitions",
    detail:
      "Overview charts are illustrative. There is no shared metric definition, period selector, traceable source rows or export.",
    refs: ["MOD-012", "REQ-ANALYTICS-001..004"],
  },
  {
    id: "f-tasks",
    kind: "partial",
    severity: "medium",
    title: "Task model is missing planning fields",
    detail:
      "Tasks lack start date, estimated/actual hours and board position. Multi-assignee behavior is still an open decision (TBD-011).",
    refs: ["MOD-005", "TBD-011"],
  },
  {
    id: "f-api",
    kind: "partial",
    severity: "medium",
    title: "API coverage stops at today's modules",
    detail:
      "Leads, deals, tasks, posts and agent jobs have routes. Projects, clients, finance, portal and reports have no contracts yet.",
    refs: ["§9"],
  },
  {
    id: "f-auth",
    kind: "risk",
    severity: "high",
    title: "Worker API has no authentication",
    detail:
      "The /api/v1 routes trust the request body for workspace identity. Shipping them publicly without auth would break organization isolation.",
    refs: ["§10.2", "TBD-002"],
  },
  {
    id: "f-runtime",
    kind: "risk",
    severity: "medium",
    title: "Agent runtime contracts are unverified",
    detail:
      "Runs are simulated. Hermes version, 9Router authentication and the callback or polling mechanism are still open decisions.",
    refs: ["TBD-004", "TBD-005", "TBD-006"],
  },
  {
    id: "f-stack",
    kind: "decision",
    severity: "low",
    title: "Keep the existing stack",
    detail:
      "The PRD suggests Next.js and PostgreSQL, but §7.2 requires auditing the repository first. The current Vite + React + Workers + D1 stack is retained and documented as a deliberate deviation.",
    refs: ["§7.2", "TBD-001", "TBD-003"],
  },
  {
    id: "f-shipped",
    kind: "ready",
    severity: "low",
    title: "Approval, audit and brief intake already work",
    detail:
      "Owner approval, versioned output, evidence, audit trail, run lifecycle and brief intake are implemented. Later modules should reuse these patterns instead of inventing new ones.",
    refs: ["MOD-013", "MOD-014"],
  },
];

const DECISIONS: DeliveryDecision[] = [
  {
    id: "DEC-001",
    title: "Existing stack stays",
    status: "decided",
    note: "Vite, React, Tailwind, Workers and D1 are kept. The PRD's Next.js/Postgres suggestion is a recommendation, not a replacement order.",
  },
  {
    id: "DEC-002",
    title: "Authentication provider",
    status: "pending",
    note: "Choose between a D1-native session layer and an external provider before the RBAC module ships.",
  },
  {
    id: "DEC-003",
    title: "Hermes and 9Router contracts",
    status: "pending",
    note: "Runtime version, auth headers and completion mechanism must be verified before real agent execution.",
  },
  {
    id: "DEC-004",
    title: "Client invitation flow",
    status: "pending",
    note: "Portal access needs an invite, ownership check and revocation path.",
  },
  {
    id: "DEC-005",
    title: "File storage for deliverables",
    status: "pending",
    note: "R2 bucket, size limits and signed access are required before client file downloads.",
  },
];

export function buildDeliveryAnalysis(workspaceId: WorkspaceId): DeliveryAnalysis {
  const workspaceName = workspaceId === "brandal" ? "Brandal-Gbee" : "Playdesign Studio";
  return {
    id: `dlva-${workspaceId}`,
    workspaceId,
    createdAt: Date.now(),
    docName: PRD_DOC.name,
    docVersion: PRD_DOC.version,
    understanding: [
      `${workspaceName} is one organization-scoped workspace covering CRM, pipeline, delivery, creative work and finance. Every record, action and audit entry must carry the workspace id.`,
      "The owner holds the approval gate. The agent drafts, plans and validates, but never sends, publishes, pays or changes permissions without an explicit decision.",
      "The PRD asks for a modular monolith built one module at a time. Each module needs a migration, an API contract and acceptance criteria before UI work counts as done.",
    ],
    repo: [
      { label: "Frontend", value: "Vite 8 · React 19 · TypeScript 7 strict", status: "detected" },
      { label: "Styling", value: "Tailwind 3.4 · token system · light/dark", status: "detected" },
      { label: "Backend", value: "Cloudflare Worker · /api/v1 routes", status: "detected" },
      { label: "Database", value: "D1 · 18 tables · 0001_init.sql + seed", status: "detected" },
      { label: "Auth", value: "Not implemented — routes trust the body", status: "gap" },
      { label: "Persistence", value: "UI store is demo-seeded, not connected to D1", status: "gap" },
      { label: "Stack choice", value: "Keep current stack per PRD §7.2 audit rule", status: "decision" },
    ],
    findings: FINDINGS,
    decisions: DECISIONS,
    limitations: [
      "Analysis reads the local repository snapshot and the provided PRD. No external model call is made.",
      "Estimates are directional until the delivery team is sized.",
      "Agent runtime and auth decisions remain open; they are listed as pending, not assumed.",
    ],
  };
}

export const DELIVERY_ANALYSES: DeliveryAnalysis[] = [buildDeliveryAnalysis("playdesign")];

/* ------------------------------------------------------------------ */
/* Plan                                                                */
/* ------------------------------------------------------------------ */

export type DeliveryPlanStatus = "queued" | "approved" | "running" | "in_review" | "validated";

export interface DeliveryPlanItem {
  id: string;
  workspaceId: WorkspaceId;
  moduleId: string;
  title: string;
  area: string;
  dependsOn: string[];
  migration: string;
  api: string[];
  acceptance: string[];
  estimate: string;
  status: DeliveryPlanStatus;
  taskIds: string[];
}

export const PLAN_STATUS_META: Record<
  DeliveryPlanStatus,
  { label: string; tone: "accent" | "success" | "warning" | "info" | "neutral" }
> = {
  queued: { label: "Queued", tone: "neutral" },
  approved: { label: "Plan approved", tone: "accent" },
  running: { label: "Implementing", tone: "info" },
  in_review: { label: "PRD validation", tone: "warning" },
  validated: { label: "Validated", tone: "success" },
};

interface PlanTemplate {
  key: string;
  moduleId: string;
  title: string;
  area: string;
  dependsOn: string[];
  migration: string;
  api: string[];
  acceptance: string[];
  estimate: string;
}

const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    key: "rbac",
    moduleId: "REQ-AUTH-001/002",
    title: "RBAC & organization isolation",
    area: "Foundation",
    dependsOn: [],
    migration: "0002_rbac.sql — organizations, users, organization_members, roles, permissions, role_permissions",
    api: ["GET /api/v1/auth/me", "middleware · organization scope", "PATCH /api/v1/roles/:id"],
    acceptance: [
      "Owner, admin, management, sales, PM, creative, finance and client roles seeded",
      "Every business query filters by organization_id",
      "Permission changes are written to audit_logs",
      "Cross-workspace reads return 403",
    ],
    estimate: "1 week",
  },
  {
    key: "projects",
    moduleId: "MOD-004",
    title: "Projects & deliverables foundation",
    area: "Delivery",
    dependsOn: ["rbac"],
    migration: "0003_projects.sql — projects, project_members, milestones",
    api: ["GET/POST /api/v1/projects", "GET /api/v1/projects/:id", "GET /api/v1/projects/:id/tasks"],
    acceptance: [
      "Project links to a client and an optional deal",
      "Progress = completed tasks / total tasks",
      "Deadline notifications fire before and after due date",
      "Projects filter by status and project manager",
    ],
    estimate: "2 weeks",
  },
  {
    key: "finance",
    moduleId: "MOD-008",
    title: "Finance ledger & cashflow",
    area: "Finance",
    dependsOn: ["rbac"],
    migration: "0004_finance.sql — financial_transactions, financial_categories, opening_balances",
    api: [
      "GET /api/v1/finance/summary",
      "POST /api/v1/finance/transactions",
      "POST /api/v1/finance/transactions/:id/reverse",
    ],
    acceptance: [
      "Income and expenses require a date and an amount above zero",
      "Balance = opening balance + income − expense",
      "Reversal keeps history instead of deleting it",
      "Deal value is never counted as cash",
    ],
    estimate: "2 weeks",
  },
  {
    key: "portal",
    moduleId: "MOD-007",
    title: "Client portal & asset approvals",
    area: "Client",
    dependsOn: ["projects"],
    migration: "0005_client_portal.sql — portal_access, creative_assets, creative_asset_versions, creative_approvals",
    api: [
      "GET /api/v1/portal/projects",
      "POST /api/v1/portal/approvals/:id/approve",
      "POST /api/v1/portal/approvals/:id/reject",
    ],
    acceptance: [
      "Client only sees projects linked to their client record",
      "Approval stores user and timestamp",
      "Internal notes and finance stay hidden",
      "Deliverable files use controlled access",
    ],
    estimate: "2 weeks",
  },
  {
    key: "knowledge",
    moduleId: "MOD-011",
    title: "Knowledge base retrieval",
    area: "Intelligence",
    dependsOn: ["rbac"],
    migration: "0006_knowledge.sql — knowledge_documents, document_chunks, document_access",
    api: ["GET /api/v1/knowledge/documents", "POST /api/v1/knowledge/retrieve"],
    acceptance: [
      "Agent only retrieves documents it is allowed to read",
      "Every claim carries a source reference",
      "Archived documents are excluded",
      "Retrieval is scoped by organization",
    ],
    estimate: "1 week",
  },
  {
    key: "analytics",
    moduleId: "MOD-012",
    title: "Analytics & report definitions",
    area: "Analytics",
    dependsOn: ["projects", "finance"],
    migration: "0007_reporting.sql — metric definitions and read-only views",
    api: ["GET /api/v1/reports/:metric", "GET /api/v1/finance/summary"],
    acceptance: [
      "Each metric traces back to source rows",
      "Period filter works for every report",
      "Organization scope is applied to aggregates",
      "Empty, loading and error states exist",
    ],
    estimate: "1 week",
  },
];

export function buildDeliveryPlan(workspaceId: WorkspaceId): DeliveryPlanItem[] {
  const prefix = workspaceId === "playdesign" ? "dlv-pd" : "dlv-br";
  return PLAN_TEMPLATES.map((template) => ({
    id: `${prefix}-${template.key}`,
    workspaceId,
    moduleId: template.moduleId,
    title: template.title,
    area: template.area,
    dependsOn: template.dependsOn.map((key) => `${prefix}-${key}`),
    migration: template.migration,
    api: template.api,
    acceptance: template.acceptance,
    estimate: template.estimate,
    status: "queued" as DeliveryPlanStatus,
    taskIds: [],
  }));
}

const seedPlan = buildDeliveryPlan("playdesign").map((item) =>
  item.id === "dlv-pd-rbac" ? { ...item, status: "validated" as DeliveryPlanStatus } : item,
);

export const DELIVERY_PLAN: DeliveryPlanItem[] = seedPlan;

export const dependencyReady = (item: DeliveryPlanItem, plan: DeliveryPlanItem[]) =>
  item.dependsOn.every((id) => {
    const dependency = plan.find((entry) => entry.id === id);
    return dependency ? dependency.status === "approved" || dependency.status === "validated" : false;
  });

/* ------------------------------------------------------------------ */
/* Implementation runs                                                 */
/* ------------------------------------------------------------------ */

export type DeliveryRunState = "running" | "awaiting_validation" | "validated";

export interface DeliveryCheck {
  id: string;
  label: string;
  result: "pass" | "warn" | "pending";
  detail: string;
}

export interface DeliveryRunStep {
  label: string;
  time: string;
  note: string;
}

export interface DeliveryRun {
  id: string;
  workspaceId: WorkspaceId;
  planItemId: string;
  moduleId: string;
  title: string;
  state: DeliveryRunState;
  startedAt: number;
  time: string;
  duration: string;
  steps: DeliveryRunStep[];
  checks: DeliveryCheck[];
  evidence: string[];
  limitations: string[];
  validatedAt?: number;
  validationNote?: string;
}

export const DELIVERY_RUN_META: Record<
  DeliveryRunState,
  { label: string; tone: "accent" | "success" | "warning" | "info" | "neutral" }
> = {
  running: { label: "Running", tone: "info" },
  awaiting_validation: { label: "Awaiting owner validation", tone: "warning" },
  validated: { label: "Validated against PRD", tone: "success" },
};

const seedRunAt = Date.now() - 26 * 60 * 60 * 1000;

export const DELIVERY_RUNS: DeliveryRun[] = [
  {
    id: "dlvr-pd-rbac",
    workspaceId: "playdesign",
    planItemId: "dlv-pd-rbac",
    moduleId: "REQ-AUTH-001/002",
    title: "Role middleware & organization scope",
    state: "validated",
    startedAt: seedRunAt,
    time: "1d ago",
    duration: "1m 42s",
    steps: [
      { label: "Requirements & acceptance loaded", time: "1d ago", note: "4 acceptance checks" },
      { label: "Migration drafted", time: "1d ago", note: "0002_rbac.sql" },
      { label: "API contract wired", time: "1d ago", note: "auth/me + scope middleware" },
      { label: "UI surface reviewed", time: "1d ago", note: "Settings · roles and permissions" },
      { label: "Demo checks completed", time: "1d ago", note: "Simulated · CI not attached" },
      { label: "Validated against PRD", time: "1d ago", note: "Owner sign-off recorded" },
    ],
    checks: [
      { id: "migration", label: "Migration draft", result: "pass", detail: "Simulated · 6 tables outlined" },
      { id: "api", label: "API contract", result: "pass", detail: "3 endpoints · organization middleware" },
      { id: "acceptance", label: "Acceptance criteria", result: "warn", detail: "4 checks · owner sign-off" },
      { id: "scope", label: "Workspace scope", result: "pass", detail: "Every read filtered by organization_id" },
    ],
    evidence: [
      "Plan item dlv-pd-rbac",
      "0002_rbac.sql · 6 tables",
      "3 API endpoints documented",
    ],
    limitations: [
      "Simulated locally — no CI job, no model call and no deployment.",
      "Client roles are defined but cannot be issued until the portal ships.",
    ],
    validatedAt: seedRunAt + 102_000,
    validationNote: "Scope middleware reviewed. Client role issuance stays blocked on the portal module.",
  },
];

export function createDeliveryRun(workspaceId: WorkspaceId, item: DeliveryPlanItem): DeliveryRun {
  return {
    id: `dlvr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    workspaceId,
    planItemId: item.id,
    moduleId: item.moduleId,
    title: item.title,
    state: "running",
    startedAt: Date.now(),
    time: "just now",
    duration: "—",
    steps: [
      { label: "Requirements & acceptance loaded", time: "just now", note: `${item.acceptance.length} acceptance checks` },
      { label: "Migration staged", time: "just now", note: item.migration.split(" — ")[0] },
      { label: "API contract staged", time: "just now", note: `${item.api.length} endpoints` },
      { label: "UI surface mapped", time: "just now", note: `${item.area} workspace` },
    ],
    checks: [
      { id: "migration", label: "Migration draft", result: "pending", detail: "Waiting for the demo check" },
      { id: "api", label: "API contract", result: "pending", detail: "Waiting for the demo check" },
      { id: "acceptance", label: "Acceptance criteria", result: "pending", detail: "Waiting for the demo check" },
      { id: "scope", label: "Workspace scope", result: "pending", detail: "Waiting for the demo check" },
    ],
    evidence: [],
    limitations: [],
  };
}

export function completeDeliveryRun(run: DeliveryRun, item: DeliveryPlanItem): DeliveryRun {
  return {
    ...run,
    state: "awaiting_validation",
    duration: "1m 18s",
    steps: [
      ...run.steps,
      { label: "Demo checks completed", time: "just now", note: "Simulated · CI not attached" },
      { label: "Held for owner validation", time: "just now", note: `${item.acceptance.length} acceptance checks` },
    ],
    checks: [
      { id: "migration", label: "Migration draft", result: "pass", detail: `Simulated · ${item.migration.split(" — ")[0]}` },
      { id: "api", label: "API contract", result: "pass", detail: `${item.api.length} endpoints · schema outlined` },
      { id: "acceptance", label: "Acceptance criteria", result: "warn", detail: `${item.acceptance.length} checks need owner sign-off` },
      { id: "scope", label: "Workspace scope", result: "pass", detail: "Every query must filter by workspace_id" },
    ],
    evidence: [
      `Plan item ${item.id}`,
      `${item.migration.split(" — ")[0]} · migration`,
      `${item.api.length} API endpoints documented`,
    ],
    limitations: [
      "Simulated locally — no CI job, no model call and no deployment.",
      "Owner validation is a sign-off; it does not replace tests.",
      "Demo data — nothing is persisted after reload.",
    ],
  };
}
