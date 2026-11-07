#!/usr/bin/env python3
"""Klien Tebar lewat MCP (JSON-RPC over HTTP).

Tebar menyediakan MCP server di https://api.tebar.app/mcp. Runner memakai jalur
yang sama dengan agent, bukan REST kedua: `create_upload_link` -> unggah byte
lokal -> `create_post` dengan `media_ids`.

Kredensial TIDAK pernah ditulis di repo, D1, atau log: dibaca dari
~/.config/playdesign/tebar.json (mode 600) berisi {"api_key": "..."} atau
{"access_token": "..."}. Kalau file tidak ada, integrasi dianggap belum siap dan
runner berhenti dengan pesan jelas (job tetap di antrean).
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable

DEFAULT_CONFIG_PATH = Path.home() / ".config" / "playdesign" / "tebar.json"
DEFAULT_BASE_URL = "https://api.tebar.app"
UPLOAD_HINT = re.compile(r"X-Upload-Ticket:\s*([A-Za-z0-9_\-]+)")
UPLOAD_URL = re.compile(r'curl[^\n]*?"(https?://[^"]+/media-upload/file)"')


class TebarError(RuntimeError):
    """Kegagalan yang bisa ditampilkan apa adanya ke pengguna."""


def config_path() -> Path:
    override = os.environ.get("PLAYDESIGN_TEBAR_CONFIG")
    return Path(override) if override else DEFAULT_CONFIG_PATH


def load_config(path: Path | None = None) -> dict[str, Any]:
    target = path or config_path()
    try:
        raw = json.loads(target.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (OSError, ValueError):
        return {}
    if not isinstance(raw, dict):
        return {}
    return raw


def _token(cfg: dict[str, Any]) -> str:
    return str(cfg.get("api_key") or cfg.get("access_token") or "").strip()


class TebarClient:
    """Pembungkus tipis MCP: satu method per tool yang dipakai runner."""

    def __init__(
        self,
        cfg: dict[str, Any] | None = None,
        *,
        opener: Callable[[urllib.request.Request], Any] | None = None,
    ) -> None:
        self.cfg = cfg if cfg is not None else load_config()
        self.base_url = str(self.cfg.get("base_url") or DEFAULT_BASE_URL).rstrip("/")
        self._token = _token(self.cfg)
        self._opener = opener or (lambda req: urllib.request.urlopen(req, timeout=120))
        self._request_id = 0

    # -- kesiapan ---------------------------------------------------------
    def available(self) -> tuple[bool, str]:
        if not self._token:
            return False, f"Tebar belum terhubung (isi {config_path()} dengan api_key)"
        return True, "siap"

    # -- transport --------------------------------------------------------
    def _post(self, url: str, body: bytes, headers: dict[str, str]) -> tuple[int, str]:
        req = urllib.request.Request(url, data=body, method="POST", headers=headers)
        try:
            with self._opener(req) as resp:
                return int(getattr(resp, "status", 200) or 200), resp.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:400]
            raise TebarError(f"Tebar HTTP {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise TebarError(f"Tebar tidak bisa dihubungi: {exc.reason}") from exc

    @staticmethod
    def _payload(raw: str) -> dict[str, Any]:
        """Respons MCP boleh JSON biasa atau SSE (`event: message` + `data: ...`)."""
        text = raw.strip()
        if text.startswith("event:") or "\ndata:" in text or text.startswith("data:"):
            chunk = text.split("data:", 1)[1].strip()
            text = chunk.split("\n\n", 1)[0].strip()
        try:
            return json.loads(text or "{}")
        except ValueError as exc:
            raise TebarError(f"Respons MCP tidak bisa dibaca: {text[:200]}") from exc

    def _rpc(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        self._request_id += 1
        body = json.dumps(
            {"jsonrpc": "2.0", "id": self._request_id, "method": method, "params": params}
        ).encode()
        headers = {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "User-Agent": "playdesign-carousel-runner/1",
        }
        _, raw = self._post(f"{self.base_url}/mcp", body, headers)
        data = self._payload(raw)
        if "error" in data:
            message = str((data.get("error") or {}).get("message") or data["error"])
            raise TebarError(f"MCP {method} gagal: {message[:300]}")
        return data.get("result") or {}

    def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> str:
        result = self._rpc("tools/call", {"name": name, "arguments": arguments or {}})
        if result.get("isError"):
            texts = [c.get("text", "") for c in result.get("content") or [] if isinstance(c, dict)]
            raise TebarError(f"Tool {name} gagal: {' '.join(texts)[:300]}")
        parts = [c.get("text", "") for c in result.get("content") or [] if isinstance(c, dict)]
        return "\n".join(part for part in parts if part).strip()

    # -- tool ------------------------------------------------------------
    def list_accounts(self) -> list[dict[str, str]]:
        text = self.call_tool("list_accounts")
        accounts: list[dict[str, str]] = []
        for line in text.splitlines():
            match = re.match(r"^-\s*([0-9a-fA-F-]{36}):\s*(\w+)\s+@?([\w.\-]+)", line.strip())
            if match:
                accounts.append(
                    {"id": match.group(1), "platform": match.group(2).lower(), "username": match.group(3)}
                )
        return accounts

    def account_for(self, platform: str, accounts: list[dict[str, str]] | None = None) -> dict[str, str] | None:
        wanted = (platform or "").strip().lower()
        for account in accounts if accounts is not None else self.list_accounts():
            if account["platform"] == wanted:
                return account
        return None

    def upload_file(self, path: Path, *, keep: bool = False) -> dict[str, Any]:
        """Ambil tautan unggah 30 menit, kirim byte berkas, balikan media JSON."""
        hint = self.call_tool("create_upload_link", {"keep": keep})
        url_match = UPLOAD_URL.search(hint)
        ticket_match = UPLOAD_HINT.search(hint)
        if not url_match or not ticket_match:
            raise TebarError("create_upload_link tidak mengembalikan URL/tiket unggah.")
        url = url_match.group(1)
        if "?" not in url:
            url += "?" + urllib.parse.urlencode({"name": path.name})
        payload = Path(path).read_bytes()
        headers = {
            "X-Upload-Ticket": ticket_match.group(1),
            "Content-Type": "application/octet-stream",
            "User-Agent": "playdesign-carousel-runner/1",
        }
        _, raw = self._post(url, payload, headers)
        try:
            media = json.loads(raw)
        except ValueError as exc:
            raise TebarError(f"Unggah media tidak mengembalikan JSON: {raw[:200]}") from exc
        media_id = str((media or {}).get("id") or "")
        if not media_id:
            raise TebarError(f"Unggah media tanpa id: {raw[:200]}")
        return media

    def create_post(
        self,
        *,
        account_ids: list[str],
        text: str,
        media_ids: list[str] | None = None,
        scheduled_at: str | None = None,
        instagram: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        args: dict[str, Any] = {"account_ids": account_ids, "text": text}
        if media_ids:
            args["media_ids"] = media_ids
        if scheduled_at:
            args["scheduled_at"] = scheduled_at
        if instagram:
            args["instagram"] = instagram
        text_out = self.call_tool("create_post", args)
        return {"raw": text_out, "postId": extract_post_id(text_out)}

    def cancel_scheduled_post(self, post_id: str) -> str:
        return self.call_tool("cancel_scheduled_post", {"post_id": post_id})

    def get_post(self, post_id: str) -> str:
        return self.call_tool("get_post", {"post_id": post_id})


def extract_post_id(text: str) -> str | None:
    """Ambil id post dari jawaban Tebar, utamakan pola 'Post <uuid>' di awal baris."""
    pattern = r"(?:^|\n)\s*Post\s+([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\b"
    match = re.search(pattern, text or "")
    if match:
        return match.group(1)
    fallback = re.search(
        r"\b([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\b", text or ""
    )
    return fallback.group(1) if fallback else None
