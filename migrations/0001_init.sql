-- Office CRM — initial schema (PRD §11)
-- Every table is workspace-scoped. Mutations are audited in activity_events and
-- idempotency_keys protects retried writes.

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  meta TEXT NOT NULL,
  initial TEXT NOT NULL,
  approval_policy TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Human and agent actors that can act in a workspace. `role` drives
-- authorization: owner (final approval), spv (QC gate), operator (production).
CREATE TABLE actors (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'spv', 'operator')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (id, workspace_id)
);

CREATE INDEX idx_actors_workspace ON actors (workspace_id);

-- Je.el Agent profiles: PRD roles Specialist Agent and SPV/QC Agent.
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Specialist Agent', 'SPV/QC Agent')),
  jobdesk TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  availability TEXT NOT NULL CHECK (availability IN ('online', 'idle', 'unavailable')),
  capabilities TEXT NOT NULL DEFAULT '[]',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_agents_workspace ON agents (workspace_id);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  project TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL CHECK (status IN ('backlog', 'in_progress', 'review', 'done')),
  due TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  subtasks_done INTEGER NOT NULL DEFAULT 0 CHECK (subtasks_done >= 0),
  subtasks_total INTEGER NOT NULL DEFAULT 0 CHECK (subtasks_total >= 0),
  board TEXT NOT NULL,
  brief TEXT NOT NULL,
  acceptance TEXT NOT NULL DEFAULT '[]',
  next_action TEXT NOT NULL,
  approval TEXT NOT NULL DEFAULT 'none'
    CHECK (approval IN ('none', 'pending', 'approved', 'changes_requested', 'rejected')),
  output_version INTEGER NOT NULL DEFAULT 0 CHECK (output_version >= 0),
  output_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (output_status IN ('draft', 'research', 'pending_verification', 'qc', 'owner_review', 'approved', 'rejected', 'failed')),
  confidence INTEGER CHECK (confidence BETWEEN 0 AND 100),
  limitations TEXT NOT NULL DEFAULT '[]',
  blocked_reason TEXT,
  assigned_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_tasks_workspace_status ON tasks (workspace_id, status);
CREATE INDEX idx_tasks_workspace_approval ON tasks (workspace_id, approval);
CREATE INDEX idx_tasks_agent ON tasks (assigned_agent_id);

-- Versioned outputs. Approval always targets an immutable version.
CREATE TABLE task_outputs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL
    CHECK (status IN ('draft', 'research', 'pending_verification', 'qc', 'owner_review', 'approved', 'rejected', 'failed')),
  content TEXT,
  confidence INTEGER CHECK (confidence BETWEEN 0 AND 100),
  limitations TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (task_id, version)
);

CREATE INDEX idx_task_outputs_task ON task_outputs (task_id, version);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  output_id TEXT REFERENCES task_outputs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('source', 'artifact', 'note')),
  confidence INTEGER CHECK (confidence BETWEEN 0 AND 100),
  verified TEXT NOT NULL CHECK (verified IN ('verified', 'unverified', 'missing')),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_evidence_task ON evidence (task_id);

-- Append-only approval history. The unique idempotency key mirrors the
-- task:version:decision contract enforced by the API.
CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  decision TEXT NOT NULL CHECK (decision IN ('submitted', 'approved', 'changes_requested', 'rejected')),
  actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('owner', 'spv', 'operator', 'agent', 'system')),
  comment TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  decided_at TEXT NOT NULL
);

CREATE INDEX idx_approvals_task ON approvals (task_id, decided_at);

CREATE TABLE task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_task_comments_task ON task_comments (task_id, created_at);

-- Audit trail. Mirrors the UI activity feed and PRD activity_event.
CREATE TABLE activity_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('task', 'approval', 'run', 'post', 'deal', 'lead', 'agent', 'copilot', 'inbox', 'report')),
  entity_id TEXT NOT NULL,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('owner', 'spv', 'operator', 'agent', 'system')),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('ok', 'failed', 'pending', 'denied')),
  meta TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_activity_workspace_time ON activity_events (workspace_id, created_at);
CREATE INDEX idx_activity_task ON activity_events (task_id, created_at);

-- Agent run lifecycle: queued → running → received → qc → owner_review →
-- approved | changes_requested | rejected, plus failed | unavailable | cancelled.
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  subject TEXT NOT NULL,
  state TEXT NOT NULL
    CHECK (state IN ('queued', 'running', 'received', 'qc', 'owner_review', 'approved', 'changes_requested', 'rejected', 'failed', 'unavailable', 'cancelled')),
  approval_required INTEGER NOT NULL DEFAULT 1 CHECK (approval_required IN (0, 1)),
  output_version INTEGER NOT NULL DEFAULT 1 CHECK (output_version >= 0),
  evidence TEXT NOT NULL DEFAULT '[]',
  limitations TEXT NOT NULL DEFAULT '[]',
  failure_reason TEXT,
  decision_comment TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE INDEX idx_runs_workspace_state ON runs (workspace_id, state);
CREATE INDEX idx_runs_agent ON runs (agent_id);
CREATE INDEX idx_runs_task ON runs (task_id);

CREATE TABLE run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  note TEXT,
  at TEXT NOT NULL
);

CREATE INDEX idx_run_events_run ON run_events (run_id, at);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  caption TEXT NOT NULL,
  platform TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'review', 'scheduled', 'published')),
  format TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  reach INTEGER,
  engagement REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_posts_workspace_status ON posts (workspace_id, status);

-- PRD GET /api/schedules — content queue entries that need an approval gate.
CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'review', 'scheduled', 'published', 'cancelled')),
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_schedules_workspace_time ON schedules (workspace_id, scheduled_for);

CREATE TABLE deals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value >= 0),
  stage TEXT NOT NULL CHECK (stage IN ('new', 'qualified', 'proposal', 'negotiation', 'won')),
  contact TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  due TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_deals_workspace_stage ON deals (workspace_id, stage);

CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  location TEXT,
  status TEXT NOT NULL CHECK (status IN ('new', 'qualified', 'nurturing', 'customer', 'cold')),
  source TEXT NOT NULL,
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  value INTEGER NOT NULL DEFAULT 0,
  owner_id TEXT NOT NULL,
  last_activity TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  next_step TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_leads_workspace_status ON leads (workspace_id, status);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  period TEXT NOT NULL,
  payload TEXT NOT NULL,
  generated_at TEXT NOT NULL
);

CREATE INDEX idx_reports_workspace ON reports (workspace_id, generated_at);

-- Idempotent write ledger. Keyed per caller-supplied Idempotency-Key.
CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status INTEGER NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Copilot preview → confirm → execute. Execute only accepts a token issued
-- by a preview, so external side effects can never happen in one silent step.
CREATE TABLE copilot_proposals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  subject TEXT NOT NULL,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  approval_required INTEGER NOT NULL DEFAULT 1 CHECK (approval_required IN (0, 1)),
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  executed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_copilot_workspace ON copilot_proposals (workspace_id, created_at);
