"""Uji logika koordinator: deteksi, kebijakan, dan format laporan.

Semua fungsi yang diuji murni (tanpa jaringan/D1) supaya bisa dijalankan
tanpa menyentuh produksi.
"""

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import coordinator as co  # noqa: E402

NOW = datetime(2026, 11, 6, 10, 0, 0, tzinfo=timezone.utc)


def minutes_ago(m):
    return (NOW - timedelta(minutes=m)).strftime("%Y-%m-%d %H:%M:%S")


def video(status, minutes, **kw):
    row = {
        "id": kw.pop("id", "vj-1"),
        "title": kw.pop("title", "Video uji"),
        "status": status,
        "attempts": kw.pop("attempts", 0),
        "error": kw.pop("error", None),
        "createdAt": minutes_ago(minutes),
        "startedAt": minutes_ago(minutes) if status in ("rendering", "uploading") else None,
    }
    row.update(kw)
    return row


def scrape(status, minutes, **kw):
    row = {
        "id": kw.pop("id", "sq-1"),
        "city": kw.pop("city", "Semarang"),
        "keyword": kw.pop("keyword", "catering"),
        "status": status,
        "requestedAt": minutes_ago(minutes),
        "startedAt": minutes_ago(minutes) if status == "running" else None,
    }
    row.update(kw)
    return row


def run_row(state, minutes, **kw):
    row = {"id": kw.pop("id", "run-1"), "state": state, "startedAt": minutes_ago(minutes)}
    row.update(kw)
    return row


def state(video_rows=(), scrape_rows=(), run_rows=()):
    return {"video": list(video_rows), "scrape": list(scrape_rows), "runs": list(run_rows)}


class ParseTimestampTest(unittest.TestCase):
    def test_d1_format(self):
        self.assertEqual(
            co.parse_ts("2026-11-06 09:30:00"), datetime(2026, 11, 6, 9, 30, tzinfo=timezone.utc)
        )

    def test_iso_with_z(self):
        self.assertEqual(
            co.parse_ts("2026-11-06T09:30:00Z"), datetime(2026, 11, 6, 9, 30, tzinfo=timezone.utc)
        )

    def test_empty_is_none(self):
        self.assertIsNone(co.parse_ts(None))
        self.assertIsNone(co.parse_ts(""))


class VideoRulesTest(unittest.TestCase):
    def test_queued_short_is_quiet(self):
        self.assertEqual(co.analyze(state(video_rows=[video("queued", 3)]), NOW), [])

    def test_queued_long_wakes_runner(self):
        findings = co.analyze(state(video_rows=[video("queued", 12)]), NOW)
        self.assertEqual(len(findings), 1)
        f = findings[0]
        self.assertEqual((f.kind, f.severity, f.action), ("video_queued", "warn", "run_video_runner"))

    def test_rendering_stalled_fails_job(self):
        findings = co.analyze(state(video_rows=[video("rendering", 30)]), NOW)
        self.assertEqual([(f.kind, f.action) for f in findings], [("video_stalled", "fail_stalled")])

    def test_failed_first_time_requeues(self):
        findings = co.analyze(state(video_rows=[video("failed", 20, attempts=0, error="ffmpeg mati")]), NOW)
        self.assertEqual([(f.kind, f.action) for f in findings], [("video_failed", "requeue_video")])

    def test_failed_twice_escalates_without_action(self):
        findings = co.analyze(state(video_rows=[video("failed", 20, attempts=2, error="ffmpeg mati")]), NOW)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].kind, "video_failed")
        self.assertEqual(findings[0].severity, "critical")
        self.assertIsNone(findings[0].action)

    def test_rate_limit_is_not_retried(self):
        findings = co.analyze(
            state(video_rows=[video("failed", 20, attempts=0, error="429 rate_limited")]), NOW
        )
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].kind, "video_quota")
        self.assertIsNone(findings[0].action)

    def test_auth_failure_escalates_without_retry(self):
        findings = co.analyze(
            state(video_rows=[video("failed", 20, attempts=0, error="HTTP Error 401: Unauthorized")]), NOW
        )
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].kind, "video_auth")
        self.assertEqual(findings[0].severity, "critical")
        self.assertIsNone(findings[0].action)

    def test_stale_failure_is_not_requeued(self):
        findings = co.analyze(
            state(video_rows=[video("failed", 400, attempts=0, error="ffmpeg mati")]), NOW
        )
        self.assertEqual([(f.kind, f.action) for f in findings], [("video_stale", None)])

    def test_done_is_never_a_finding(self):
        self.assertEqual(co.analyze(state(video_rows=[video("done", 300)]), NOW), [])


