"""Uji skrip penyambung Drive terhadap server tiruan Google.

Mencakup: pemeriksaan bentuk client id, alur device (TV & Limited Input),
alur manual (Desktop app), mode --check, dan pesan untuk 401 invalid_client.

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
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

CLIENT_ID = "123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com"
BAD_CLIENT_ID = "123456789012-salah.apps.googleusercontent.com"

STATE: dict = {"token_polls": 0, "folder_created": 0, "scope": ""}


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
            if (form.get("client_id") or [""])[0] == BAD_CLIENT_ID:
                return self._json(401, {"error": "invalid_client"})
            STATE["scope"] = (form.get("scope") or [""])[0]
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
                token_value = (form.get("refresh_token") or [""])[0]
                assert token_value.startswith("refresh-"), form
                return self._json(200, {"access_token": "tok-device", "expires_in": 3600})
            if grant == "authorization_code":
                STATE["code"] = (form.get("code") or [""])[0]
                STATE["redirect"] = (form.get("redirect_uri") or [""])[0]
                return self._json(
                    200,
                    {"access_token": "tok-manual", "refresh_token": "refresh-manual", "expires_in": 3600},
                )
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


def run_script(env: dict, args: list[str], stdin: str = "") -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(SCRIPTS / "drive_oauth_setup.py"), *args],
        capture_output=True,
        text=True,
        env=env,
        input=stdin,
        timeout=120,
    )


def main() -> int:
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"

    workdir = Path(tempfile.mkdtemp(prefix="pd-oauth-test-"))
    env = dict(os.environ)
    env.update(
        {
            "PLAYDESIGN_DEVICE_URL": f"{base}/device/code",
            "PLAYDESIGN_OAUTH_TOKEN_URL": f"{base}/token",
            "PLAYDESIGN_AUTH_URL": f"{base}/auth",
            "PLAYDESIGN_DRIVE_API": base,
            "GOOGLE_CLIENT_SECRET": "secret-uji",
        }
    )

    checks: list[tuple[str, bool]] = []

    def check(label, ok, detail=""):
        checks.append((label, ok))
        print(("PASS " if ok else "FAIL ") + label + (f"  [{detail}]" if detail else ""))

    # --- pemeriksaan bentuk client id (tanpa jaringan) ---
    import drive_oauth_setup as setup

    check("client id benar lolos", setup.diagnose_client_id(CLIENT_ID) == [])
    check(
        "client secret ditolak sebagai client id",
        any("SECRET" in p for p in setup.diagnose_client_id("GOCSPX-abc123")),
    )
    check(
        "API key ditolak sebagai client id",
        any("API key" in p for p in setup.diagnose_client_id("AIzaSyABC123")),
    )
    check(
        "nomor project ditolak",
        any("nomor project" in p for p in setup.diagnose_client_id("123456789012")),
    )
    check(
        "client id terpotong terdeteksi",
        any("terpotong" in p for p in setup.diagnose_client_id("123456789012-abc")),
    )
    check("kode mentah diterima", setup.extract_code(" 4/0AX4XfWh  ") == "4/0AX4XfWh")
    check(
        "URL redirect diurai",
        setup.extract_code(f"{setup.MANUAL_REDIRECT}/?code=4%2F0AX4X&scope=drive.file") == "4/0AX4X",
    )

    # --- mode --check ---
    chk = run_script(env, ["--client-id", CLIENT_ID, "--check"])
    check(
        "--check lulus untuk client sah",
        chk.returncode == 0 and "Diterima Google" in chk.stdout,
        chk.stderr.strip()[-120:],
    )

    bad = run_script(env, ["--client-id", BAD_CLIENT_ID, "--check"])
    check("--check gagal untuk client tak dikenal", bad.returncode == 1)
    check("error 401 diterjemahkan", "tidak mengenali client id" in bad.stderr, bad.stderr.strip()[-90:])

    bad_format = run_script(env, ["--client-id", "GOCSPX-rahasia", "--check"])
    check("client secret ditolak sebelum ke Google", bad_format.returncode == 2 and "SECRET" in bad_format.stderr)

    # --- alur device ---
    cfg_device = workdir / "device" / "drive.json"
    env_device = dict(env, PLAYDESIGN_DRIVE_CONFIG=str(cfg_device))
    dev = run_script(env_device, ["--client-id", CLIENT_ID, "--out", str(cfg_device)])
    check("device flow selesai", dev.returncode == 0, dev.stderr.strip()[-160:])
    check("kode device ditampilkan", "ABCD-EFGH" in dev.stdout and "google.com/device" in dev.stdout)
    check("polling menunggu persetujuan", STATE["token_polls"] >= 2, str(STATE["token_polls"]))
    data = json.loads(cfg_device.read_text()) if cfg_device.exists() else {}
    check("refresh token device tersimpan", data.get("refresh_token") == "refresh-device")
    check("scope default drive.file", data.get("scope") == "drive.file", str(data.get("scope")))
    check("scope dikirim ke Google", STATE["scope"].endswith("auth/drive.file"), STATE["scope"])
    if cfg_device.exists():
        check("permission 600", stat.S_IMODE(cfg_device.stat().st_mode) == 0o600)
    check("folder diverifikasi", STATE["folder_created"] >= 1, str(STATE["folder_created"]))

    # --- alur manual (Desktop app) ---
    cfg_manual = workdir / "manual" / "drive.json"
    env_manual = dict(env, PLAYDESIGN_DRIVE_CONFIG=str(cfg_manual))
    man = run_script(
        env_manual,
        ["--client-id", CLIENT_ID, "--flow", "manual", "--out", str(cfg_manual)],
        stdin="http://127.0.0.1:53682/?code=4%2F0AX4XfWh&scope=drive.file\n",
    )
    check("manual flow selesai", man.returncode == 0, man.stderr.strip()[-160:])
    check("URL izin ditampilkan", "/auth?" in man.stdout and "redirect_uri" in man.stdout)
    check("kode dari URL dipakai", STATE.get("code") == "4/0AX4XfWh", str(STATE.get("code")))
    check("redirect_uri loopback", STATE.get("redirect") == setup.MANUAL_REDIRECT, str(STATE.get("redirect")))
    mdata = json.loads(cfg_manual.read_text()) if cfg_manual.exists() else {}
    check("refresh token manual tersimpan", mdata.get("refresh_token") == "refresh-manual")

    server.shutdown()
    failed = [label for label, ok in checks if not ok]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} lulus")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
