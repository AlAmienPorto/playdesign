"""Tests for the local Content Radar feed collector."""

from __future__ import annotations

import contextlib
import datetime as dt
import io
import json
import os
import socket
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from unittest import mock

SCRIPTS = Path(__file__).resolve().parents[1]
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from content_radar_collector import (  # noqa: E402
    Collector,
    FeedError,
    accept_discovery_evidence,
    canonical_url,
    fetch_feed,
    parse_feed,
    persist_discovery_evidence,
)
from content_radar_common import ApiClient, ApiError, ConfigError, FileLock, load_config  # noqa: E402

ERROR_EXAMPLE_LIMIT = 5

UTC = dt.timezone.utc
NOW = dt.datetime(2026, 11, 8, 8, 0, tzinfo=UTC)
RECENT_RFC = "Sun, 08 Nov 2026 07:00:00 GMT"
RECENT_ISO = "2026-11-08T07:00:00Z"
FUTURE_RFC = "Sun, 08 Nov 2026 09:00:01 GMT"


def rss(*items: str) -> bytes:
    return (
        "<?xml version='1.0'?><rss version='2.0'><channel><title>Radar</title>"
        + "".join(items)
        + "</channel></rss>"
    ).encode()


def rss_item(title: str, link: str, published: str = RECENT_RFC, description: str = "Ringkas") -> str:
    published_element = f"<pubDate>{published}</pubDate>" if published else ""
    return (
        f"<item><title>{title}</title><link>{link}</link>"
        f"{published_element}<description>{description}</description></item>"
    )


def fetch_test_feed(url: str, *, timeout: float, max_bytes: int) -> tuple[bytes, str]:
    return fetch_feed(url, timeout=timeout, max_bytes=max_bytes, allow_private=True)


ATOM = f"""<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Radar Atom</title>
  <entry>
    <title>Rilis Atom</title>
    <link rel="alternate" href="https://example.com/atom?utm_source=feed" />
    <updated>{RECENT_ISO}</updated>
    <summary>Ringkasan Atom</summary>
  </entry>
</feed>
""".encode()


class QuietServer(ThreadingHTTPServer):
    def handle_error(self, request: socket.socket, client_address: tuple[str, int]) -> None:
        pass


class FixtureHandler(BaseHTTPRequestHandler):
    calls: list[dict[str, object]] = []
    token = "token-sangat-rahasia"

    def log_message(self, format: str, *args: object) -> None:
        pass

    def send_body(self, status: int, content_type: str, body: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/rss":
            self.send_body(200, "application/rss+xml; charset=utf-8", rss(rss_item("Rilis RSS", "https://EXAMPLE.com/news/?utm_medium=rss#frag")))
            return
        if self.path == "/atom":
            self.send_body(200, "application/atom+xml", ATOM)
            return
        if self.path == "/bad-type":
            self.send_body(200, "text/html", b"<rss></rss>")
            return
        if self.path == "/large":
            self.send_body(200, "application/xml", b"x" * 4096)
            return
        if self.path == "/slow":
            time.sleep(0.2)
            self.send_body(200, "application/rss+xml", rss(rss_item("Lambat", "https://example.com/slow")))
            return
        if self.path.startswith("/api/content-radar/sources"):
            self._record(None)
            self.send_body(200, "application/json", json.dumps({"sources": [], "pagination": {"hasMore": False}}).encode())
            return
        self.send_body(404, "application/json", b'{"error":"missing"}')

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        self._record(body)
        if self.path == "/api/content-radar/runs":
            response = {"run": {"id": "run-1", "status": "queued"}}
            self.send_body(201, "application/json", json.dumps(response).encode())
            return
        if self.path == "/api/content-radar/runs/run-1":
            self.send_body(200, "application/json", json.dumps({"run": {"id": "run-1", "status": body["status"]}}).encode())
            return
        if self.path == "/api/content-radar/candidates:ingest":
            self.send_body(201, "application/json", b'{"created":true,"candidateId":"candidate-1"}')
            return
        self.send_body(404, "application/json", b'{"error":"missing"}')

    def _record(self, body: object) -> None:
        self.calls.append(
            {
                "method": self.command,
                "path": self.path,
                "authorization": self.headers.get("Authorization"),
                "body": body,
            }
        )


@contextlib.contextmanager
def fixture_server():
    FixtureHandler.calls = []
    server = QuietServer(("127.0.0.1", 0), FixtureHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=1)


@contextlib.contextmanager
def handler_server(handler: type[BaseHTTPRequestHandler]):
    server = QuietServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=1)


