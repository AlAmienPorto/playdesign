"""Contract tests for the Content Radar D1 migration and source registry."""

from __future__ import annotations

import json
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "migrations"
MIGRATION_FILES = (
    "0001_init.sql",
    "0016_carousel_export_jobs.sql",
    "0017_carousel_active_unique.sql",
    "0018_content_radar.sql",
)
RADAR_TABLES = {
    "content_radar_sources",
    "content_radar_candidates",
    "content_radar_candidate_sources",
    "content_radar_runs",
    "content_radar_drafts",
}
NICHES = {"ai", "technology", "design", "security", "internet", "crypto"}


def apply_migrations(connection: sqlite3.Connection) -> None:
    for filename in MIGRATION_FILES:
        connection.executescript((MIGRATIONS / filename).read_text(encoding="utf-8"))


def workspace(connection: sqlite3.Connection, workspace_id: str) -> None:
    connection.execute(
        "INSERT INTO workspaces "
        "(id, name, slug, meta, initial, approval_policy, created_at) "
        "VALUES (?, ?, ?, '{}', 'W', 'owner', '2026-11-08T00:00:00Z')",
        (workspace_id, workspace_id, workspace_id),
    )


def source(
    connection: sqlite3.Connection,
    workspace_id: str,
    source_id: str,
    domain: str = "example.com",
    tier: str = "A",
) -> None:
    connection.execute(
        "INSERT INTO content_radar_sources "
        "(workspace_id, id, domain, name, tier, kind, niches, enabled, "
        "requires_crosscheck, created_at, updated_at) "
        "VALUES (?, ?, ?, 'Example', ?, 'official', '[\"technology\"]', 1, 0, ?, ?)",
        (workspace_id, source_id, domain, tier, "2026-11-08T00:00:00Z", "2026-11-08T00:00:00Z"),
    )


def candidate(
    connection: sqlite3.Connection,
    workspace_id: str,
    candidate_id: str,
    cluster_key: str,
    canonical_url: str,
    niche: str = "technology",
) -> None:
    connection.execute(
        "INSERT INTO content_radar_candidates "
        "(workspace_id, id, cluster_key, canonical_url, title, summary, "
        "discovered_at, last_seen_at, niche, language, status, score_components, "
        "score_total, rubric_version, score_input_snapshot, score_reason, "
        "risk_flags, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, 'Title', 'Summary', ?, ?, ?, 'id', 'qualified', "
        "'{}', 80, 'v1', '{}', 'reason', '[]', ?, ?)",
        (
            workspace_id,
            candidate_id,
            cluster_key,
            canonical_url,
            "2026-11-08T00:00:00Z",
            "2026-11-08T00:00:00Z",
            niche,
            "2026-11-08T00:00:00Z",
            "2026-11-08T00:00:00Z",
        ),
    )


def draft(
    connection: sqlite3.Connection,
    workspace_id: str,
    draft_id: str,
    candidate_id: str,
    post_id: str,
    cluster_key: str,
    *,
    creation_kind: str = "automatic",
    auto_date_wib: str | None = "2026-11-08",
    created_by: str = "radar-agent",
    status: str = "Draft",
) -> None:
    connection.execute(
        "INSERT INTO content_radar_drafts "
        "(workspace_id, id, candidate_id, post_id, cluster_key, auto_date_wib, "
        "creation_kind, title, document, status, score_snapshot, sources_snapshot, "
        "created_by, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, 'Draft title', '{}', ?, '{}', '[]', ?, ?, ?)",
        (
            workspace_id,
            draft_id,
            candidate_id,
            post_id,
            cluster_key,
            auto_date_wib,
            creation_kind,
            status,
            created_by,
            "2026-11-08T01:00:00Z",
            "2026-11-08T01:00:00Z",
        ),
    )


class ContentRadarMigrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        apply_migrations(self.db)
        workspace(self.db, "ws-a")
        workspace(self.db, "ws-b")

    def tearDown(self) -> None:
        self.db.close()

    def assert_integrity_error(self, sql: str, parameters: tuple[object, ...]) -> None:
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(sql, parameters)

    def test_creates_all_workspace_scoped_tables_and_indexes(self) -> None:
        tables = {
            row[0]
            for row in self.db.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        self.assertTrue(RADAR_TABLES <= tables)

        for table in sorted(RADAR_TABLES):
            columns = {
                row[1]: row[2].upper()
                for row in self.db.execute(f"PRAGMA table_info({table})")
            }
            self.assertEqual(columns.get("workspace_id"), "TEXT")
            self.assertNotIn("BLOB", columns.values())

            indexes = list(self.db.execute(f"PRAGMA index_list({table})"))
            self.assertTrue(indexes, f"{table} must have scoped indexes")
            for index in indexes:
                indexed_columns = [
                    row[2]
                    for row in self.db.execute(f"PRAGMA index_info({index[1]})")
                ]
                self.assertEqual(
                    indexed_columns[0],
                    "workspace_id",
                    f"{table}.{index[1]} is not workspace-first",
                )

        expected_indexes = {
            "ux_content_radar_sources_domain",
            "ux_content_radar_candidates_canonical",
            "ux_content_radar_candidates_cluster",
            "ux_content_radar_candidate_sources_identity",
            "ux_content_radar_runs_active_kind",
            "ux_content_radar_drafts_candidate",
            "ux_content_radar_drafts_post",
            "ux_content_radar_drafts_auto_daily_cluster",
        }
        indexes = {
            row[0]
            for row in self.db.execute(
                "SELECT name FROM sqlite_master WHERE type = 'index'"
            )
        }
        self.assertTrue(expected_indexes <= indexes)

    def test_foreign_keys_enforce_workspace_and_preserve_provenance(self) -> None:
        for table in sorted(RADAR_TABLES):
            foreign_keys = list(self.db.execute(f"PRAGMA foreign_key_list({table})"))
            self.assertTrue(foreign_keys, f"{table} must be attached to a workspace")
            grouped: dict[int, list[sqlite3.Row | tuple[object, ...]]] = {}
            for foreign_key in foreign_keys:
                grouped.setdefault(int(foreign_key[0]), []).append(foreign_key)
                self.assertNotIn(str(foreign_key[5]).upper(), {"CASCADE", "SET NULL"})
                self.assertNotIn(str(foreign_key[6]).upper(), {"CASCADE", "SET NULL"})
            for relation in grouped.values():
                from_columns = {str(row[3]) for row in relation}
                to_table = str(relation[0][2])
                self.assertIn("workspace_id", from_columns)
                if to_table != "workspaces":
                    self.assertGreaterEqual(len(from_columns), 2)

        source(self.db, "ws-a", "source-a")
        candidate(self.db, "ws-a", "candidate-a", "cluster-a", "https://example.com/a")
        candidate(self.db, "ws-b", "candidate-b", "cluster-b", "https://example.com/b")
        self.assert_integrity_error(
            "INSERT INTO content_radar_candidate_sources "
            "(workspace_id, id, candidate_id, source_id, canonical_url, source_domain, "
            "relation, title, discovered_at, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, 'primary', 'Title', ?, ?, ?)",
            (
                "ws-b",
                "provenance-b",
                "candidate-b",
                "source-a",
                "https://example.com/evidence",
                "example.com",
                "2026-11-08T00:00:00Z",
                "2026-11-08T00:00:00Z",
                "2026-11-08T00:00:00Z",
            ),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            draft(
                self.db,
                "ws-b",
                "cross-workspace-draft",
                "candidate-a",
                "post-b",
                "cluster-a",
            )

    def test_scoped_unique_constraints_allow_same_values_across_workspaces(self) -> None:
        source(self.db, "ws-a", "source-1", "shared.example")
        source(self.db, "ws-b", "source-1", "shared.example")
        self.assert_integrity_error(
            "INSERT INTO content_radar_sources "
            "(workspace_id, id, domain, name, tier, kind, niches, enabled, "
            "requires_crosscheck, created_at, updated_at) "
            "VALUES ('ws-a', 'source-2', 'shared.example', 'Duplicate', 'A', "
            "'official', '[\"ai\"]', 1, 0, ?, ?)",
            ("2026-11-08T00:00:00Z", "2026-11-08T00:00:00Z"),
        )

        candidate(self.db, "ws-a", "candidate-1", "cluster-shared", "https://shared.example/news")
        candidate(self.db, "ws-b", "candidate-1", "cluster-shared", "https://shared.example/news")
        for candidate_id, cluster_key, canonical_url in (
            ("candidate-2", "cluster-other", "https://shared.example/news"),
            ("candidate-3", "cluster-shared", "https://shared.example/other"),
        ):
            with self.assertRaises(sqlite3.IntegrityError):
                candidate(self.db, "ws-a", candidate_id, cluster_key, canonical_url)

    def test_provenance_identity_is_unique_per_workspace(self) -> None:
        source(self.db, "ws-a", "source-a")
        candidate(self.db, "ws-a", "candidate-a", "cluster-a", "https://example.com/a")
        values: tuple[object, ...] = (
            "ws-a",
            "provenance-a",
            "candidate-a",
            "source-a",
            "https://example.com/evidence",
            "example.com",
            "primary",
            "Evidence",
            "2026-11-08T00:00:00Z",
            "2026-11-08T00:00:00Z",
            "2026-11-08T00:00:00Z",
        )
        sql = (
            "INSERT INTO content_radar_candidate_sources "
            "(workspace_id, id, candidate_id, source_id, canonical_url, source_domain, "
            "relation, title, discovered_at, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        self.db.execute(sql, values)
        duplicate: list[object] = list(values)
        duplicate[1] = "provenance-b"
        self.assert_integrity_error(sql, tuple(duplicate))

    def test_checks_reject_invalid_enums_and_automatic_draft_state(self) -> None:
        self.assert_integrity_error(
            "INSERT INTO content_radar_sources "
            "(workspace_id, id, domain, name, tier, kind, niches, enabled, "
            "requires_crosscheck, created_at, updated_at) "
            "VALUES ('ws-a', 'bad-tier', 'bad.example', 'Bad', 'E', 'media', '[]', 1, 0, ?, ?)",
            ("2026-11-08T00:00:00Z", "2026-11-08T00:00:00Z"),
        )
        self.assert_integrity_error(
            "INSERT INTO content_radar_sources "
            "(workspace_id, id, domain, name, tier, kind, niches, enabled, "
            "requires_crosscheck, created_at, updated_at) "
            "VALUES ('ws-a', 'tier-d-no-crosscheck', 'community.example', 'Community', 'D', "
            "'community', '[\"technology\"]', 1, 0, ?, ?)",
            ("2026-11-08T00:00:00Z", "2026-11-08T00:00:00Z"),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            candidate(self.db, "ws-a", "bad-niche", "bad-niche", "https://bad.example/niche", "gaming")

        source(self.db, "ws-a", "source-a")
        candidate(self.db, "ws-a", "candidate-a", "cluster-a", "https://example.com/a")
        self.assert_integrity_error(
            "UPDATE content_radar_candidates SET status = 'published' "
            "WHERE workspace_id = 'ws-a' AND id = 'candidate-a'",
            (),
        )
        self.assert_integrity_error(
            "INSERT INTO content_radar_candidate_sources "
            "(workspace_id, id, candidate_id, source_id, canonical_url, source_domain, "
            "relation, title, discovered_at, created_at, updated_at) "
            "VALUES ('ws-a', 'bad-relation', 'candidate-a', 'source-a', "
            "'https://example.com/e', 'example.com', 'quote', 'Title', ?, ?, ?)",
            (
                "2026-11-08T00:00:00Z",
                "2026-11-08T00:00:00Z",
                "2026-11-08T00:00:00Z",
            ),
        )
        self.assert_integrity_error(
            "INSERT INTO content_radar_runs "
            "(workspace_id, id, kind, status, started_at, created_at, updated_at) "
            "VALUES ('ws-a', 'bad-kind', 'publisher', 'running', ?, ?, ?)",
            (
                "2026-11-08T00:00:00Z",
                "2026-11-08T00:00:00Z",
                "2026-11-08T00:00:00Z",
            ),
        )
        self.assert_integrity_error(
            "INSERT INTO content_radar_runs "
            "(workspace_id, id, kind, status, started_at, created_at, updated_at) "
            "VALUES ('ws-a', 'bad-status', 'collector', 'paused', ?, ?, ?)",
            (
                "2026-11-08T00:00:00Z",
                "2026-11-08T00:00:00Z",
                "2026-11-08T00:00:00Z",
            ),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            draft(
                self.db,
                "ws-a",
                "bad-draft",
                "candidate-a",
                "post-a",
                "cluster-a",
                status="Review",
            )
        with self.assertRaises(sqlite3.IntegrityError):
            draft(
                self.db,
                "ws-a",
                "manual-with-auto-date",
                "candidate-a",
                "post-a",
                "cluster-a",
                creation_kind="manual",
                auto_date_wib="2026-11-08",
                created_by="Owner",
            )
        with self.assertRaises(sqlite3.IntegrityError):
            draft(
                self.db,
                "ws-a",
                "invalid-auto-date",
                "candidate-a",
                "post-a",
                "cluster-a",
                auto_date_wib="2026-13-40",
            )

    def test_active_run_lock_is_workspace_and_kind_scoped_then_released(self) -> None:
        sql = (
            "INSERT INTO content_radar_runs "
            "(workspace_id, id, kind, status, started_at, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        timestamp = "2026-11-08T00:00:00Z"
        self.db.execute(sql, ("ws-a", "run-a", "collector", "running", timestamp, timestamp, timestamp))
        self.db.execute(sql, ("ws-a", "run-selector", "selector", "running", timestamp, timestamp, timestamp))
        self.db.execute(sql, ("ws-b", "run-b", "collector", "running", timestamp, timestamp, timestamp))
        self.assert_integrity_error(
            sql,
            ("ws-a", "run-duplicate", "collector", "queued", timestamp, timestamp, timestamp),
        )
        self.db.execute(
            "UPDATE content_radar_runs SET status = 'succeeded', finished_at = ? "
            "WHERE workspace_id = 'ws-a' AND id = 'run-a'",
            (timestamp,),
        )
        self.db.execute(sql, ("ws-a", "run-retry", "collector", "running", timestamp, timestamp, timestamp))

    def test_draft_uniqueness_and_partial_daily_retry(self) -> None:
        for workspace_id in ("ws-a", "ws-b"):
            for number in range(1, 7):
                candidate(
                    self.db,
                    workspace_id,
                    f"candidate-{number}",
                    f"cluster-{number}",
                    f"https://example.com/{number}",
                )

        draft(self.db, "ws-a", "draft-1", "candidate-1", "post-1", "cluster-1")
        draft(self.db, "ws-a", "draft-2", "candidate-2", "post-2", "cluster-2")
        draft(self.db, "ws-a", "draft-3", "candidate-3", "post-3", "cluster-3")
        draft(self.db, "ws-b", "draft-1", "candidate-1", "post-1", "cluster-1")

        with self.assertRaises(sqlite3.IntegrityError):
            draft(self.db, "ws-a", "candidate-duplicate", "candidate-1", "post-x", "cluster-x")
        with self.assertRaises(sqlite3.IntegrityError):
            draft(self.db, "ws-a", "post-duplicate", "candidate-4", "post-1", "cluster-4")
        with self.assertRaises(sqlite3.IntegrityError):
            draft(self.db, "ws-a", "cluster-duplicate", "candidate-4", "post-4", "cluster-1")

        draft(
            self.db,
            "ws-a",
            "manual-owner",
            "candidate-4",
            "post-4",
            "cluster-4",
            creation_kind="manual",
            auto_date_wib=None,
            created_by="Owner",
        )
        # The manual Draft above must not occupy the automatic slot for
        # cluster-4 on the same selector date.
        draft(
            self.db,
            "ws-a",
            "automatic-after-manual",
            "candidate-5",
            "post-5",
            "cluster-4",
        )
        draft(
            self.db,
            "ws-a",
            "next-day",
            "candidate-6",
            "post-6",
            "cluster-1",
            auto_date_wib="2026-11-09",
        )


class ContentRadarRegistryTest(unittest.TestCase):
    def setUp(self) -> None:
        path = ROOT / "scripts" / "content_radar_sources.json"
        self.registry_text = path.read_text(encoding="utf-8")
        self.registry = json.loads(self.registry_text)

    def test_registry_has_valid_scoped_seed_shape(self) -> None:
        self.assertIsInstance(self.registry, list)
        self.assertGreater(len(self.registry), 0)
        domains: list[str] = []
        tiers: set[str] = set()
        for entry in self.registry:
            self.assertEqual(
                set(entry),
                {"domain", "name", "tier", "kind", "feedUrl", "enabled", "requiresCrosscheck", "niches"},
            )
            self.assertIsInstance(entry["domain"], str)
            self.assertEqual(entry["domain"], entry["domain"].lower())
            self.assertNotIn("://", entry["domain"])
            self.assertIn(entry["tier"], {"A", "B", "C", "D"})
            self.assertIsInstance(entry["enabled"], bool)
            self.assertIsInstance(entry["requiresCrosscheck"], bool)
            self.assertIsInstance(entry["niches"], list)
            self.assertTrue(entry["niches"])
            self.assertTrue(set(entry["niches"]) <= NICHES)
            if entry["feedUrl"] is not None:
                self.assertRegex(entry["feedUrl"], r"^https?://")
            if entry["tier"] == "D":
                self.assertTrue(entry["requiresCrosscheck"])
            domains.append(entry["domain"])
            tiers.add(entry["tier"])
        self.assertEqual(tiers, {"A", "B", "C", "D"})
        self.assertEqual(len(domains), len(set(domains)))

    def test_registry_contains_approved_examples_without_credentials(self) -> None:
        domains = {entry["domain"] for entry in self.registry}
        expected = {
            "openai.com",
            "anthropic.com",
            "github.blog",
            "blog.cloudflare.com",
            "ojk.go.id",
            "bi.go.id",
            "bappebti.go.id",
            "reuters.com",
            "apnews.com",
            "techcrunch.com",
            "theverge.com",
            "coindesk.com",
            "tekno.kompas.com",
            "tekno.tempo.co",
            "katadata.co.id",
            "dailysocial.id",
            "x.com",
            "reddit.com",
            "news.ycombinator.com",
            "cointelegraph.com",
        }
        self.assertTrue(expected <= domains)
        lowered = self.registry_text.lower()
        for forbidden in ("password", "secret", "token", "api_key", "apikey", "authorization", "bearer"):
            self.assertNotIn(forbidden, lowered)


if __name__ == "__main__":
    unittest.main()
