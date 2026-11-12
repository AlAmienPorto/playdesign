-- 0018_content_radar.sql
-- Content Radar: source registry, clustered candidates, multi-source provenance,
-- run locks, and server-side Draft snapshots. Every table is workspace-scoped;
-- every unique/index/foreign-key relation carries workspace_id so one workspace
-- can never read, collide with, or mutate another workspace's Radar data.
-- Only JSON/text metadata is stored here. Media bytes stay in Drive/browser.

CREATE TABLE IF NOT EXISTS content_radar_sources (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  id TEXT NOT NULL,
  domain TEXT NOT NULL,
  name TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('A', 'B', 'C', 'D', 'unverified')),
  -- 'discovered' is the collector-assigned kind for an unknown domain that was
  -- auto-registered as `unverified` so provenance rows can reference it.
  kind TEXT NOT NULL
    CHECK (kind IN ('official', 'media', 'community', 'regulator', 'research', 'project', 'discovered')),
  niches TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(niches) AND json_type(niches) = 'array'),
  feed_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  requires_crosscheck INTEGER NOT NULL DEFAULT 0 CHECK (requires_crosscheck IN (0, 1)),
  verified_at TEXT,
  verified_by TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (tier <> 'D' OR requires_crosscheck = 1),
  CHECK (domain = lower(domain) AND length(domain) > 0),
  CHECK (feed_url IS NULL OR feed_url LIKE 'http://%' OR feed_url LIKE 'https://%')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_content_radar_sources_domain
  ON content_radar_sources (workspace_id, domain);

CREATE INDEX IF NOT EXISTS idx_content_radar_sources_workspace_enabled
  ON content_radar_sources (workspace_id, enabled, tier);