class FakeApi:
    def __init__(self, sources: list[dict[str, object]], fail_ingest_url: str | None = None) -> None:
        self.sources = sources
        self.fail_ingest_url = fail_ingest_url
        self.events: list[tuple[str, object]] = []
        self.payloads: list[dict[str, object]] = []

    def create_run(self, kind: str, meta: dict[str, object] | None = None) -> dict[str, object]:
        self.events.append(("create", {"kind": kind, "meta": meta or {}}))
        return {"id": "run-collector", "status": "queued"}

    def update_run(self, run_id: str, **fields: object) -> dict[str, object]:
        self.events.append(("update", {"runId": run_id, **fields}))
        return {"id": run_id, "status": fields.get("status")}

    def list_sources(self) -> list[dict[str, object]]:
        self.events.append(("sources", None))
        return self.sources

    def ingest(self, payload: dict[str, object]) -> dict[str, object]:
        self.events.append(("ingest", payload))
        self.payloads.append(payload)
        url = str(dict(payload["candidate"])["canonicalUrl"])
        if url == self.fail_ingest_url:
            raise RuntimeError("ingest ditolak")
        return {"created": True, "candidateId": "candidate-1"}


class CollectorTests(unittest.TestCase):
    def test_collector_parses_rss_and_atom(self) -> None:
        rss_entries = parse_feed(rss(rss_item("Rilis RSS", "https://example.com/rss")), "application/rss+xml", NOW)
        atom_entries = parse_feed(ATOM, "application/atom+xml", NOW)

        self.assertEqual(rss_entries[0].title, "Rilis RSS")
        self.assertEqual(rss_entries[0].published_at, RECENT_ISO)
        self.assertEqual(atom_entries[0].title, "Rilis Atom")
        self.assertEqual(atom_entries[0].url, "https://example.com/atom")

    def test_collector_accepts_undated_rss_and_atom_entries(self) -> None:
        atom = b"""<?xml version='1.0'?>
        <feed xmlns='http://www.w3.org/2005/Atom'>
          <entry><title>Atom tanpa tanggal</title><link href='https://example.com/atom-undated' /></entry>
        </feed>"""

        rss_entries = parse_feed(
            rss(rss_item("RSS tanpa tanggal", "https://example.com/rss-undated", published="")),
            "application/rss+xml",
            NOW,
        )
        atom_entries = parse_feed(atom, "application/atom+xml", NOW)

        self.assertEqual(rss_entries[0].published_at, None)
        self.assertEqual(atom_entries[0].published_at, None)

    def test_collector_ingests_undated_entry_with_discovery_fallback(self) -> None:
        source = {
            "id": "undated",
            "name": "Undated",
            "domain": "example.com",
            "feedUrl": "https://feeds.example.com/rss",
            "enabled": True,
            "niches": ["technology"],
        }
        api = FakeApi([source])
        body = rss(rss_item("Tanpa tanggal", "https://example.com/undated", published=""))
        result = Collector(
            api,
            timeout=1,
            max_bytes=2048,
            now=lambda: NOW,
            fetcher=lambda *args, **kwargs: (body, "application/rss+xml"),
        ).run()

        self.assertEqual(result.created, 1)
        candidate = dict(api.payloads[0]["candidate"])
        provenance = dict(api.payloads[0]["provenance"][0])
        self.assertEqual(candidate["discoveredAt"], "2026-11-08T08:00:00Z")
        self.assertNotIn("publishedAt", candidate)
        self.assertNotIn("publishedAtSource", candidate)
        self.assertIsNone(provenance["publishedAt"])

    def test_collector_rejects_non_xml_content_type_and_response_cap(self) -> None:
        with fixture_server() as base:
            with self.assertRaisesRegex(FeedError, "content type"):
                fetch_feed(f"{base}/bad-type", timeout=1, max_bytes=1024, allow_private=True)
            with self.assertRaisesRegex(FeedError, "byte cap"):
                fetch_feed(f"{base}/large", timeout=1, max_bytes=128, allow_private=True)

    def test_collector_uses_explicit_timeout(self) -> None:
        with fixture_server() as base:
            with self.assertRaisesRegex(FeedError, "timed out"):
                fetch_feed(f"{base}/slow", timeout=0.03, max_bytes=1024, allow_private=True)

    def test_collector_rejects_multicast_and_disallowed_destinations(self) -> None:
        for multicast in ("http://224.0.0.1/rss", "http://[ff02::1]/rss"):
            with self.subTest(multicast=multicast):
                with self.assertRaisesRegex(FeedError, "disallowed address"):
                    fetch_feed(multicast, timeout=1, max_bytes=2048)
                with self.assertRaisesRegex(FeedError, "disallowed address"):
                    fetch_feed(multicast, timeout=1, max_bytes=2048, allow_private=True)

        for disallowed in (
            "http://127.0.0.1/rss",
            "http://[::1]/rss",
            "http://10.0.0.1/rss",
            "http://192.168.1.1/rss",
            "http://169.254.1.1/rss",
            "http://0.0.0.0/rss",
            "http://240.0.0.1/rss",
        ):
            with self.subTest(disallowed=disallowed):
                with self.assertRaisesRegex(FeedError, "disallowed address"):
                    fetch_feed(disallowed, timeout=1, max_bytes=2048)

    def test_collector_rejects_multicast_redirect(self) -> None:
        class RedirectHandler(BaseHTTPRequestHandler):
            destination = ""

            def log_message(self, format: str, *args: object) -> None:
                pass

            def do_GET(self) -> None:
                self.send_response(302)
                self.send_header("Location", type(self).destination)
                self.end_headers()

        for target in ("http://224.0.0.1/rss", "http://[ff02::1]/rss"):
            with self.subTest(target=target):
                RedirectHandler.destination = target
                with handler_server(RedirectHandler) as redirect:
                    with self.assertRaisesRegex(FeedError, "disallowed address"):
                        fetch_feed(f"{redirect}/start", timeout=1, max_bytes=2048, allow_private=True)

    def test_collector_dials_validated_address_and_preserves_host_header(self) -> None:
        class RedirectHandler(BaseHTTPRequestHandler):
            destination = ""

            def log_message(self, format: str, *args: object) -> None:
                pass

            def do_GET(self) -> None:
                self.send_response(302)
                self.send_header("Location", type(self).destination)
                self.end_headers()

        with fixture_server() as destination:
            dest_port = int(destination.split(":")[-1])
            RedirectHandler.destination = f"http://destination.radar.test:{dest_port}/rss"
            with handler_server(RedirectHandler) as redirect:
                redir_port = int(redirect.split(":")[-1])
                initial = f"http://initial.radar.test:{redir_port}/start"

                def resolver(host: str, port: int, *args: Any, **kwargs: Any) -> Any:
                    if host in ("initial.radar.test", "destination.radar.test"):
                        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port))]
                    return socket.getaddrinfo(host, port, *args, **kwargs)

                dialed: list[tuple[object, ...]] = []
                original_create_connection = socket.create_connection

                def spying_create_connection(address: tuple[str, int], *args: Any, **kwargs: Any) -> socket.socket:
                    dialed.append(address)
                    return original_create_connection(address, *args, **kwargs)

                with mock.patch("socket.create_connection", side_effect=spying_create_connection):
                    body, content_type = fetch_feed(
                        initial,
                        timeout=1,
                        max_bytes=2048,
                        allow_private=True,
                        resolver=resolver,
                    )

                self.assertEqual(dialed, [("127.0.0.1", redir_port), ("127.0.0.1", dest_port)])
                self.assertIn(b"Rilis RSS", body)
                self.assertEqual(content_type.split(";", 1)[0], "application/rss+xml")

    def test_collector_rejects_excessive_feed_redirects(self) -> None:
        class LoopHandler(BaseHTTPRequestHandler):
            def log_message(self, format: str, *args: object) -> None:
                pass

            def do_GET(self) -> None:
                self.send_response(302)
                self.send_header("Location", "/loop")
                self.end_headers()

        with handler_server(LoopHandler) as base:
            with self.assertRaisesRegex(FeedError, "too many redirects"):
                fetch_feed(f"{base}/loop", timeout=1, max_bytes=2048, allow_private=True, max_redirects=2)

    def test_collector_canonicalizes_only_http_urls(self) -> None:
        self.assertEqual(
            canonical_url("HTTPS://Example.COM:443/a/../news/?b=2&utm_source=x&a=1#frag"),
            "https://example.com/news?a=1&b=2",
        )
        for invalid in ("javascript:alert(1)", "ftp://example.com/x", "https://user:pass@example.com/x", "not-a-url"):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                canonical_url(invalid)

    def test_collector_rejects_future_timestamp_and_collapses_duplicates(self) -> None:
        body = rss(
            rss_item("Pertama", "https://example.com/news?utm_source=a"),
            rss_item("Duplikat", "https://EXAMPLE.com/news/#top"),
            rss_item("Masa depan", "https://example.com/future", FUTURE_RFC),
        )
        entries = parse_feed(body, "application/rss+xml", NOW)

        self.assertEqual([entry.title for entry in entries], ["Pertama"])
        self.assertEqual(entries[0].url, "https://example.com/news")

    def test_collector_ignores_entries_older_than_26_hour_fetch_window(self) -> None:
        old = "Sat, 07 Nov 2026 05:59:59 GMT"
        entries = parse_feed(rss(rss_item("Lama", "https://example.com/old", old)), "application/rss+xml", NOW)
        self.assertEqual(entries, [])

    def test_collector_isolates_timeout_and_ingest_failures_per_source(self) -> None:
        with fixture_server() as base:
            sources = [
                {"id": "slow", "name": "Slow", "feedUrl": f"{base}/slow", "enabled": True, "niches": ["technology"]},
                {"id": "rss", "name": "RSS", "feedUrl": f"{base}/rss", "enabled": True, "niches": ["technology"]},
                {"id": "atom", "name": "Atom", "feedUrl": f"{base}/atom", "enabled": True, "niches": ["ai"]},
            ]
            api = FakeApi(sources, fail_ingest_url="https://example.com/atom")
            result = Collector(api, timeout=0.03, max_bytes=2048, now=lambda: NOW, fetcher=fetch_test_feed).run()

        self.assertEqual(result.fetched, 2)
        self.assertEqual(result.created, 1)
        self.assertEqual(len(result.errors), 2)
        self.assertEqual(len(api.payloads), 2)
        self.assertEqual([event[1]["status"] for event in api.events if event[0] == "update"], ["running", "succeeded"])

    def test_collector_sends_normalized_evidence_without_tier_or_owner_mutation(self) -> None:
        with fixture_server() as base:
            source = {
                "id": "rss",
                "domain": "registry.example",
                "name": "Example",
                "tier": "A",
                "kind": "official",
                "feedUrl": f"{base}/rss",
                "enabled": True,
                "niches": ["technology"],
            }
            api = FakeApi([source])
            Collector(api, timeout=1, max_bytes=2048, now=lambda: NOW, fetcher=fetch_test_feed).run()

        payload = api.payloads[0]
        self.assertNotIn("tier", payload.get("source", {}))
        self.assertNotIn("kind", payload.get("source", {}))
        candidate = dict(payload["candidate"])
        self.assertEqual(candidate["canonicalUrl"], "https://example.com/news")
        self.assertEqual(candidate["sourceDomain"], "registry.example")
        self.assertEqual(candidate["publishedAtSource"], "feed")
        self.assertEqual(candidate["niche"], "technology")
        provenance = dict(payload["provenance"][0])
        self.assertEqual(provenance["relation"], "primary")
        self.assertEqual(provenance["domain"], "registry.example")

    def test_collector_api_rejects_cross_origin_redirect_without_forwarding_token(self) -> None:
        class CaptureHandler(BaseHTTPRequestHandler):
            authorization: str | None = None

            def log_message(self, format: str, *args: object) -> None:
                pass

            def do_POST(self) -> None:
                type(self).authorization = self.headers.get("Authorization")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"run":{"id":"stolen"}}')

        class RedirectHandler(BaseHTTPRequestHandler):
            destination = ""

            def log_message(self, format: str, *args: object) -> None:
                pass

            def do_POST(self) -> None:
                self.send_response(307)
                self.send_header("Location", type(self).destination)
                self.end_headers()

        CaptureHandler.authorization = None
        with handler_server(CaptureHandler) as capture:
            RedirectHandler.destination = f"{capture}/capture"
            with handler_server(RedirectHandler) as redirect:
                client = ApiClient(redirect, FixtureHandler.token, "ws-a", timeout=1, max_bytes=2048)
                with self.assertRaises(ApiError):
                    client.create_run("collector")

        self.assertIsNone(CaptureHandler.authorization)

    def test_collector_api_uses_bearer_auth_workspace_and_never_logs_secret(self) -> None:
        secret = FixtureHandler.token
        with fixture_server() as base:
            client = ApiClient(base, secret, "ws-a", timeout=1, max_bytes=2048)
            stream = io.StringIO()
            with contextlib.redirect_stdout(stream), contextlib.redirect_stderr(stream):
                run = client.create_run("collector")
                client.update_run(str(run["id"]), status="running")
                client.list_sources()

        self.assertTrue(FixtureHandler.calls)
        self.assertTrue(all(call["authorization"] == f"Bearer {secret}" for call in FixtureHandler.calls))
        post_bodies = [call["body"] for call in FixtureHandler.calls if call["body"] is not None]
        self.assertTrue(all(dict(body)["workspaceId"] == "ws-a" for body in post_bodies))
        self.assertNotIn(secret, stream.getvalue())
        self.assertNotIn(secret, repr(client))

    def test_collector_run_lifecycle_marks_uncaught_failure_failed(self) -> None:
        class BrokenApi(FakeApi):
            def list_sources(self) -> list[dict[str, object]]:
                raise RuntimeError("registry unavailable")

        api = BrokenApi([])
        with self.assertRaisesRegex(RuntimeError, "registry unavailable"):
            Collector(api, timeout=1, max_bytes=2048, now=lambda: NOW, fetcher=fetch_test_feed).run()

        updates = [event[1] for event in api.events if event[0] == "update"]
        self.assertEqual([update["status"] for update in updates], ["running", "failed"])
        self.assertNotIn("token", json.dumps(updates))

    def test_collector_run_lifecycle_marks_failed_when_running_transition_fails(self) -> None:
        class FirstUpdateFailsApi(FakeApi):
            def __init__(self) -> None:
                super().__init__([])
                self.update_attempts = 0

            def update_run(self, run_id: str, **fields: object) -> dict[str, object]:
                self.update_attempts += 1
                self.events.append(("update", {"runId": run_id, **fields}))
                if self.update_attempts == 1:
                    raise RuntimeError("running transition failed")
                return {"id": run_id, "status": fields.get("status")}

        api = FirstUpdateFailsApi()
        with self.assertRaisesRegex(RuntimeError, "running transition failed"):
            Collector(api, timeout=1, max_bytes=2048, now=lambda: NOW, fetcher=fetch_test_feed).run()

        updates = [event[1] for event in api.events if event[0] == "update"]
        self.assertEqual([update["status"] for update in updates], ["running", "failed"])
        self.assertEqual(api.update_attempts, 2)

    def test_collector_loads_protected_local_config_and_rejects_open_permissions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "radar.json"
            config.write_text(json.dumps({"apiBaseUrl": "https://radar.example", "apiToken": "sekret", "workspaceId": "ws-a"}))
            config.chmod(0o600)
            loaded = load_config({}, config)
            self.assertEqual((loaded.api_base_url, loaded.workspace_id), ("https://radar.example", "ws-a"))
            config.chmod(0o644)
            with self.assertRaises(ConfigError):
                load_config({}, config)

    def test_collector_rejects_api_base_url_with_path_query_or_fragment(self) -> None:
        for base_url in (
            "https://radar.example/base",
            "https://radar.example/?mode=test",
            "https://radar.example/#section",
        ):
            with self.subTest(base_url=base_url), tempfile.TemporaryDirectory() as directory:
                config = Path(directory) / "radar.json"
                config.write_text(
                    json.dumps({"apiBaseUrl": base_url, "apiToken": "sekret", "workspaceId": "ws-a"})
                )
                config.chmod(0o600)
                with self.assertRaisesRegex(ConfigError, "origin"):
                    load_config({}, config)

    def test_collector_caps_error_examples_and_reports_total(self) -> None:
        source = {
            "id": "many-errors",
            "feedUrl": "https://feeds.example.com/rss",
            "enabled": True,
            "niches": ["technology"],
        }
        body = rss(
            *(rss_item(f"Item {index}", f"https://example.com/{index}") for index in range(ERROR_EXAMPLE_LIMIT + 3))
        )
        api = FakeApi([source])
        api.fail_ingest_url = "all"

        def fail_all(payload: dict[str, object]) -> dict[str, object]:
            api.payloads.append(payload)
            raise RuntimeError("ingest ditolak")

        api.ingest = fail_all  # type: ignore[method-assign]
        result = Collector(
            api,
            timeout=1,
            max_bytes=8192,
            now=lambda: NOW,
            fetcher=lambda *args, **kwargs: (body, "application/rss+xml"),
        ).run()

        self.assertEqual(result.error_count, ERROR_EXAMPLE_LIMIT + 3)
        self.assertEqual(len(result.errors), ERROR_EXAMPLE_LIMIT)
        output = result.output()
        self.assertEqual(output["errorCount"], ERROR_EXAMPLE_LIMIT + 3)
        self.assertEqual(output["errorsTruncated"], 3)
        terminal_update = [event[1] for event in api.events if event[0] == "update"][-1]
        self.assertEqual(terminal_update["meta"]["errorCount"], ERROR_EXAMPLE_LIMIT + 3)
        self.assertEqual(terminal_update["meta"]["errorsTruncated"], 3)

    def test_collector_file_lock_prevents_local_overlap(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "collector.lock"
            with FileLock(path):
                with self.assertRaises(BlockingIOError):
                    with FileLock(path):
                        pass

    def test_collector_discovery_is_agent_cron_only_and_persists_raw_evidence_first(self) -> None:
        evidence = b'[{"url":"https://new.example/story","title":"Raw","publishedAt":"2026-11-08T07:00:00Z"}]'
        with tempfile.TemporaryDirectory() as directory:
            task_dir = Path(directory)
            with self.assertRaisesRegex(RuntimeError, "agent cron"):
                persist_discovery_evidence(evidence, task_dir, agent_cron=False, now=NOW)
            stored = persist_discovery_evidence(evidence, task_dir, agent_cron=True, now=NOW)
            self.assertEqual(stored.read_bytes(), evidence)
            self.assertEqual(stored.parent, task_dir)

            api = FakeApi([])
            accepted = accept_discovery_evidence(evidence, api, task_dir, agent_cron=True, now=NOW)
            self.assertEqual(accepted.created, 1)
            candidate = dict(api.payloads[0]["candidate"])
            self.assertEqual(candidate["canonicalUrl"], "https://new.example/story")
            self.assertEqual(candidate["publishedAtSource"], "discovered")
            self.assertEqual(accepted.evidence_path.read_bytes(), evidence)

    def test_collector_discovery_rejects_invalid_or_future_evidence_after_persisting_raw(self) -> None:
        evidence = json.dumps(
            [
                {"url": "javascript:alert(1)", "title": "Bad", "niche": "ai"},
                {"url": "https://new.example/future", "title": "Future", "publishedAt": "2026-11-08T09:00:01Z"},
            ]
        ).encode()
        with tempfile.TemporaryDirectory() as directory:
            api = FakeApi([])
            accepted = accept_discovery_evidence(evidence, api, Path(directory), agent_cron=True, now=NOW)
            self.assertEqual(accepted.created, 0)
            self.assertEqual(len(accepted.errors), 2)
            self.assertEqual(accepted.evidence_path.read_bytes(), evidence)

    def test_collector_reingest_is_not_reported_as_material_update(self) -> None:
        class ExistingApi(FakeApi):
            def ingest(self, payload: dict[str, object]) -> dict[str, object]:
                self.payloads.append(payload)
                return {"created": False, "candidateId": "candidate-existing"}

        with fixture_server() as base:
            api = ExistingApi(
                [{"id": "rss", "feedUrl": f"{base}/rss", "enabled": True, "niches": ["technology"]}]
            )
            result = Collector(api, timeout=1, max_bytes=2048, now=lambda: NOW, fetcher=fetch_test_feed).run()
        self.assertEqual(result.updated, 0)
        self.assertIsNone(result.output())

    def test_collector_stdout_contract_is_empty_without_changes(self) -> None:
        api = FakeApi([])
        stream = io.StringIO()
        with contextlib.redirect_stdout(stream):
            result = Collector(api, timeout=1, max_bytes=2048, now=lambda: NOW, fetcher=fetch_test_feed).run()
        self.assertEqual(result.created, 0)
        self.assertEqual(stream.getvalue(), "")


if __name__ == "__main__":
    unittest.main()
