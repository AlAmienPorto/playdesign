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
SOURCE_KINDS = {
    "official",
    "media",
    "community",
    "regulator",
    "research",
    "project",
    "discovered",
}


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


TS = "2026-11-08T00:00:00Z"


def insert_source(connection: sqlite3.Connection, **overrides: object) -> None:
    """Insert one `content_radar_sources` row so a single column can be probed."""

    row: dict[str, object] = {
        "workspace_id": "ws-a",
        "id": "source-x",
        "domain": "example.com",
        "name": "Example",
        "tier": "A",
        "kind": "official",
        "niches": '["technology"]',
        "feed_url": None,
        "enabled": 1,
        "requires_crosscheck": 0,
        "created_at": TS,
        "updated_at": TS,
    }
    row.update(overrides)
    connection.execute(
        "INSERT INTO content_radar_sources "
        "(workspace_id, id, domain, name, tier, kind, niches, feed_url, enabled, "
        "requires_crosscheck, created_at, updated_at) "
        "VALUES (:workspace_id, :id, :domain, :name, :tier, :kind, :niches, "
        ":feed_url, :enabled, :requires_crosscheck, :created_at, :updated_at)",
        row,
    )


def insert_candidate(connection: sqlite3.Connection, **overrides: object) -> None:
    """Insert one `content_radar_candidates` row with every column explicit."""

    row: dict[str, object] = {
        "workspace_id": "ws-a",
        "id": "candidate-x",
        "cluster_key": "cluster-x",
        "canonical_url": "https://example.com/x",
        "title": "Title",
        "summary": "Summary",
        "published_at": TS,
        "published_at_source": "feed",
        "discovered_at": TS,
        "last_seen_at": TS,
        "timestamp_fallback": 0,
        "niche": "technology",
        "language": "id",
        "status": "qualified",
        "source_domain": "example.com",
        "source_tier": "A",
        "score_components": "{}",
        "score_total": 80,
        "rubric_version": "v1",
        "score_input_snapshot": "{}",
        "score_reason": "reason",
        "risk_flags": "[]",
        "rejection_reason": None,
        "draft_id": None,
        "created_at": TS,
        "updated_at": TS,
    }
    row.update(overrides)
    connection.execute(
        "INSERT INTO content_radar_candidates "
        "(workspace_id, id, cluster_key, canonical_url, title, summary, "
        "published_at, published_at_source, discovered_at, last_seen_at, "
        "timestamp_fallback, niche, language, status, source_domain, source_tier, "
        "score_components, score_total, rubric_version, score_input_snapshot, "
        "score_reason, risk_flags, rejection_reason, draft_id, created_at, updated_at) "
        "VALUES (:workspace_id, :id, :cluster_key, :canonical_url, :title, :summary, "
        ":published_at, :published_at_source, :discovered_at, :last_seen_at, "
        ":timestamp_fallback, :niche, :language, :status, :source_domain, :source_tier, "
        ":score_components, :score_total, :rubric_version, :score_input_snapshot, "
        ":score_reason, :risk_flags, :rejection_reason, :draft_id, :created_at, :updated_at)",
        row,
    )


def insert_provenance(connection: sqlite3.Connection, **overrides: object) -> None:
    """Insert one `content_radar_candidate_sources` provenance row."""

    row: dict[str, object] = {
        "workspace_id": "ws-a",
        "id": "provenance-x",
        "candidate_id": "candidate-x",
        "source_id": "source-x",
        "canonical_url": "https://example.com/evidence",
        "source_domain": "example.com",
        "relation": "primary",
        "title": "Evidence",
        "published_at": TS,
        "evidence_excerpt": "Excerpt",
        "discovered_at": TS,
        "created_at": TS,
        "updated_at": TS,
    }
    row.update(overrides)
    connection.execute(
        "INSERT INTO content_radar_candidate_sources "
        "(workspace_id, id, candidate_id, source_id, canonical_url, source_domain, "
        "relation, title, published_at, evidence_excerpt, discovered_at, created_at, "
        "updated_at) "
        "VALUES (:workspace_id, :id, :candidate_id, :source_id, :canonical_url, "
        ":source_domain, :relation, :title, :published_at, :evidence_excerpt, "
        ":discovered_at, :created_at, :updated_at)",
        row,
    )