class ScrapeAndRunRulesTest(unittest.TestCase):
    def test_scrape_pending_long_wakes_runner(self):
        findings = co.analyze(state(scrape_rows=[scrape("pending", 20)]), NOW)
        self.assertEqual([(f.kind, f.action) for f in findings], [("scrape_pending", "run_scrape_runner")])

    def test_scrape_running_stalled_fails(self):
        findings = co.analyze(state(scrape_rows=[scrape("running", 25)]), NOW)
        self.assertEqual([(f.kind, f.action) for f in findings], [("scrape_stalled", "fail_scrape")])

    def test_run_queued_long_wakes_executor(self):
        findings = co.analyze(state(run_rows=[run_row("queued", 40)]), NOW)
        self.assertEqual([(f.kind, f.action) for f in findings], [("run_queued", "run_executor")])

    def test_findings_are_sorted_by_severity(self):
        findings = co.analyze(
            state(
                video_rows=[video("queued", 12)],
                scrape_rows=[scrape("running", 25)],
            ),
            NOW,
        )
        self.assertEqual([f.severity for f in findings], ["critical", "warn"])


class FormatTest(unittest.TestCase):
    def test_status_clean(self):
        text = co.format_status(state(), [], NOW)
        self.assertIn("bersih", text.lower())

    def test_status_lists_pipeline_counts(self):
        text = co.format_status(
            state(video_rows=[video("queued", 1), video("done", 100)], scrape_rows=[scrape("pending", 1)]),
            [],
            NOW,
        )
        self.assertIn("Video", text)
        self.assertIn("1 antre", text)
        self.assertIn("1 selesai", text)
        self.assertIn("Scrape", text)

    def test_status_shows_attention(self):
        findings = co.analyze(state(video_rows=[video("rendering", 30)]), NOW)
        text = co.format_status(state(video_rows=[video("rendering", 30)]), findings, NOW)
        self.assertIn("Perlu perhatian", text)
        self.assertIn("vj-1", text)

    def test_alert_line_has_severity_marker(self):
        findings = co.analyze(state(video_rows=[video("rendering", 30)]), NOW)
        line = co.format_finding(findings[0])
        self.assertTrue(line.startswith("🔴"))
        self.assertIn("macet", line)

    def test_alert_text_empty_when_no_findings(self):
        self.assertEqual(co.format_alert([]), "")


class CronRulesTest(unittest.TestCase):
    def job(self, **kw):
        base = {
            "id": "job-1",
            "name": "Runner uji",
            "enabled": True,
            "state": "scheduled",
            "schedule": {"kind": "cron", "expr": "*/3 * * * *"},
            "last_run_at": (NOW - timedelta(minutes=2)).isoformat(),
        }
        base.update(kw)
        return base

    def test_healthy_cron_is_quiet(self):
        self.assertEqual(co.analyze(state(run_rows=[]) | {"cron": [self.job()]}, NOW), [])

    def test_dead_cron_is_critical(self):
        stale = self.job(last_run_at=(NOW - timedelta(minutes=40)).isoformat())
        findings = co.analyze(state() | {"cron": [stale]}, NOW)
        self.assertEqual([(f.pipeline, f.kind) for f in findings], [("cron", "cron_stale")])
        self.assertEqual(findings[0].severity, "critical")

    def test_disabled_cron_ignored(self):
        stale = self.job(enabled=False, last_run_at=(NOW - timedelta(hours=5)).isoformat())
        self.assertEqual(co.analyze(state() | {"cron": [stale]}, NOW), [])

    def test_expected_minutes(self):
        self.assertEqual(co.expected_minutes(self.job()), 3)
        self.assertEqual(co.expected_minutes(self.job(schedule={"kind": "interval", "minutes": 15})), 15)
        self.assertEqual(co.expected_minutes(self.job(schedule={"kind": "cron", "expr": "30 8 * * *"})), 1440)


class QuotaRulesTest(unittest.TestCase):
    def test_quota_warning_when_busy(self):
        rows = [video("done", 5, id=f"vj-{i}") for i in range(8)]
        findings = co.analyze(state(video_rows=rows), NOW)
        self.assertEqual([f.kind for f in findings], ["video_quota_budget"])
        self.assertEqual(findings[0].severity, "info")

    def test_quota_exhausted_is_warn(self):
        rows = [video("done", 5, id=f"vj-{i}") for i in range(10)]
        findings = co.analyze(state(video_rows=rows), NOW)
        self.assertEqual(findings[0].severity, "warn")

    def test_old_jobs_do_not_count(self):
        rows = [video("done", 200, id=f"vj-{i}") for i in range(10)]
        self.assertEqual(co.analyze(state(video_rows=rows), NOW), [])


class DedupeTest(unittest.TestCase):
    def test_same_job_reported_once(self):
        findings = co.analyze(state(video_rows=[video("queued", 12, id="vj-9")]), NOW)
        keys = {f.key for f in findings}
        self.assertEqual(len(keys), len(findings))


if __name__ == "__main__":
    unittest.main()
