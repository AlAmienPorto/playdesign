"""Shared configuration, HTTP API, and locking for Content Radar jobs."""

from __future__ import annotations

import fcntl
import json
import os
import stat
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping

DEFAULT_CONFIG_PATH = Path.home() / ".config" / "playdesign" / "content-radar.json"
DEFAULT_API_TIMEOUT = 15.0
DEFAULT_API_MAX_BYTES = 1_048_576


class ConfigError(RuntimeError):
    pass


class ApiError(RuntimeError):
    def __init__(self, method: str, path: str, status: int | None, detail: str) -> None:
        self.method = method
        self.path = path
        self.status = status
        super().__init__(f"{method} {path} failed ({status or 'network'}): {detail}")


@dataclass(frozen=True)
class RadarConfig:
    api_base_url: str
    api_token: str = field(repr=False)
    workspace_id: str


def _read_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    mode = stat.S_IMODE(path.stat().st_mode)
    if mode & 0o077:
        raise ConfigError(f"Content Radar config must not be accessible by group or others: {path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ConfigError(f"Cannot read Content Radar config {path}: {error}") from error
    if not isinstance(value, dict):
        raise ConfigError(f"Content Radar config must be a JSON object: {path}")
    return value


def load_config(
    environ: Mapping[str, str] | None = None,
    path: Path | None = None,
) -> RadarConfig:
    env = os.environ if environ is None else environ
    configured_path = path
    if configured_path is None:
        configured_path = Path(env.get("RADAR_CONFIG", str(DEFAULT_CONFIG_PATH))).expanduser()
    local = _read_config(configured_path)
    api_base_url = (env.get("RADAR_API_BASE_URL") or local.get("apiBaseUrl") or "").strip().rstrip("/")
    api_token = (env.get("RADAR_API_TOKEN") or local.get("apiToken") or "").strip()
    workspace_id = (env.get("RADAR_WORKSPACE_ID") or local.get("workspaceId") or "").strip()
    missing = [
        name
        for name, value in (
            ("RADAR_API_BASE_URL", api_base_url),
            ("RADAR_API_TOKEN", api_token),
            ("RADAR_WORKSPACE_ID", workspace_id),
        )
        if not value
    ]
    if missing:
        raise ConfigError("Missing Content Radar configuration: " + ", ".join(missing))
    parsed = urllib.parse.urlsplit(api_base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ConfigError("RADAR_API_BASE_URL must be a canonical HTTP(S) origin")
    return RadarConfig(api_base_url=api_base_url, api_token=api_token, workspace_id=workspace_id)


class FileLock:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._handle: Any = None

    def __enter__(self) -> "FileLock":
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        self._handle = self.path.open("a+", encoding="utf-8")
        try:
            fcntl.flock(self._handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self._handle.close()
            self._handle = None
            raise
        self._handle.seek(0)
        self._handle.truncate()
        self._handle.write(str(os.getpid()))
        self._handle.flush()
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        if self._handle is not None:
            fcntl.flock(self._handle.fileno(), fcntl.LOCK_UN)
            self._handle.close()
            self._handle = None


class ApiClient:
    def __init__(
        self,
        base_url: str,
        token: str,
        workspace_id: str,
        *,
        timeout: float = DEFAULT_API_TIMEOUT,
        max_bytes: int = DEFAULT_API_MAX_BYTES,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._token = token
        self.workspace_id = workspace_id
        self.timeout = timeout
        self.max_bytes = max_bytes

    def _request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        data = None if body is None else json.dumps(body, separators=(",", ":")).encode("utf-8")
        request = urllib.request.Request(
            self.base_url + path,
            data=data,
            method=method,
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {self._token}",
                **({"Content-Type": "application/json"} if data is not None else {}),
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                payload = response.read(self.max_bytes + 1)
                if len(payload) > self.max_bytes:
                    raise ApiError(method, path, response.status, "response exceeded byte cap")
                content_type = response.headers.get_content_type()
                if content_type != "application/json":
                    raise ApiError(method, path, response.status, f"unexpected content type {content_type}")
                value = json.loads(payload)
        except ApiError:
            raise
        except urllib.error.HTTPError as error:
            detail = f"HTTP {error.code}"
            try:
                payload = error.read(self.max_bytes + 1)
                value = json.loads(payload)
                api_error = value.get("error") if isinstance(value, dict) else None
                if isinstance(api_error, dict):
                    detail = str(api_error.get("code") or api_error.get("message") or detail)
            except (OSError, ValueError, TypeError):
                pass
            raise ApiError(method, path, error.code, detail) from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise ApiError(method, path, None, type(error).__name__) from error
        except json.JSONDecodeError as error:
            raise ApiError(method, path, None, "invalid JSON response") from error
        if not isinstance(value, dict):
            raise ApiError(method, path, None, "JSON response is not an object")
        return value

    def create_run(self, kind: str, meta: dict[str, object] | None = None) -> dict[str, Any]:
        response = self._request(
            "POST",
            "/api/content-radar/runs",
            {"workspaceId": self.workspace_id, "kind": kind, "meta": meta or {}},
        )
        run = response.get("run")
        if not isinstance(run, dict) or not run.get("id"):
            raise ApiError("POST", "/api/content-radar/runs", None, "missing run")
        return run

    def update_run(self, run_id: str, **fields: object) -> dict[str, Any]:
        path = f"/api/content-radar/runs/{urllib.parse.quote(run_id, safe='')}"
        response = self._request("POST", path, {"workspaceId": self.workspace_id, **fields})
        run = response.get("run")
        if not isinstance(run, dict):
            raise ApiError("POST", path, None, "missing run")
        return run

    def list_sources(self) -> list[dict[str, Any]]:
        sources: list[dict[str, Any]] = []
        offset = 0
        while True:
            query = urllib.parse.urlencode(
                {"workspace": self.workspace_id, "enabled": "true", "limit": 200, "offset": offset}
            )
            response = self._request("GET", f"/api/content-radar/sources?{query}")
            page = response.get("sources")
            pagination = response.get("pagination")
            if not isinstance(page, list) or not all(isinstance(item, dict) for item in page):
                raise ApiError("GET", "/api/content-radar/sources", None, "invalid source page")
            sources.extend(page)
            if not isinstance(pagination, dict) or not pagination.get("hasMore"):
                return sources
            offset += len(page)
            if not page:
                raise ApiError("GET", "/api/content-radar/sources", None, "empty paginated source page")

    def ingest(self, payload: dict[str, object]) -> dict[str, Any]:
        return self._request(
            "POST",
            "/api/content-radar/candidates:ingest",
            {"workspaceId": self.workspace_id, **payload},
        )