def insert_run(connection: sqlite3.Connection, **overrides: object) -> None:
    """Insert one `content_radar_runs` row, terminal by default.

    The default status is `succeeded` so a probe never collides with the
    `ux_content_radar_runs_active_kind` partial index.
    """

    row: dict[str, object] = {
        "workspace_id": "ws-a",
        "id": "run-x",
        "kind": "collector",
        "status": "succeeded",
        "started_at": TS,
        "finished_at": TS,
        "heartbeat_at": TS,
        "fetched_count": 1,
        "new_count": 1,
        "updated_count": 1,
        "qualified_count": 1,
        "drafted_count": 1,
        "rejected_count": 1,
        "error": None,
        "meta": "{}",
        "created_at": TS,
        "updated_at": TS,
    }
    row.update(overrides)
    connection.execute(
        "INSERT INTO content_radar_runs "
        "(workspace_id, id, kind, status, started_at, finished_at, heartbeat_at, "
        "fetched_count, new_count, updated_count, qualified_count, drafted_count, "
        "rejected_count, error, meta, created_at, updated_at) "
        "VALUES (:workspace_id, :id, :kind, :status, :started_at, :finished_at, "
        ":heartbeat_at, :fetched_count, :new_count, :updated_count, :qualified_count, "
        ":drafted_count, :rejected_count, :error, :meta, :created_at, :updated_at)",
        row,
    )


def insert_draft(connection: sqlite3.Connection, **overrides: object) -> None:
    """Insert one `content_radar_drafts` row with every column explicit."""

    row: dict[str, object] = {
        "workspace_id": "ws-a",
        "id": "draft-x",
        "candidate_id": "candidate-x",
        "post_id": "post-x",
        "cluster_key": "cluster-x",
        "auto_date_wib": "2026-11-08",
        "creation_kind": "automatic",
        "title": "Draft title",
        "document": "{}",
        "status": "Draft",
        "score_snapshot": "{}",
        "sources_snapshot": "[]",
        "created_by": "radar-agent",
        "imported_at": None,
        "created_at": TS,
        "updated_at": TS,
    }
    row.update(overrides)
    connection.execute(
        "INSERT INTO content_radar_drafts "
        "(workspace_id, id, candidate_id, post_id, cluster_key, auto_date_wib, "
        "creation_kind, title, document, status, score_snapshot, sources_snapshot, "
        "created_by, imported_at, created_at, updated_at) "
        "VALUES (:workspace_id, :id, :candidate_id, :post_id, :cluster_key, "
        ":auto_date_wib, :creation_kind, :title, :document, :status, :score_snapshot, "
        ":sources_snapshot, :created_by, :imported_at, :created_at, :updated_at)",
        row,
    )


class RadarDatabaseMixin:
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

    def assert_rejects(self, insert: object, **overrides: object) -> None:
        """Assert the row is rejected by a real CHECK/FK/UNIQUE constraint."""

        with self.assertRaises(sqlite3.IntegrityError):
            insert(self.db, **overrides)  # type: ignore[operator]

    def scalar(self, sql: str, parameters: tuple[object, ...] = ()) -> object:
        row = self.db.execute(sql, parameters).fetchone()
        assert row is not None
        return row[0]


class ContentRadarMigrationTest(RadarDatabaseMixin, unittest.TestCase):

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
            "idx_content_radar_runs_reaper",
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


