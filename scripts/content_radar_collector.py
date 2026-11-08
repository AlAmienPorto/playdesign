#!/usr/bin/env python3
"""Fetch enabled Content Radar feeds and ingest normalized evidence."""

from __future__ import annotations

import argparse
import datetime as dt
import email.utils
import hashlib
import html
import ipaddress
import json
import os
import re
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Protocol

from content_radar_common import ApiClient, ConfigError, FileLock, load_config

UTC = dt.timezone.utc
FETCH_WINDOW = dt.timedelta(hours=26)
FUTURE_SKEW = dt.timedelta(seconds=0)
TRACKING_KEYS = {"fbclid", "gclid", "mc_cid", "mc_eid"}
XML_CONTENT_TYPES = {
    "application/atom+xml",
    "application/rss+xml",
    "application/xml",
    "text/xml",
}
DEFAULT_FEED_TIMEOUT = 12.0
DEFAULT_FEED_MAX_BYTES = 2_097_152
DEFAULT_FEED_MAX_REDIRECTS = 5
ERROR_EXAMPLE_LIMIT = 5
DEFAULT_LOCK_PATH = Path.home() / ".cache" / "playdesign" / "content-radar-collector.lock"
VALID_NICHES = {"ai", "technology", "design", "security", "internet", "crypto"}


class FeedError(RuntimeError):
    pass


class _NoFeedRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> None:
        return None


@dataclass(frozen=True)
class FeedEntry:
    title: str
    url: str
    summary: str
    published_at: str | None


@dataclass
class CollectorResult:
    fetched: int = 0
    created: int = 0
    updated: int = 0
    error_count: int = 0
    errors: list[dict[str, str]] = field(default_factory=list)

    @property
    def errors_truncated(self) -> int:
        return self.error_count - len(self.errors)

    def add_error(self, error: dict[str, str]) -> None:
        self.error_count += 1
        if len(self.errors) < ERROR_EXAMPLE_LIMIT:
            self.errors.append(error)

    def error_meta(self) -> dict[str, object]:
        return {
            "sourceErrors": self.errors,
            "errorCount": self.error_count,
            "errorsTruncated": self.errors_truncated,
        }

    def output(self) -> dict[str, object] | None:
        if not self.created and not self.updated and not self.error_count:
            return None
        return {
            "fetched": self.fetched,
            "new": self.created,
            "updated": self.updated,
            "errorCount": self.error_count,
            "errorsTruncated": self.errors_truncated,
            "errors": self.errors,
        }


@dataclass
class DiscoveryResult:
    evidence_path: Path
    created: int = 0
    updated: int = 0
    errors: list[dict[str, str]] = field(default_factory=list)


class RadarApi(Protocol):
    def create_run(self, kind: str, meta: dict[str, object] | None = None) -> dict[str, object]: ...
    def update_run(self, run_id: str, **fields: object) -> dict[str, object]: ...
    def list_sources(self) -> list[dict[str, object]]: ...
    def ingest(self, payload: dict[str, object]) -> dict[str, object]: ...


def utc_now() -> dt.datetime:
    return dt.datetime.now(UTC)


