-- Brute-force protection for the password login.
-- Per-isolate memory was not enough: Cloudflare spreads requests across isolates,
-- so the counter has to live in D1 to be shared.

CREATE TABLE IF NOT EXISTS login_attempts (
  ip       TEXT PRIMARY KEY,
  count    INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT NOT NULL
);
