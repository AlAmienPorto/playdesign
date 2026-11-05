"""Uji jalur Drive API tanpa akun Google sungguhan.

Menjalankan server tiruan yang meniru endpoint yang dipakai `drive_upload.py`
(token, pencarian folder, pembuatan folder, sesi unggah resumable, dan PUT
berkas), lalu memastikan klien berperilaku benar: id diambil dari respons,
folder bertingkat dibuat, duplikat dicegah lewat appProperties, dan 503 diulang.

Jalankan: python3 scripts/tests/test_drive_upload.py
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

STATE = {
    "folders": {},        # path -> id
    "files": {},          # id -> metadata
    "uploads": 0,
    "folder_creates": 0,
    "fail_next_put": 0,
    "job_index": {},      # jobId -> file metadata
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_args):  # senyap
        return

    def _json(self, status: int, payload: dict, headers: dict | None = None):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status: int, message: str):
        self._json(status, {"error": {"code": status, "message": message, "status": "ERROR"}})

    # ---------- token ----------
    def do_POST(self):
        parsed = urllib.parse.urlsplit(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""

        if parsed.path == "/token":
            form = urllib.parse.parse_qs(raw.decode())
            grant = (form.get("grant_type") or [""])[0]
            if grant not in ("refresh_token", "urn:ietf:params:oauth:grant-type:jwt-bearer"):
                return self._error(400, f"grant_type tidak didukung: {grant}")
            if grant == "refresh_token" and (form.get("refresh_token") or [""])[0] != "refresh-ok":
                return self._error(400, "invalid_grant")
            if grant.endswith("jwt-bearer") and not (form.get("assertion") or [""])[0].count(".") == 2:
                return self._error(400, "assertion rusak")
            return self._json(200, {"access_token": "token-uji", "expires_in": 3600, "token_type": "Bearer"})

        if parsed.path == "/drive/v3/files":
            metadata = json.loads(raw.decode() or "{}")
            STATE["folder_creates"] += 1
            folder_id = f"folder-{STATE['folder_creates']}"
            STATE["folders"][metadata.get("name", "")] = folder_id
            return self._json(200, {"id": folder_id})

        if parsed.path == "/upload/drive/v3/files":
            query = urllib.parse.parse_qs(parsed.query)
            assert query.get("uploadType") == ["resumable"], query
            metadata = json.loads(raw.decode() or "{}")
            STATE["pending_metadata"] = metadata
            location = f"http://127.0.0.1:{self.server.server_port}/upload/session/1"
            return self._json(200, {}, {"Location": location})

        return self._error(404, f"POST tidak dikenal: {parsed.path}")

    def do_PUT(self):
        parsed = urllib.parse.urlsplit(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        payload = self.rfile.read(length) if length else b""
        if not parsed.path.startswith("/upload/session/"):
            return self._error(404, "sesi tidak dikenal")
        if STATE["fail_next_put"] > 0:
            STATE["fail_next_put"] -= 1
            return self._error(503, "backendError")
        STATE["uploads"] += 1
        metadata = STATE.get("pending_metadata") or {}
        file_id = f"file-{STATE['uploads']}"
        record = {
            "id": file_id,
            "name": metadata.get("name"),
            "webViewLink": f"https://drive.google.com/file/d/{file_id}/view",
            "size": str(len(payload)),
            "parents": metadata.get("parents") or [],
        }
        STATE["files"][file_id] = record
        job_id = (metadata.get("appProperties") or {}).get("jobId")
        if job_id:
            STATE["job_index"][job_id] = record
        return self._json(200, record)

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path != "/drive/v3/files":
            return self._error(404, "GET tidak dikenal")
        query = urllib.parse.parse_qs(parsed.query).get("q", [""])[0]
        if "appProperties" in query:
            job_id = query.split("value = '")[1].split("'")[0]
            found = STATE["job_index"].get(job_id)
            return self._json(200, {"files": [found] if found else []})
        name = query.split("name = '")[1].split("'")[0]
        folder_id = STATE["folders"].get(name)
        return self._json(200, {"files": [{"id": folder_id, "name": name}] if folder_id else []})


def start_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def main() -> int:
    server = start_server()
    base = f"http://127.0.0.1:{server.server_port}"
    os.environ["PLAYDESIGN_DRIVE_API"] = base
    os.environ["PLAYDESIGN_OAUTH_TOKEN_URL"] = f"{base}/token"

    cfg_dir = Path(tempfile.mkdtemp(prefix="pd-drive-test-"))
    cfg_path = cfg_dir / "drive.json"
    cfg_path.write_text(
        json.dumps(
            {
                "mode": "oauth",
                "client_id": "cid",
                "client_secret": "csecret",
                "refresh_token": "refresh-ok",
                "folder": "Playdesign Video",
            }
        )
    )
    os.environ["PLAYDESIGN_DRIVE_CONFIG"] = str(cfg_path)

    import drive_upload

    checks: list[tuple[str, bool, str]] = []

    def check(label: str, ok: bool, detail: str = ""):
        checks.append((label, ok, detail))
        print(("PASS " if ok else "FAIL ") + label + (f"  [{detail}]" if detail else ""))

    ok, reason = drive_upload.available()
    check("konfigurasi terbaca", ok, reason)

    client = drive_upload.DriveClient()
    check("access token didapat", client.access_token() == "token-uji")

    video = cfg_dir / "contoh.mp4"
    video.write_bytes(b"\x00\x00\x00\x18ftypmp42" + b"x" * 2048)

    folder_id = client.ensure_folder("Playdesign Video/2026-11")
    check("folder bertingkat dibuat", folder_id == "folder-2", folder_id)
    check("folder dipakai ulang (tidak dobel)", client.ensure_folder("Playdesign Video/2026-11") == folder_id)

    STATE["fail_next_put"] = 1
    result = client.upload_file(video, "20261105-uji.mp4", "Playdesign Video/2026-11", job_id="vj-uji-1")
    check("unggah berhasil walau sekali 503", result.get("id") == "file-1", str(result.get("id")))
    check("webViewLink dari respons", "drive.google.com/file/d/file-1" in (result.get("webViewLink") or ""))
    check("folderId ikut dikembalikan", result.get("folderId") == folder_id, str(result.get("folderId")))
    check("appProperties jobId terkirim", (STATE["pending_metadata"].get("appProperties") or {}).get("jobId") == "vj-uji-1")

    before = STATE["uploads"]
    again = client.upload_file(video, "20261105-uji.mp4", "Playdesign Video/2026-11", job_id="vj-uji-1")
    check("render ulang tidak menduplikasi", STATE["uploads"] == before and again.get("reused") is True)

    # service account: JWT harus terbentuk dan ditandatangani
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    sa_cfg = {
        "mode": "service_account",
        "service_account": {"client_email": "sa@contoh.iam.gserviceaccount.com", "private_key": pem},
        "folder": "Playdesign Video",
    }
    sa_client = drive_upload.DriveClient(sa_cfg)
    check("service account dapat token", sa_client.access_token() == "token-uji")

    bad = dict(sa_cfg)
    bad["service_account"] = {"client_email": "sa@contoh", "private_key": "bukan-pem"}
    try:
        drive_upload.DriveClient(bad).access_token()
        check("PEM rusak ditolak", False)
    except Exception as exc:  # noqa: BLE001
        check("PEM rusak ditolak", True, type(exc).__name__)

    server.shutdown()
    failed = [label for label, ok, _ in checks if not ok]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} lulus")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