def canonical_url(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("URL must be text")
    parsed = urllib.parse.urlsplit(value.strip())
    scheme = parsed.scheme.lower()
    if scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("URL must be canonical HTTP(S)")
    try:
        port = parsed.port
    except ValueError as error:
        raise ValueError("invalid URL port") from error
    host = parsed.hostname.lower().rstrip(".")
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    default_port = port is None or (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
    netloc = host if default_port else f"{host}:{port}"
    raw_path = parsed.path or "/"
    segments: list[str] = []
    for segment in raw_path.split("/"):
        if segment in {"", "."}:
            continue
        if segment == "..":
            if segments:
                segments.pop()
            continue
        decoded = urllib.parse.unquote(segment)
        segments.append(urllib.parse.quote(decoded, safe="!$&'()*+,;=:@-._~"))
    path = "/" + "/".join(segments)
    if path != "/":
        path = path.rstrip("/")
    query_pairs = []
    for key, item in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True):
        lowered = key.lower()
        if lowered.startswith("utm_") or lowered in TRACKING_KEYS:
            continue
        query_pairs.append((key, item))
    query_pairs.sort()
    query = urllib.parse.urlencode(query_pairs, doseq=True)
    return urllib.parse.urlunsplit((scheme, netloc, path, query, ""))


def _timestamp(value: str) -> dt.datetime:
    text = value.strip()
    if not text:
        raise ValueError("missing timestamp")
    try:
        parsed = email.utils.parsedate_to_datetime(text)
    except (TypeError, ValueError):
        parsed = None
    if parsed is None:
        try:
            parsed = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("invalid timestamp") from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _iso(value: dt.datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _child(element: ET.Element, *names: str) -> ET.Element | None:
    allowed = set(names)
    for child in element:
        if _local_name(child.tag) in allowed:
            return child
    return None


def _text(element: ET.Element | None) -> str:
    if element is None:
        return ""
    value = "".join(element.itertext())
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def _entry_url(element: ET.Element) -> str:
    links = [child for child in element if _local_name(child.tag) == "link"]
    for link in links:
        href = link.attrib.get("href")
        relation = link.attrib.get("rel", "alternate")
        if href and relation in {"alternate", ""}:
            return href
    for link in links:
        href = link.attrib.get("href")
        if href:
            return href
        text = _text(link)
        if text:
            return text
    return ""


def parse_feed(body: bytes, content_type: str, now: dt.datetime | None = None) -> list[FeedEntry]:
    mime = content_type.split(";", 1)[0].strip().lower()
    if mime not in XML_CONTENT_TYPES and not mime.endswith("+xml"):
        raise FeedError(f"unexpected content type {mime or 'missing'}")
    try:
        root = ET.fromstring(body)
    except ET.ParseError as error:
        raise FeedError("invalid feed XML") from error
    current = (now or utc_now()).astimezone(UTC)
    root_name = _local_name(root.tag)
    if root_name == "rss":
        channel = _child(root, "channel")
        elements = [] if channel is None else [child for child in channel if _local_name(child.tag) == "item"]
    elif root_name == "feed":
        elements = [child for child in root if _local_name(child.tag) == "entry"]
    else:
        raise FeedError(f"unsupported feed root {root_name}")

    entries: list[FeedEntry] = []
    seen: set[str] = set()
    for element in elements:
        title = _text(_child(element, "title"))
        raw_url = _entry_url(element)
        published_text = _text(_child(element, "pubdate", "published", "updated", "date"))
        if not title or not raw_url:
            continue
        try:
            url = canonical_url(raw_url)
            published = _timestamp(published_text) if published_text else None
        except ValueError:
            continue
        if published is not None and (
            published > current + FUTURE_SKEW or published < current - FETCH_WINDOW
        ):
            continue
        if url in seen:
            continue
        seen.add(url)
        summary = _text(_child(element, "description", "summary", "content"))[:2000]
        entries.append(
            FeedEntry(
                title=title[:300],
                url=url,
                summary=summary,
                published_at=_iso(published) if published is not None else None,
            )
        )
    return entries


def _validate_feed_destination(
    target: str,
    *,
    allow_private: bool,
    resolver: Callable[..., Any],
) -> None:
    if allow_private:
        return
    parsed = urllib.parse.urlsplit(target)
    host = parsed.hostname
    if host is None:
        raise FeedError("feed URL has no host")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        addresses = resolver(host, port, type=socket.SOCK_STREAM)
    except OSError as error:
        raise FeedError(f"feed DNS error: {type(error).__name__}") from error
    if not addresses:
        raise FeedError("feed DNS returned no addresses")
    for address in addresses:
        socket_address = address[4]
        if not isinstance(socket_address, tuple) or not socket_address:
            raise FeedError("feed DNS returned an invalid address")
        try:
            ip = ipaddress.ip_address(str(socket_address[0]))
        except ValueError as error:
            raise FeedError("feed DNS returned an invalid address") from error
        if not ip.is_global:
            raise FeedError(f"feed destination resolved to disallowed address {ip}")


def fetch_feed(
    url: str,
    *,
    timeout: float,
    max_bytes: int,
    allow_private: bool = False,
    resolver: Callable[..., Any] = socket.getaddrinfo,
    max_redirects: int = DEFAULT_FEED_MAX_REDIRECTS,
) -> tuple[bytes, str]:
    if not isinstance(max_redirects, int) or isinstance(max_redirects, bool) or max_redirects < 0:
        raise ValueError("max_redirects must be a non-negative integer")
    target = canonical_url(url)
    opener = urllib.request.build_opener(_NoFeedRedirectHandler())
    redirects = 0
    redirect_codes = {301, 302, 303, 307, 308}
    while True:
        _validate_feed_destination(target, allow_private=allow_private, resolver=resolver)
        request = urllib.request.Request(
            target,
            headers={
                "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
                "User-Agent": "PlayDesign-Content-Radar/1.0",
            },
        )
        try:
            with opener.open(request, timeout=timeout) as response:
                content_type = response.headers.get("Content-Type", "")
                mime = content_type.split(";", 1)[0].strip().lower()
                if mime not in XML_CONTENT_TYPES and not mime.endswith("+xml"):
                    raise FeedError(f"unexpected content type {mime or 'missing'}")
                body = response.read(max_bytes + 1)
                if len(body) > max_bytes:
                    raise FeedError("response exceeded byte cap")
                return body, content_type
        except FeedError:
            raise
        except (TimeoutError, socket.timeout) as error:
            raise FeedError("feed request timed out") from error
        except urllib.error.HTTPError as error:
            try:
                if error.code not in redirect_codes:
                    raise FeedError(f"feed HTTP {error.code}") from error
                location = error.headers.get("Location")
                if not location:
                    raise FeedError(f"feed redirect HTTP {error.code} has no location") from error
                if redirects >= max_redirects:
                    raise FeedError("too many redirects") from error
                target = canonical_url(urllib.parse.urljoin(target, location))
                redirects += 1
            except ValueError as redirect_error:
                raise FeedError(f"invalid feed redirect: {redirect_error}") from redirect_error
            finally:
                error.close()
        except urllib.error.URLError as error:
            reason = error.reason
            if isinstance(reason, (TimeoutError, socket.timeout)):
                raise FeedError("feed request timed out") from error
            raise FeedError(f"feed network error: {type(reason).__name__}") from error
        except OSError as error:
            raise FeedError(f"feed network error: {type(error).__name__}") from error


def persist_discovery_evidence(
    evidence: bytes,
    task_dir: Path,
    *,
    agent_cron: bool,
    now: dt.datetime | None = None,
) -> Path:
    if not agent_cron:
        raise RuntimeError("discovery evidence is accepted only from agent cron")
    task_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    stamp = (now or utc_now()).astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")
    digest = hashlib.sha256(evidence).hexdigest()[:12]
    target = task_dir / f"discovery-{stamp}-{digest}.json"
    try:
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        if target.read_bytes() == evidence:
            return target
        raise
    with os.fdopen(fd, "wb") as handle:
        handle.write(evidence)
    return target


def accept_discovery_evidence(
    evidence: bytes,
    api: RadarApi,
    task_dir: Path,
    *,
    agent_cron: bool,
    now: dt.datetime | None = None,
) -> DiscoveryResult:
    current = (now or utc_now()).astimezone(UTC)
    stored = persist_discovery_evidence(evidence, task_dir, agent_cron=agent_cron, now=current)
    result = DiscoveryResult(evidence_path=stored)
    try:
        records = json.loads(evidence)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        result.errors.append({"source": "discovery", "error": f"invalid discovery JSON: {error}"[:300]})
        return result
    if not isinstance(records, list):
        result.errors.append({"source": "discovery", "error": "discovery JSON must be an array"})
        return result
    seen: set[str] = set()
    for index, record in enumerate(records):
        source_name = f"discovery[{index}]"
        if not isinstance(record, dict):
            result.errors.append({"source": source_name, "error": "entry must be an object"})
            continue
        try:
            url = canonical_url(str(record.get("url") or ""))
            title = str(record.get("title") or "").strip()
            if not title:
                raise ValueError("title is required")
            published_value = record.get("publishedAt")
            published = _timestamp(str(published_value)) if published_value else None
            if published is not None and (published > current or published < current - FETCH_WINDOW):
                raise ValueError("timestamp outside the 26-hour fetch window")
            niche = str(record.get("niche") or "technology")
            if niche not in VALID_NICHES:
                raise ValueError("invalid niche")
        except ValueError as error:
            result.errors.append({"source": source_name, "error": str(error)[:300]})
            continue
        if url in seen:
            continue
        seen.add(url)
        domain = urllib.parse.urlsplit(url).hostname
        summary = str(record.get("summary") or record.get("excerpt") or "")[:2000]
        discovered_at = _iso(current)
        candidate: dict[str, object] = {
            "canonicalUrl": url,
            "title": title[:300],
            "summary": summary,
            "discoveredAt": discovered_at,
            "niche": niche,
            "language": str(record.get("language") or "id")[:16],
            "sourceDomain": domain,
        }
        if published is not None:
            candidate["publishedAt"] = _iso(published)
            candidate["publishedAtSource"] = "discovered"
        payload: dict[str, object] = {
            "candidate": candidate,
            "source": {"name": str(record.get("sourceName") or domain or "discovery")[:200], "niches": [niche]},
            "provenance": [
                {
                    "url": url,
                    "relation": "signal",
                    "title": title[:300],
                    "publishedAt": _iso(published) if published is not None else None,
                    "excerpt": summary[:1000] or None,
                }
            ],
        }
        try:
            response = api.ingest(payload)
        except Exception as error:
            result.errors.append({"source": source_name, "error": str(error)[:300]})
            continue
        if response.get("created") is True:
            result.created += 1
        else:
            result.updated += 1
    return result


def _niche(source: dict[str, object]) -> str:
    niches = source.get("niches")
    if isinstance(niches, list):
        for value in niches:
            if isinstance(value, str) and value in VALID_NICHES:
                return value
    return "technology"


def _error(source: dict[str, object], error: Exception) -> dict[str, str]:
    return {
        "source": str(source.get("id") or source.get("domain") or "unknown")[:200],
        "error": str(error)[:300],
    }


class Collector:
    def __init__(
        self,
        api: RadarApi,
        *,
        timeout: float = DEFAULT_FEED_TIMEOUT,
        max_bytes: int = DEFAULT_FEED_MAX_BYTES,
        now: Callable[[], dt.datetime] = utc_now,
        fetcher: Callable[..., tuple[bytes, str]] = fetch_feed,
    ) -> None:
        self.api = api
        self.timeout = timeout
        self.max_bytes = max_bytes
        self.now = now
        self.fetcher = fetcher

    def run(self) -> CollectorResult:
        run = self.api.create_run("collector", {"fetchWindowHours": 26})
        run_id = str(run["id"])
        result = CollectorResult()
        try:
            self.api.update_run(run_id, status="running")
            sources = self.api.list_sources()
            for source in sources:
                feed_url = source.get("feedUrl")
                if source.get("enabled") is False or not isinstance(feed_url, str) or not feed_url:
                    continue
                try:
                    body, content_type = self.fetcher(
                        feed_url,
                        timeout=self.timeout,
                        max_bytes=self.max_bytes,
                    )
                    entries = parse_feed(body, content_type, self.now())
                except Exception as error:
                    result.add_error(_error(source, error))
                    continue
                result.fetched += len(entries)
                for entry in entries:
                    source_domain = str(
                        source.get("domain") or urllib.parse.urlsplit(entry.url).hostname or ""
                    ).lower()
                    candidate: dict[str, object] = {
                        "canonicalUrl": entry.url,
                        "title": entry.title,
                        "summary": entry.summary,
                        "discoveredAt": _iso(self.now()),
                        "niche": _niche(source),
                        "language": "id",
                        "sourceDomain": source_domain,
                    }
                    if entry.published_at is not None:
                        candidate["publishedAt"] = entry.published_at
                        candidate["publishedAtSource"] = "feed"
                    payload: dict[str, object] = {
                        "candidate": candidate,
                        "source": {
                            "name": str(source.get("name") or source.get("domain") or "feed")[:200],
                            "feedUrl": canonical_url(feed_url),
                            "niches": source.get("niches") if isinstance(source.get("niches"), list) else [_niche(source)],
                        },
                        "provenance": [
                            {
                                "url": entry.url,
                                "domain": source_domain,
                                "relation": "primary",
                                "title": entry.title,
                                "publishedAt": entry.published_at,
                                "excerpt": entry.summary[:1000] or None,
                            }
                        ],
                    }
                    try:
                        response = self.api.ingest(payload)
                    except Exception as error:
                        result.add_error(_error(source, error))
                        continue
                    if response.get("created") is True:
                        result.created += 1
            self.api.update_run(
                run_id,
                status="succeeded",
                fetched=result.fetched,
                new=result.created,
                updated=result.updated,
                meta=result.error_meta(),
            )
            return result
        except Exception as error:
            try:
                self.api.update_run(
                    run_id,
                    status="failed",
                    fetched=result.fetched,
                    new=result.created,
                    updated=result.updated,
                    error=str(error)[:2000],
                    meta=result.error_meta(),
                )
            except Exception:
                pass
            raise


def _positive_float(value: str) -> float:
    number = float(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("must be positive")
    return number


def _positive_int(value: str) -> int:
    number = int(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("must be positive")
    return number


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Collect enabled Content Radar RSS/Atom feeds")
    parser.add_argument("--timeout", type=_positive_float, default=DEFAULT_FEED_TIMEOUT)
    parser.add_argument("--max-bytes", type=_positive_int, default=DEFAULT_FEED_MAX_BYTES)
    parser.add_argument("--lock", type=Path, default=DEFAULT_LOCK_PATH)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        config = load_config()
        api = ApiClient(config.api_base_url, config.api_token, config.workspace_id)
        with FileLock(args.lock):
            result = Collector(api, timeout=args.timeout, max_bytes=args.max_bytes).run()
    except BlockingIOError:
        return 0
    except (ConfigError, Exception) as error:
        print(json.dumps({"status": "failed", "error": str(error)[:500]}, separators=(",", ":")), file=sys.stderr)
        return 1
    output = result.output()
    if output is not None:
        print(json.dumps(output, separators=(",", ":"), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