class ContentRadarConstraintTest(RadarDatabaseMixin, unittest.TestCase):
    """Every CHECK constraint and FK in `0018` must be proven by real SQL.

    Each assertion here is mutation-checked: deleting the constraint from
    `migrations/0018_content_radar.sql` makes the corresponding test fail.
    """

    def test_source_checks_reject_invalid_rows(self) -> None:
        self.assert_rejects(insert_source, kind="unknown")
        self.assert_rejects(insert_source, niches="not-json")
        self.assert_rejects(insert_source, niches='{"technology": true}')
        self.assert_rejects(insert_source, enabled=2)
        self.assert_rejects(insert_source, requires_crosscheck=2)
        self.assert_rejects(insert_source, domain="Example.COM")
        self.assert_rejects(insert_source, domain="")
        self.assert_rejects(insert_source, feed_url="ftp://example.com/feed.xml")
        self.assert_rejects(insert_source, feed_url="example.com/feed.xml")
        self.assert_rejects(insert_source, tier="D", requires_crosscheck=0)

        insert_source(
            self.db,
            id="source-http",
            domain="plain-http.example",
            feed_url="http://plain-http.example/feed.xml",
        )
        insert_source(
            self.db,
            id="source-https",
            domain="secure.example",
            feed_url="https://secure.example/feed.xml",
        )
        insert_source(self.db, id="source-no-feed", domain="no-feed.example", feed_url=None)

    def test_candidate_checks_reject_invalid_rows(self) -> None:
        self.assert_rejects(insert_candidate, published_at_source="rumour")
        self.assert_rejects(insert_candidate, timestamp_fallback=2)
        self.assert_rejects(insert_candidate, source_tier="E")
        self.assert_rejects(insert_candidate, score_components="[]")
        self.assert_rejects(insert_candidate, score_components="{")
        self.assert_rejects(insert_candidate, score_total=101)
        self.assert_rejects(insert_candidate, score_total=-1)
        self.assert_rejects(insert_candidate, score_input_snapshot="[]")
        self.assert_rejects(insert_candidate, risk_flags="{}")
        self.assert_rejects(insert_candidate, cluster_key="")
        self.assert_rejects(insert_candidate, canonical_url="ftp://example.com/x")
        self.assert_rejects(insert_candidate, canonical_url="example.com/x")

        insert_candidate(self.db, id="candidate-ok", published_at_source=None)
        self.assertEqual(
            self.scalar(
                "SELECT score_total FROM content_radar_candidates "
                "WHERE workspace_id = 'ws-a' AND id = 'candidate-ok'"
            ),
            80,
        )

    def test_provenance_checks_reject_invalid_rows(self) -> None:
        insert_source(self.db, id="source-a")
        insert_candidate(self.db, id="candidate-a")
        # Valid candidate/source ids keep the FK satisfied so only the probed
        # CHECK can reject these rows.
        self.assert_rejects(
            insert_provenance,
            candidate_id="candidate-a",
            source_id="source-a",
            canonical_url="ftp://example.com/e",
        )
        self.assert_rejects(
            insert_provenance,
            candidate_id="candidate-a",
            source_id="source-a",
            source_domain="",
        )
        insert_provenance(
            self.db,
            id="provenance-ok",
            candidate_id="candidate-a",
            source_id="source-a",
        )

    def test_run_checks_reject_invalid_rows(self) -> None:
        counters = (
            "fetched_count",
            "new_count",
            "updated_count",
            "qualified_count",
            "drafted_count",
            "rejected_count",
        )
        for counter in counters:
            with self.subTest(counter=counter):
                self.assert_rejects(insert_run, **{counter: -1})

        self.assert_rejects(insert_run, meta="[]")
        self.assert_rejects(insert_run, meta="{")
        self.assert_rejects(insert_run, status="running", started_at=None)
        self.assert_rejects(insert_run, status="succeeded", finished_at=None)
        self.assert_rejects(insert_run, status="failed", finished_at=None)
        self.assert_rejects(insert_run, status="cancelled", finished_at=None)

        insert_run(self.db, id="run-ok", status="running", finished_at=None)

    def test_draft_checks_reject_invalid_rows(self) -> None:
        insert_candidate(self.db, id="candidate-a")
        # The candidate FK is satisfied for every probe below, so only the
        # probed CHECK can reject the row.
        probes: tuple[dict[str, object], ...] = (
            # `creation_kind` is jointly enforced: the enum CHECK and the
            # automatic/manual date CHECK both reject an unknown value, so the
            # enum alone is mutation-indistinguishable (proven with the
            # compound mutation in the fix-round report).
            {"creation_kind": "scheduled"},
            {"document": "[]"},
            {"score_snapshot": "[]"},
            {"sources_snapshot": "{}"},
            {"cluster_key": ""},
            {"status": "Review"},
            {"creation_kind": "automatic", "auto_date_wib": None},
            {"creation_kind": "manual", "auto_date_wib": "2026-11-08"},
            {"auto_date_wib": "2026-13-40"},
        )
        for probe in probes:
            with self.subTest(probe=probe):
                self.assert_rejects(insert_draft, candidate_id="candidate-a", **probe)
        insert_draft(self.db, id="draft-ok", candidate_id="candidate-a")

    def test_every_radar_table_enforces_workspace_foreign_key(self) -> None:
        # Structural: all five tables carry a workspace_id -> workspaces FK that
        # restricts deletion, so Radar data can never outlive its workspace.
        for table in sorted(RADAR_TABLES):
            with self.subTest(table=table):
                relations = [
                    row
                    for row in self.db.execute(f"PRAGMA foreign_key_list({table})")
                    if row[2] == "workspaces"
                ]
                self.assertEqual(len(relations), 1, f"{table} must reference workspaces")
                self.assertEqual(relations[0][3], "workspace_id")
                self.assertEqual(str(relations[0][5]).upper(), "RESTRICT")
                self.assertEqual(str(relations[0][6]).upper(), "RESTRICT")

        # Behavioural: sources, candidates and runs have no other FK, so an
        # unknown workspace can only be rejected by the workspace FK itself.
        self.assert_rejects(insert_source, workspace_id="ws-missing")
        self.assert_rejects(insert_candidate, workspace_id="ws-missing")
        self.assert_rejects(insert_run, workspace_id="ws-missing")

    def test_provenance_rejects_cross_workspace_candidate_and_source_separately(self) -> None:
        insert_source(self.db, workspace_id="ws-b", id="source-b", domain="ws-b.example")
        insert_candidate(
            self.db,
            workspace_id="ws-b",
            id="candidate-b",
            cluster_key="cluster-b",
            canonical_url="https://example.com/b",
        )
        insert_candidate(
            self.db,
            id="candidate-a",
            cluster_key="cluster-a",
            canonical_url="https://example.com/a",
        )
        insert_source(self.db, id="source-a", domain="ws-a.example")
        # Only the candidate_id FK is violated here: the source is valid in ws-b.
        self.assert_rejects(
            insert_provenance,
            workspace_id="ws-b",
            id="provenance-cross-candidate",
            candidate_id="candidate-a",
            source_id="source-b",
            source_domain="ws-b.example",
        )
        # Only the source_id FK is violated here: the candidate is valid in ws-b.
        self.assert_rejects(
            insert_provenance,
            workspace_id="ws-b",
            id="provenance-cross-source",
            candidate_id="candidate-b",
            source_id="source-a",
            source_domain="ws-a.example",
        )
        # The same values are accepted inside one workspace.
        insert_provenance(
            self.db,
            workspace_id="ws-b",
            id="provenance-ok",
            candidate_id="candidate-b",
            source_id="source-b",
            source_domain="ws-b.example",
        )

    def test_candidate_draft_pointer_fk_is_composite_and_enforced(self) -> None:
        insert_candidate(
            self.db,
            id="candidate-a",
            cluster_key="cluster-a",
            canonical_url="https://example.com/a",
        )
        insert_candidate(
            self.db,
            workspace_id="ws-b",
            id="candidate-b",
            cluster_key="cluster-b",
            canonical_url="https://example.com/b",
        )
        # A pointer to a draft that does not exist must be rejected.
        self.assert_integrity_error(
            "UPDATE content_radar_candidates SET draft_id = 'missing-draft' "
            "WHERE workspace_id = 'ws-a' AND id = 'candidate-a'",
            (),
        )
        insert_draft(
            self.db,
            id="draft-a",
            candidate_id="candidate-a",
            post_id="post-a",
            cluster_key="cluster-a",
        )
        # The pointer is workspace-scoped: a ws-b candidate cannot point at a
        # ws-a draft even though the draft id exists.
        self.assert_integrity_error(
            "UPDATE content_radar_candidates SET draft_id = 'draft-a' "
            "WHERE workspace_id = 'ws-b' AND id = 'candidate-b'",
            (),
        )
        self.db.execute(
            "UPDATE content_radar_candidates SET draft_id = 'draft-a', status = 'drafted' "
            "WHERE workspace_id = 'ws-a' AND id = 'candidate-a'"
        )
        self.assertEqual(
            self.scalar(
                "SELECT draft_id FROM content_radar_candidates "
                "WHERE workspace_id = 'ws-a' AND id = 'candidate-a'"
            ),
            "draft-a",
        )

    def test_provenance_identity_index_includes_canonical_url(self) -> None:
        insert_source(self.db, id="source-a")
        insert_candidate(self.db, id="candidate-a")
        # Same candidate+source with a different evidence URL is a distinct
        # provenance row, so the identity index must include canonical_url.
        insert_provenance(
            self.db,
            id="provenance-one",
            candidate_id="candidate-a",
            source_id="source-a",
            canonical_url="https://example.com/one",
        )
        insert_provenance(
            self.db,
            id="provenance-two",
            candidate_id="candidate-a",
            source_id="source-a",
            canonical_url="https://example.com/two",
        )
        # Same candidate+source+URL is the same evidence even with a different
        # relation, so relation is not part of the identity.
        self.assert_rejects(
            insert_provenance,
            id="provenance-three",
            candidate_id="candidate-a",
            source_id="source-a",
            canonical_url="https://example.com/one",
            relation="crosscheck",
        )
        self.assertEqual(
            self.scalar(
                "SELECT COUNT(*) FROM content_radar_candidate_sources "
                "WHERE workspace_id = 'ws-a' AND candidate_id = 'candidate-a' "
                "AND source_id = 'source-a'"
            ),
            2,
        )

    def test_manual_and_automatic_drafts_coexist_for_same_cluster_and_date(self) -> None:
        insert_candidate(
            self.db,
            id="candidate-manual",
            cluster_key="cluster-manual",
            canonical_url="https://example.com/manual",
        )
        insert_candidate(
            self.db,
            id="candidate-auto",
            cluster_key="cluster-auto",
            canonical_url="https://example.com/auto",
        )
        insert_candidate(
            self.db,
            id="candidate-auto-2",
            cluster_key="cluster-auto-2",
            canonical_url="https://example.com/auto-2",
        )

        # Owner manual Draft for cluster-shared, no selector date.
        insert_draft(
            self.db,
            id="draft-manual",
            candidate_id="candidate-manual",
            post_id="post-manual",
            cluster_key="cluster-shared",
            creation_kind="manual",
            auto_date_wib=None,
            created_by="Owner",
        )
        # The automatic selector may still draft the same cluster on the same
        # date: manual Drafts do not consume the automatic daily slot.
        insert_draft(
            self.db,
            id="draft-auto",
            candidate_id="candidate-auto",
            post_id="post-auto",
            cluster_key="cluster-shared",
            creation_kind="automatic",
            auto_date_wib="2026-11-08",
        )
        # A second *automatic* Draft for the same cluster and date is rejected.
        self.assert_rejects(
            insert_draft,
            id="draft-auto-2",
            candidate_id="candidate-auto-2",
            post_id="post-auto-2",
            cluster_key="cluster-shared",
            auto_date_wib="2026-11-08",
        )
        # A second *manual* Draft for the same cluster and date is allowed.
        insert_draft(
            self.db,
            id="draft-manual-2",
            candidate_id="candidate-auto-2",
            post_id="post-manual-2",
            cluster_key="cluster-shared",
            creation_kind="manual",
            auto_date_wib=None,
            created_by="Owner",
        )
        # The uniqueness index is explicitly a partial index over automatic
        # Drafts, not an implicit consequence of the NULL manual date.
        index_sql = self.scalar(
            "SELECT sql FROM sqlite_master WHERE type = 'index' "
            "AND name = 'ux_content_radar_drafts_auto_daily_cluster'"
        )
        self.assertIsInstance(index_sql, str)
        self.assertIn("WHERE creation_kind = 'automatic'", " ".join(str(index_sql).split()))

    def test_candidate_draft_pointer_requires_existing_draft_first(self) -> None:
        insert_candidate(
            self.db,
            id="candidate-a",
            cluster_key="cluster-a",
            canonical_url="https://example.com/a",
        )
        # 1. A candidate can always be created with a NULL pointer.
        self.assertIsNone(
            self.scalar(
                "SELECT draft_id FROM content_radar_candidates "
                "WHERE workspace_id = 'ws-a' AND id = 'candidate-a'"
            )
        )
        # 2. Pointing at a draft that does not exist yet fails.
        self.assert_integrity_error(
            "UPDATE content_radar_candidates SET draft_id = 'draft-a', status = 'drafted' "
            "WHERE workspace_id = 'ws-a' AND id = 'candidate-a'",
            (),
        )
        # 3. Insert the draft, then set the pointer and status in one statement.
        insert_draft(
            self.db,
            id="draft-a",
            candidate_id="candidate-a",
            post_id="post-a",
            cluster_key="cluster-a",
        )
        self.db.execute(
            "UPDATE content_radar_candidates SET draft_id = 'draft-a', status = 'drafted' "
            "WHERE workspace_id = 'ws-a' AND id = 'candidate-a'"
        )
        self.assertEqual(
            self.scalar(
                "SELECT status FROM content_radar_candidates "
                "WHERE workspace_id = 'ws-a' AND id = 'candidate-a'"
            ),
            "drafted",
        )
        # 4. The draft cannot be deleted while the pointer is set.
        self.assert_integrity_error(
            "DELETE FROM content_radar_drafts "
            "WHERE workspace_id = 'ws-a' AND id = 'draft-a'",
            (),
        )
        # 5. Clearing the pointer releases the draft.
        self.db.execute(
            "UPDATE content_radar_candidates SET draft_id = NULL "
            "WHERE workspace_id = 'ws-a' AND id = 'candidate-a'"
        )
        self.db.execute(
            "DELETE FROM content_radar_drafts "
            "WHERE workspace_id = 'ws-a' AND id = 'draft-a'"
        )
        self.assertEqual(
            self.scalar(
                "SELECT COUNT(*) FROM content_radar_drafts WHERE workspace_id = 'ws-a'"
            ),
            0,
        )

    def test_candidate_deletion_chain_requires_provenance_and_pointer_cleanup(self) -> None:
        insert_source(self.db, id="source-a")
        insert_candidate(
            self.db,
            id="candidate-a",
            cluster_key="cluster-a",
            canonical_url="https://example.com/a",
        )
        insert_provenance(
            self.db,
            id="provenance-a",
            candidate_id="candidate-a",
            source_id="source-a",
        )
        insert_draft(
            self.db,
            id="draft-a",
            candidate_id="candidate-a",
            post_id="post-a",
            cluster_key="cluster-a",
        )
        self.db.execute(
            "UPDATE content_radar_candidates SET draft_id = 'draft-a', status = 'drafted' "
            "WHERE workspace_id = 'ws-a' AND id = 'candidate-a'"
        )

        # RESTRICT everywhere: the candidate cannot be deleted while provenance
        # rows or a draft still reference it.
        self.assert_integrity_error(
            "DELETE FROM content_radar_candidates "
            "WHERE workspace_id = 'ws-a' AND id = 'candidate-a'",
            (),
        )
        # Step 1: delete provenance rows.
        self.db.execute(
            "DELETE FROM content_radar_candidate_sources "
            "WHERE workspace_id = 'ws-a' AND candidate_id = 'candidate-a'"
        )
        self.assert_integrity_error(
            "DELETE FROM content_radar_candidates "
            "WHERE workspace_id = 'ws-a' AND id = 'candidate-a'",
            (),
        )
        # Step 2: the draft still cannot go while the pointer is set.
        self.assert_integrity_error(
            "DELETE FROM content_radar_drafts "
            "WHERE workspace_id = 'ws-a' AND id = 'draft-a'",
            (),
        )
        # Step 3: clear the pointer, then delete the draft.
        self.db.execute(
            "UPDATE content_radar_candidates SET draft_id = NULL, status = 'archived' "
            "WHERE workspace_id = 'ws-a' AND id = 'candidate-a'"
        )
        self.db.execute(
            "DELETE FROM content_radar_drafts "
            "WHERE workspace_id = 'ws-a' AND id = 'draft-a'"
        )
        # Step 4: delete the candidate.
        self.db.execute(
            "DELETE FROM content_radar_candidates "
            "WHERE workspace_id = 'ws-a' AND id = 'candidate-a'"
        )
        for table in (
            "content_radar_candidates",
            "content_radar_candidate_sources",
            "content_radar_drafts",
        ):
            self.assertEqual(
                self.scalar(f"SELECT COUNT(*) FROM {table} WHERE workspace_id = 'ws-a'"),
                0,
                f"{table} should be empty after the deletion chain",
            )
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM content_radar_sources"), 1)

    def test_tier_d_requires_crosscheck_on_update_but_promotion_is_free(self) -> None:
        insert_source(self.db, id="source-b", domain="tier-b.example", tier="B")
        # A tier-only UPDATE would silently create a Tier D source that is not
        # cross-checked, so the CHECK must reject it.
        self.assert_integrity_error(
            "UPDATE content_radar_sources SET tier = 'D' "
            "WHERE workspace_id = 'ws-a' AND id = 'source-b'",
            (),
        )
        self.assertEqual(
            self.scalar(
                "SELECT tier || '/' || requires_crosscheck FROM content_radar_sources "
                "WHERE workspace_id = 'ws-a' AND id = 'source-b'"
            ),
            "B/0",
        )
        # Setting both columns in one statement is the supported demotion path.
        self.db.execute(
            "UPDATE content_radar_sources SET tier = 'D', requires_crosscheck = 1 "
            "WHERE workspace_id = 'ws-a' AND id = 'source-b'"
        )
        self.assertEqual(
            self.scalar(
                "SELECT tier || '/' || requires_crosscheck FROM content_radar_sources "
                "WHERE workspace_id = 'ws-a' AND id = 'source-b'"
            ),
            "D/1",
        )
        # Promotion out of Tier D may clear the flag; the CHECK is one-way.
        self.db.execute(
            "UPDATE content_radar_sources SET tier = 'A', requires_crosscheck = 0 "
            "WHERE workspace_id = 'ws-a' AND id = 'source-b'"
        )
        self.assertEqual(
            self.scalar(
                "SELECT tier || '/' || requires_crosscheck FROM content_radar_sources "
                "WHERE workspace_id = 'ws-a' AND id = 'source-b'"
            ),
            "A/0",
        )

    def test_discovered_kind_registers_unverified_collector_sources(self) -> None:
        insert_source(
            self.db,
            id="source-discovered",
            domain="newly-seen.example",
            tier="unverified",
            kind="discovered",
        )
        self.assertEqual(
            self.scalar(
                "SELECT tier || '/' || kind FROM content_radar_sources "
                "WHERE workspace_id = 'ws-a' AND id = 'source-discovered'"
            ),
            "unverified/discovered",
        )
        # The auto-registered source can carry provenance for a candidate.
        insert_candidate(self.db, id="candidate-a")
        insert_provenance(
            self.db,
            id="provenance-a",
            candidate_id="candidate-a",
            source_id="source-discovered",
            source_domain="newly-seen.example",
        )
        self.assertEqual(
            self.scalar(
                "SELECT COUNT(*) FROM content_radar_candidate_sources "
                "WHERE workspace_id = 'ws-a' AND source_id = 'source-discovered'"
            ),
            1,
        )
        # `discovered` widens the enum by exactly one value; garbage is rejected.
        self.assert_rejects(
            insert_source,
            id="source-garbage",
            domain="garbage.example",
            tier="unverified",
            kind="unknown",
        )

    def test_stale_running_run_blocks_then_cancelled_releases_the_lock(self) -> None:
        index_columns = {
            row[1]: [info[2] for info in self.db.execute(f"PRAGMA index_info({row[1]})")]
            for row in self.db.execute("PRAGMA index_list(content_radar_runs)")
        }
        self.assertEqual(
            index_columns.get("idx_content_radar_runs_reaper"),
            ["workspace_id", "kind", "status", "heartbeat_at"],
            "the reaper needs a (workspace, kind, status, heartbeat) scan index",
        )

        insert_run(
            self.db,
            id="run-stale",
            kind="collector",
            status="running",
            finished_at=None,
            heartbeat_at="2026-11-08T00:00:00Z",
        )
        # A crashed run still owns the workspace+kind lock.
        self.assert_rejects(
            insert_run, id="run-blocked-running", kind="collector", status="running", finished_at=None
        )
        self.assert_rejects(
            insert_run,
            id="run-blocked-queued",
            kind="collector",
            status="queued",
            started_at=None,
            finished_at=None,
        )
        # The reaper marks the stale run cancelled, which releases the lock.
        self.db.execute(
            "UPDATE content_radar_runs SET status = 'cancelled', finished_at = ?, "
            "updated_at = ? WHERE workspace_id = 'ws-a' AND id = 'run-stale'",
            (TS, TS),
        )
        insert_run(self.db, id="run-retry", kind="collector", status="running", finished_at=None)
        self.assertEqual(
            self.scalar(
                "SELECT COUNT(*) FROM content_radar_runs "
                "WHERE workspace_id = 'ws-a' AND kind = 'collector'"
            ),
            2,
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
            self.assertIn(entry["kind"], SOURCE_KINDS)
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
        by_domain = {entry["domain"]: entry for entry in self.registry}
        # Cointelegraph is a media outlet; its Tier D trust level (not its kind)
        # is what carries the mandatory cross-check.
        self.assertEqual(by_domain["cointelegraph.com"]["kind"], "media")
        self.assertTrue(by_domain["cointelegraph.com"]["requiresCrosscheck"])
        lowered = self.registry_text.lower()
        for forbidden in ("password", "secret", "token", "api_key", "apikey", "authorization", "bearer"):
            self.assertNotIn(forbidden, lowered)


if __name__ == "__main__":
    unittest.main()
