"""Unggah video ke Google Drive lewat Drive API v3 — tanpa rclone.

Kenapa tidak pakai rclone: rclone tidak memberi `file_id`; runner lama harus
menebak dengan mencocokkan nama file di folder. Di sini id dan `webViewLink`
datang langsung dari respons Drive, jadi tidak ada tebakan.

Kredensial TIDAK pernah masuk D1, repo, atau argumen command line. Semua dibaca
dari satu file di luar repo:

    ~/.config/playdesign/drive.json   (chmod 600)

Dua bentuk yang didukung:

  OAuth (akun manusia — ini yang disarankan):
  {
    "mode": "oauth",
    "client_id": "....apps.googleusercontent.com",
    "client_secret": "....",
    "refresh_token": "....",
    "folder": "Playdesign Video"
  }

  Service account (butuh Shared Drive — service account punya kuota 0 di My Drive):
  {
    "mode": "service_account",
    "service_account_file": "/home/ubuntu/.config/playdesign/sa.json",
    "folder": "Playdesign Video",
    "shared_drive_id": "0AJ..."
  }

Hanya stdlib + `cryptography` (khusus service account). Endpoint bisa diarahkan
ke server lain lewat PLAYDESIGN_DRIVE_API / PLAYDESIGN_OAUTH_TOKEN_URL, supaya
jalur ini bisa diuji tanpa akun Google sungguhan.
"""

from __future__ import annotations

import base64
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_CONFIG = Path.home() / ".config" / "playdesign" / "drive.json"
TOKEN_URL = os.environ.get("PLAYDESIGN_OAUTH_TOKEN_URL", "https://oauth2.googleapis.com/token")
API_BASE = os.environ.get("PLAYDESIGN_DRIVE_API", "https://www.googleapis.com").rstrip("/")
SCOPE = "https://www.googleapis.com/auth/drive"
FOLDER_MIME = "application/vnd.google-apps.folder"
RETRY_STATUS = {403, 429, 500, 502, 503, 504}


class DriveError(RuntimeError):
    """Kegagalan yang sudah diterjemahkan dari respons Google."""


def config_path() -> Path:
    override = os.environ.get("PLAYDESIGN_DRIVE_CONFIG")
    return Path(override).expanduser() if override else DEFAULT_CONFIG


def load_config() -> dict[str, Any] | None:
    """None kalau file tidak ada atau tidak bisa dibaca — pemanggil lalu jatuh ke rclone."""
    path = config_path()
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DriveError(f"drive.json tidak bisa dibaca: {exc}") from exc
    mode = str(data.get("mode") or "oauth").strip()
    if mode not in ("oauth", "service_account"):
        raise DriveError(f"mode drive.json tidak dikenal: {mode}")
    data["mode"] = mode
    return data


def available() -> tuple[bool, str]:
    try:
        cfg = load_config()
    except DriveError as exc:
        return False, str(exc)
    if not cfg:
        return False, f"{config_path()} belum ada"
    if cfg["mode"] == "oauth":
        missing = [k for k in ("client_id", "client_secret", "refresh_token") if not cfg.get(k)]
        if missing:
            return False, "drive.json kurang: " + ", ".join(missing)
    else:
        if not (cfg.get("service_account_file") or cfg.get("service_account")):
            return False, "drive.json: service_account_file wajib untuk mode service_account"
    return True, ""


def _decode_error(payload: bytes) -> str:
    try:
        body = json.loads(payload.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError):
        return payload.decode("utf-8", "replace")[:300]
    error = body.get("error")
    if isinstance(error, dict):
        message = error.get("message") or error.get("status") or ""
        return str(message)[:300] or json.dumps(error)[:300]
    return str(error or body)[:300]


def _http(
    method: str,
    url: str,
    body: bytes | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 120,
) -> tuple[int, dict[str, str], bytes]:
    request = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers or {}), exc.read()
    except urllib.error.URLError as exc:
        raise DriveError(f"tidak bisa menghubungi {urllib.parse.urlsplit(url).netloc}: {exc.reason}") from exc


def _with_retry(call, what: str, attempts: int = 4):
    """Ulangi 403/429/5xx dengan backoff; Drive sering membalas 403 rate-limit."""
    delay = 1.0
    last = ""
    for attempt in range(1, attempts + 1):
        try:
            return call()
        except DriveError as exc:
            last = str(exc)
            if attempt == attempts:
                break
            time.sleep(delay)
            delay *= 2
    raise DriveError(f"{what} gagal setelah {attempts} percobaan: {last}")


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


