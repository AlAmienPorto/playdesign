-- Migrasi 0003: Tabel riwayat pesan chat agent
CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  proposal TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_lookup 
ON agent_messages (workspace_id, agent_id, created_at ASC);
