"""Uji skrip penyambung Drive (device flow) terhadap server tiruan Google.

Memastikan: kode device diminta, polling menunggu `authorization_pending`,
token diterima, drive.json ditulis dengan permission 600, dan folder diverifikasi.

Jalankan: python3 scripts/tests/test_drive_oauth_setup.py
"""

from __future__ import annotations

import json
import os
import stat
import subprocess
import sys
import tempfile
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATE = {"token_polls": 0, "folder_created": 0}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):  # senyap
        return

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        parsed = urllib.parse.urlsplit(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        form = urllib.parse.parse_qs(self.rfile.read(length).decode() if length else "")

        if parsed.path == "/device/code":
            assert form["scope"] == ["https://www.googleapis.com/auth/drive"], form
            return self._json(
                200,
                {
                    "device_code": "dev-123",
                    "user_code": "ABCD-EFGH",
                    "verification_url": "https://www.google.com/device",
                    "expires_in": 60,
                    "interval": 0,
                },
            )

        if parsed.path == "/token":
            grant = (form.get("grant_type") or [""])[0]
            if grant == "refresh_token":
                # dipakai saat verifikasi folder setelah token disimpan
                assert form["refresh_token"] == ["refresh-device"], form
                return self._json(200, {"access_token": "tok-device", "expires_in": 3600})
            STATE["token_polls"] += 1
            if STATE["token_polls"] == 1:
                return self._json(400, {"error": "authorization_pending"})
            assert form["device_code"] == ["dev-123"], form
            return self._json(
                200,
                {"access_token": "tok-device", "refresh_token": "refresh-device", "expires_in": 3600},
            )

        if parsed.path == "/drive/v3/files":
            STATE["folder_created"] += 1
            return self._json(200, {"id": "folder-device-1"})

        return self._json(404, {"error": {"message": "tidak dikenal"}})

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path != "/drive/v3/files":
            return self._json(404, {"error": {"message": "tidak dikenal"}})
        return self._json(200, {"files": []})  # folder belum ada -> dibuat


def main() -> int:
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"

    workdir = Path(tempfile.mkdtemp(prefix="pd-oauth-test-"))
    cfg = workdir / "drive.json"
    env = dict(os.environ)
    env.update(
        {
            "PLAYDESIGN_DEVICE_URL": f"{base}/device/code",
            "PLAYDESIGN_OAUTH_TOKEN_URL": f"{base}/token",
            "PLAYDESIGN_DRIVE_API": base,
            "PLAYDESIGN_DRIVE_CONFIG": str(cfg),
            "GOOGLE_CLIENT_SECRET": "secret-uji",
        }
    )

    proc = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts" / "drive_oauth_setup.py"),
            "--client-id",
            "cid-uji.apps.googleusercontent.com",
            "--out",
            str(cfg),
            "--folder",
            "Playdesign Video",
        ],
        capture_output=True,
        text=True,
        env=env,
        timeout=120,
    )

    checks = []

    def check(label, ok, detail=""):
        checks.append((label, ok))
        print(("PASS " if ok else "FAIL ") + label + (f"  [{detail}]" if detail else ""))

    check("skrip selesai tanpa error", proc.returncode == 0, proc.stderr.strip()[-200:])
    check("kode device ditampilkan", "ABCD-EFGH" in proc.stdout and "google.com/device" in proc.stdout)
    check("polling menunggu persetujuan", STATE["token_polls"] >= 2, str(STATE["token_polls"]))

    data = json.loads(cfg.read_text()) if cfg.exists() else {}
    check("drive.json ditulis", cfg.exists())
    check("mode oauth", data.get("mode") == "oauth")
    check("refresh token tersimpan", data.get("refresh_token") == "refresh-device")
    check("folder tersimpan", data.get("folder") == "Playdesign Video")
    if cfg.exists():
        mode = stat.S_IMODE(cfg.stat().st_mode)
        check("permission 600", mode == 0o600, oct(mode))
    check("folder diverifikasi", STATE["folder_created"] == 1, str(STATE["folder_created"]))

    server.shutdown()
    failed = [label for label, ok in checks if not ok]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} lulus")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
