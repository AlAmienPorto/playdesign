#!/usr/bin/env python3
"""Tes klien Tebar MCP tanpa jaringan: server JSON-RPC palsu di localhost."""

from __future__ import annotations

import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import tebar_mcp  # noqa: E402

UPLOAD_HINT = (
    "Upload link ready until 2026-11-07T18:27:23.543Z. Run this once per file.\n\n"
    'curl -sS -X POST "http://127.0.0.1:{port}/media-upload/file" '
    '-H "X-Upload-Ticket: tb_up_TESTTICKET" -H "Content-Type: application/octet-stream" '
    "--data-binary @/path/to/file.jpg"
)

STATE: dict[str, object] = {"calls": [], "upload": b""}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # senyap
        return

    def _send(self, payload: dict | bytes, status: int = 200) -> None:
        body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length)
        if self.path.startswith("/media-upload/file"):
            STATE["upload"] = raw
            STATE["ticket"] = self.headers.get("X-Upload-Ticket")
            STATE["name_query"] = self.path
            self._send({"id": "media-123", "mime_type": "image/png", "size_bytes": len(raw)})
            return

        msg = json.loads(raw or b"{}")
        method = msg.get("method")
        params = msg.get("params") or {}
        if method == "tools/call":
            name = params.get("name")
            args = params.get("arguments") or {}
            STATE["calls"].append({"name": name, "args": args})  # type: ignore[index]
            if name == "list_accounts":
                text = "- 0028106f-0762-4541-86e4-9346e1ef9e21: instagram @plydsgn (active)"
            elif name == "create_upload_link":
                text = UPLOAD_HINT.format(port=PORT)
            elif name == "create_post":
                text = (
                    "Post febcdcf2-093e-496f-be84-7488d10e61cd (carousel): scheduled "
                    "(scheduled for 2027-01-04T02:00:00.000Z)\n- instagram @plydsgn: pending"
                )
            elif name == "cancel_scheduled_post":
                text = "Post febcdcf2-093e-496f-be84-7488d10e61cd: canceled"
            else:
                self._send({"jsonrpc": "2.0", "id": msg.get("id"), "error": {"message": "unknown tool"}})
                return
            self._send(
                {
                    "jsonrpc": "2.0",
                    "id": msg.get("id"),
                    "result": {"content": [{"type": "text", "text": text}], "isError": False},
                }
            )
            return
        self._send({"jsonrpc": "2.0", "id": msg.get("id"), "error": {"message": "unknown method"}})


server = HTTPServer(("127.0.0.1", 0), Handler)
PORT = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()


def client() -> tebar_mcp.TebarClient:
    return tebar_mcp.TebarClient(
        {"api_key": "tb_test_key", "base_url": f"http://127.0.0.1:{PORT}"},
        opener=lambda req: __import__("urllib.request", fromlist=["urlopen"]).urlopen(req, timeout=10),
    )


def test_unavailable_without_key() -> None:
    ready, reason = tebar_mcp.TebarClient({"base_url": f"http://127.0.0.1:{PORT}"}).available()
    assert ready is False and "api_key" in reason, (ready, reason)


def test_list_accounts_parses_lines() -> None:
    accounts = client().list_accounts()
    assert accounts == [
        {"id": "0028106f-0762-4541-86e4-9346e1ef9e21", "platform": "instagram", "username": "plydsgn"}
    ], accounts


def test_upload_sends_bytes_with_ticket(tmp_path: Path) -> None:
    file = tmp_path / "01-cover.png"
    file.write_bytes(b"\x89PNG\r\n\x1a\nfake")
    media = client().upload_file(file)
    assert media["id"] == "media-123", media
    assert STATE["upload"] == b"\x89PNG\r\n\x1a\nfake", STATE["upload"]
    assert STATE["ticket"] == "tb_up_TESTTICKET", STATE["ticket"]
    assert "name=01-cover.png" in str(STATE["name_query"]), STATE["name_query"]


def test_create_post_returns_id_and_passes_schedule() -> None:
    result = client().create_post(
        account_ids=["0028106f-0762-4541-86e4-9346e1ef9e21"],
        text="caption",
        media_ids=["media-123"],
        scheduled_at="2027-01-04T02:00:00Z",
    )
    assert result["postId"] == "febcdcf2-093e-496f-be84-7488d10e61cd", result
    sent = [c for c in STATE["calls"] if c["name"] == "create_post"][-1]["args"]  # type: ignore[index]
    assert sent["scheduled_at"] == "2027-01-04T02:00:00Z", sent
    assert sent["media_ids"] == ["media-123"], sent


def test_rpc_error_surfaces_message() -> None:
    try:
        client().call_tool("tidak_ada")
    except tebar_mcp.TebarError as exc:
        assert "unknown tool" in str(exc), exc
    else:
        raise AssertionError("harus gagal")


def test_account_for_picks_platform() -> None:
    assert client().account_for("instagram")["username"] == "plydsgn"
    assert client().account_for("threads") is None


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            import inspect
            import tempfile

            if "tmp_path" in inspect.signature(fn).parameters:
                with tempfile.TemporaryDirectory() as tmp:
                    fn(Path(tmp))
            else:
                fn()
            print("ok", name)
    server.shutdown()
    print("semua tes Tebar lulus")