class DriveClient:
    def __init__(self, config: dict[str, Any] | None = None):
        cfg = config if config is not None else load_config()
        if not cfg:
            raise DriveError(f"konfigurasi Drive tidak ada di {config_path()}")
        self.cfg: dict[str, Any] = cfg
        self._token: str | None = None
        self._token_expiry = 0.0

    # ---------- kredensial ----------

    def access_token(self) -> str:
        if self._token and time.time() < self._token_expiry - 60:
            return self._token
        if self.cfg["mode"] == "oauth":
            payload = self._oauth_token()
        else:
            payload = self._service_account_token()
        self._token = payload["access_token"]
        self._token_expiry = time.time() + float(payload.get("expires_in") or 3600)
        return self._token

    def _oauth_token(self) -> dict[str, Any]:
        form = urllib.parse.urlencode(
            {
                "grant_type": "refresh_token",
                "client_id": self.cfg["client_id"],
                "client_secret": self.cfg["client_secret"],
                "refresh_token": self.cfg["refresh_token"],
            }
        ).encode()
        status, _, body = _http(
            "POST", TOKEN_URL, form, {"Content-Type": "application/x-www-form-urlencoded"}
        )
        if status != 200:
            raise DriveError(f"refresh token ditolak Google ({status}): {_decode_error(body)}")
        return json.loads(body.decode())

    def _service_account_token(self) -> dict[str, Any]:
        info = self.cfg.get("service_account")
        if not info:
            path = Path(str(self.cfg["service_account_file"])).expanduser()
            try:
                info = json.loads(path.read_text(encoding="utf-8"))
            except OSError as exc:
                raise DriveError(f"service account tidak bisa dibaca: {exc}") from exc
        try:
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import padding, rsa
        except ImportError as exc:  # pragma: no cover - environment dependent
            raise DriveError("butuh paket `cryptography` untuk mode service_account") from exc

        now = int(time.time())
        header = {"alg": "RS256", "typ": "JWT"}
        claims = {
            "iss": info["client_email"],
            "scope": SCOPE,
            "aud": TOKEN_URL,
            "iat": now,
            "exp": now + 3600,
        }
        signing_input = f"{_b64url(json.dumps(header).encode())}.{_b64url(json.dumps(claims).encode())}".encode()
        key = serialization.load_pem_private_key(info["private_key"].encode(), password=None)
        if not isinstance(key, rsa.RSAPrivateKey):
            raise DriveError("private_key di service account bukan kunci RSA")
        signature = key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
        assertion = f"{signing_input.decode()}.{_b64url(signature)}"

        form = urllib.parse.urlencode(
            {"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion}
        ).encode()
        status, _, body = _http(
            "POST", TOKEN_URL, form, {"Content-Type": "application/x-www-form-urlencoded"}
        )
        if status != 200:
            raise DriveError(f"service account ditolak Google ({status}): {_decode_error(body)}")
        return json.loads(body.decode())

    # ---------- REST ----------

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        headers = {"Authorization": f"Bearer {self.access_token()}"}
        headers.update(extra or {})
        return headers

    def _json_call(self, method: str, path: str, params: dict[str, str], body: Any = None) -> dict[str, Any]:
        query = urllib.parse.urlencode({k: v for k, v in params.items() if v})
        url = f"{API_BASE}{path}" + (f"?{query}" if query else "")
        data = json.dumps(body).encode() if body is not None else None
        headers = self._headers({"Content-Type": "application/json; charset=UTF-8"} if data else None)

        def call():
            status, _, payload = _http(method, url, data, headers)
            if status in RETRY_STATUS:
                raise DriveError(f"Drive membalas {status}: {_decode_error(payload)}")
            if status >= 400:
                raise DriveError(f"Drive menolak {method} {path} ({status}): {_decode_error(payload)}")
            return json.loads(payload.decode() or "{}")

        return _with_retry(call, f"{method} {path}")

    def _shared_drive(self) -> dict[str, str]:
        shared = str(self.cfg.get("shared_drive_id") or "").strip()
        if not shared:
            return {}
        return {"supportsAllDrives": "true", "includeItemsFromAllDrives": "true", "corpora": "drive", "driveId": shared}

    def ensure_folder(self, path: str) -> str:
        """Buat/temukan folder bertingkat, mis. "Playdesign Video/2026-11"."""
        parent = str(self.cfg.get("folder_id") or "root")
        for segment in [part.strip() for part in path.split("/") if part.strip()]:
            query = (
                f"name = '{segment}' and mimeType = '{FOLDER_MIME}' and trashed = false "
                f"and '{parent}' in parents"
            )
            params = {"q": query, "fields": "files(id,name)", "pageSize": "10", **self._shared_drive()}
            found = self._json_call("GET", "/drive/v3/files", params).get("files") or []
            if found:
                parent = found[0]["id"]
                continue
            metadata = {"name": segment, "mimeType": FOLDER_MIME, "parents": [parent]}
            if self.cfg.get("shared_drive_id"):
                metadata["driveId"] = self.cfg["shared_drive_id"]
            created = self._json_call(
                "POST", "/drive/v3/files", {"fields": "id", "supportsAllDrives": "true"}, metadata
            )
            parent = created["id"]
        return parent

    def find_by_job(self, job_id: str) -> dict[str, Any] | None:
        """Cegah duplikat: cari file yang sebelumnya dibuat untuk job yang sama."""
        if not job_id:
            return None
        query = f"appProperties has {{ key = 'jobId' and value = '{job_id}' }} and trashed = false"
        params = {"q": query, "fields": "files(id,name,webViewLink,size)", "pageSize": "1", **self._shared_drive()}
        found = self._json_call("GET", "/drive/v3/files", params).get("files") or []
        return found[0] if found else None

    def upload_file(
        self,
        local: Path,
        name: str,
        folder_path: str,
        job_id: str = "",
        mime: str = "video/mp4",
    ) -> dict[str, Any]:
        """Resumable upload; hasilnya berisi id, webViewLink, folderId, size."""
        existing = self.find_by_job(job_id)
        if existing:
            existing.setdefault("folderId", "")
            existing["reused"] = True
            return existing

        folder_id = self.ensure_folder(folder_path)
        size = local.stat().st_size
        metadata: dict[str, Any] = {"name": name, "parents": [folder_id], "mimeType": mime}
        if job_id:
            metadata["appProperties"] = {"jobId": job_id}
        if self.cfg.get("shared_drive_id"):
            metadata["driveId"] = self.cfg["shared_drive_id"]

        params = {
            "uploadType": "resumable",
            "supportsAllDrives": "true",
            "fields": "id,name,webViewLink,size,parents",
        }
        query = urllib.parse.urlencode(params)
        init_url = f"{API_BASE}/upload/drive/v3/files?{query}"
        headers = self._headers(
            {
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": mime,
                "X-Upload-Content-Length": str(size),
            }
        )

        def initiate():
            status, response_headers, payload = _http("POST", init_url, json.dumps(metadata).encode(), headers)
            if status in RETRY_STATUS:
                raise DriveError(f"Drive membalas {status}: {_decode_error(payload)}")
            if status >= 400:
                raise DriveError(f"Drive menolak pembuatan sesi unggah ({status}): {_decode_error(payload)}")
            location = response_headers.get("Location") or response_headers.get("location")
            if not location:
                raise DriveError("Drive tidak memberi URL sesi unggah")
            return location

        session_url = _with_retry(initiate, "inisiasi unggah")

        def push() -> dict[str, Any]:
            with local.open("rb") as handle:
                data = handle.read()
            status, _, payload = _http(
                "PUT",
                session_url,
                data,
                {"Content-Type": mime, "Content-Length": str(len(data))},
                timeout=900,
            )
            if status in (200, 201):
                result = json.loads(payload.decode() or "{}")
                result.setdefault("folderId", folder_id)
                result["size"] = result.get("size") or str(len(data))
                return result
            if status == 308:
                # Sesi masih terbuka (unggahan terputus). Coba sekali lagi penuh.
                raise DriveError("unggahan belum selesai (308), mengulang")
            raise DriveError(f"unggah ditolak ({status}): {_decode_error(payload)}")

        return _with_retry(push, "unggah berkas", attempts=3)


def upload_video(
    local: Path,
    name: str,
    folder_path: str,
    job_id: str = "",
    mime: str = "video/mp4",
) -> dict[str, Any]:
    """Pintu masuk yang dipakai runner."""
    return DriveClient().upload_file(local, name, folder_path, job_id=job_id, mime=mime)
