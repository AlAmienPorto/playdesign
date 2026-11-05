-- On-demand scrape queue.
-- The UI only writes a request here; the Hermes cron runner picks it up,
-- executes the real Python scraper, then pushes the leads to /api/leads/sync.

CREATE TABLE IF NOT EXISTS scrape_requests (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL DEFAULT 'playdesign',
  city          TEXT NOT NULL,
  keyword       TEXT NOT NULL,
  max_leads     INTEGER NOT NULL DEFAULT 10,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | failed
  requested_by  TEXT,
  requested_at  TEXT NOT NULL DEFAULT (datetime('now')),
  started_at    TEXT,
  finished_at   TEXT,
  inserted      INTEGER DEFAULT 0,
  error         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scrape_requests_status
  ON scrape_requests (status, requested_at);

CREATE INDEX IF NOT EXISTS idx_scrape_requests_workspace
  ON scrape_requests (workspace_id, requested_at DESC);