CREATE TABLE IF NOT EXISTS content_radar_candidates (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  id TEXT NOT NULL,
  cluster_key TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  published_at_source TEXT
    CHECK (published_at_source IS NULL OR published_at_source IN ('publisher', 'feed', 'discovered', 'unknown')),
  discovered_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  timestamp_fallback INTEGER NOT NULL DEFAULT 0 CHECK (timestamp_fallback IN (0, 1)),
  niche TEXT NOT NULL
    CHECK (niche IN ('ai', 'technology', 'design', 'security', 'internet', 'crypto')),
  language TEXT NOT NULL DEFAULT 'id',
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'qualified', 'rejected', 'drafted', 'archived')),
  source_domain TEXT NOT NULL DEFAULT '',
  source_tier TEXT NOT NULL DEFAULT 'unverified'
    CHECK (source_tier IN ('A', 'B', 'C', 'D', 'unverified')),
  score_components TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(score_components) AND json_type(score_components) = 'object'),
  score_total INTEGER NOT NULL DEFAULT 0 CHECK (score_total BETWEEN 0 AND 100),
  rubric_version TEXT NOT NULL DEFAULT 'v1',
  score_input_snapshot TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(score_input_snapshot) AND json_type(score_input_snapshot) = 'object'),
  score_reason TEXT NOT NULL DEFAULT '',
  risk_flags TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(risk_flags) AND json_type(risk_flags) = 'array'),
  rejection_reason TEXT,
  draft_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (length(cluster_key) > 0),
  CHECK (canonical_url LIKE 'http://%' OR canonical_url LIKE 'https://%'),
  FOREIGN KEY (workspace_id, draft_id)
    REFERENCES content_radar_drafts (workspace_id, id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_content_radar_candidates_canonical
  ON content_radar_candidates (workspace_id, canonical_url);

CREATE UNIQUE INDEX IF NOT EXISTS ux_content_radar_candidates_cluster
  ON content_radar_candidates (workspace_id, cluster_key);

CREATE INDEX IF NOT EXISTS idx_content_radar_candidates_workspace_status
  ON content_radar_candidates (workspace_id, status, score_total);

CREATE INDEX IF NOT EXISTS idx_content_radar_candidates_workspace_window
  ON content_radar_candidates (workspace_id, discovered_at);

CREATE INDEX IF NOT EXISTS idx_content_radar_candidates_workspace_draft
  ON content_radar_candidates (workspace_id, draft_id);

CREATE TABLE IF NOT EXISTS content_radar_candidate_sources (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN ('primary', 'crosscheck', 'signal')),
  title TEXT NOT NULL,
  published_at TEXT,
  evidence_excerpt TEXT,
  discovered_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (canonical_url LIKE 'http://%' OR canonical_url LIKE 'https://%'),
  CHECK (length(source_domain) > 0),
  FOREIGN KEY (workspace_id, candidate_id)
    REFERENCES content_radar_candidates (workspace_id, id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (workspace_id, source_id)
    REFERENCES content_radar_sources (workspace_id, id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_content_radar_candidate_sources_identity
  ON content_radar_candidate_sources (workspace_id, candidate_id, source_id, canonical_url);

CREATE INDEX IF NOT EXISTS idx_content_radar_candidate_sources_candidate
  ON content_radar_candidate_sources (workspace_id, candidate_id, relation);

CREATE TABLE IF NOT EXISTS content_radar_runs (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('collector', 'selector')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  started_at TEXT,
  finished_at TEXT,
  heartbeat_at TEXT,
  fetched_count INTEGER NOT NULL DEFAULT 0 CHECK (fetched_count >= 0),
  new_count INTEGER NOT NULL DEFAULT 0 CHECK (new_count >= 0),
  updated_count INTEGER NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  qualified_count INTEGER NOT NULL DEFAULT 0 CHECK (qualified_count >= 0),
  drafted_count INTEGER NOT NULL DEFAULT 0 CHECK (drafted_count >= 0),
  rejected_count INTEGER NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  error TEXT,
  meta TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(meta) AND json_type(meta) = 'object'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (status <> 'running' OR started_at IS NOT NULL),
  CHECK (status NOT IN ('succeeded', 'failed', 'cancelled') OR finished_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_content_radar_runs_active_kind
  ON content_radar_runs (workspace_id, kind)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS idx_content_radar_runs_workspace_kind
  ON content_radar_runs (workspace_id, kind, created_at);

CREATE INDEX IF NOT EXISTS idx_content_radar_runs_workspace_status
  ON content_radar_runs (workspace_id, status, created_at);

-- Reaper scan index: lets the collector/selector find a stale active run
-- (`status = 'running'` with an old or missing heartbeat) without a table scan,
-- so a crashed run can be moved to `cancelled` and the active-kind lock released.
CREATE INDEX IF NOT EXISTS idx_content_radar_runs_reaper
  ON content_radar_runs (workspace_id, kind, status, heartbeat_at);

CREATE TABLE IF NOT EXISTS content_radar_drafts (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  cluster_key TEXT NOT NULL,
  auto_date_wib TEXT,
  creation_kind TEXT NOT NULL CHECK (creation_kind IN ('automatic', 'manual')),
  title TEXT NOT NULL,
  document TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(document) AND json_type(document) = 'object'),
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status = 'Draft'),
  score_snapshot TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(score_snapshot) AND json_type(score_snapshot) = 'object'),
  sources_snapshot TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(sources_snapshot) AND json_type(sources_snapshot) = 'array'),
  created_by TEXT NOT NULL,
  imported_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (length(cluster_key) > 0),
  CHECK (
    (creation_kind = 'automatic' AND auto_date_wib IS NOT NULL)
    OR (creation_kind = 'manual' AND auto_date_wib IS NULL)
  ),
  CHECK (
    auto_date_wib IS NULL
    OR (
      length(auto_date_wib) = 10
      AND auto_date_wib GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND date(auto_date_wib) IS NOT NULL
      AND date(auto_date_wib) = auto_date_wib
    )
  ),
  FOREIGN KEY (workspace_id, candidate_id)
    REFERENCES content_radar_candidates (workspace_id, id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_content_radar_drafts_candidate
  ON content_radar_drafts (workspace_id, candidate_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_content_radar_drafts_post
  ON content_radar_drafts (workspace_id, post_id);

-- One automatic Draft per cluster per Asia/Jakarta selector date. Manual Owner
-- drafts are excluded, so they never consume the automatic daily quota, and the
-- selector can still fill remaining slots after a partial 1-2 Draft run.
CREATE UNIQUE INDEX IF NOT EXISTS ux_content_radar_drafts_auto_daily_cluster
  ON content_radar_drafts (workspace_id, auto_date_wib, cluster_key)
  WHERE creation_kind = 'automatic';

CREATE INDEX IF NOT EXISTS idx_content_radar_drafts_workspace_date
  ON content_radar_drafts (workspace_id, auto_date_wib, creation_kind);
