-- Lead outreach tracker (WhatsApp follow-up).
-- One row per lead per workspace. Status flows:
--   contacted -> replied -> interested -> deal
--   contacted -> not_interested
-- The UI records this after a human actually sends the wa.me message;
-- nothing here sends messages automatically.

CREATE TABLE IF NOT EXISTS lead_outreach (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL DEFAULT 'playdesign',
  lead_id       TEXT NOT NULL,
  lead_name     TEXT,
  company       TEXT,
  phone         TEXT,
  category      TEXT,
  city          TEXT,
  status        TEXT NOT NULL DEFAULT 'contacted', -- contacted | replied | interested | not_interested | deal
  channel       TEXT NOT NULL DEFAULT 'whatsapp',
  note          TEXT,
  contacted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  replied_at    TEXT,
  follow_up_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_outreach_lead
  ON lead_outreach (workspace_id, lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_outreach_status
  ON lead_outreach (workspace_id, status, contacted_at DESC);
