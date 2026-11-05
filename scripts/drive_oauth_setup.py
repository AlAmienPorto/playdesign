#!/usr/bin/env python3
"""Sekali jalan: hubungkan Google Drive ke mesin ini lewat OAuth device flow.

Cocok untuk mesin tanpa browser (sandbox). Alurnya:

  1. skrip menampilkan URL dan kode 8 huruf
  2. Anda buka URL itu di browser laptop, login, masukkan kode, setujui
  3. skrip menerima refresh token dan menulis ~/.config/playdesign/drive.json (chmod 600)

Client id/secret TIDAK ditanyakan lewat obrolan: Anda mengetiknya di terminal ini,
atau menaruhnya di env. Yang perlu dibuat di Google Cloud Console: OAuth client
tipe "TVs and Limited Input devices" + Drive API diaktifkan.

Contoh:
  python3 scripts/drive_oauth_setup.py --client-id XXX.apps.googleusercontent.com
  # client secret akan diminta (input tersembunyi)

Setelah selesai, runner otomatis memakai Drive API (tidak perlu rclone).
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import stat
import sys
import time
import urllib.parse

from drive_upload import DEFAULT_CONFIG, _decode_error, _http

DEVICE_URL = os.environ.get("PLAYDESIGN_DEVICE_URL", "https://oauth2.googleapis.com/device/code")
TOKEN_URL = os.environ.get("PLAYDESIGN_OAUTH_TOKEN_URL", "https://oauth2.googleapis.com/token")
# drive.file = hanya file/folder yang dibuat aplikasi ini. Scope ini tidak
# tergolong sensitif, jadi aplikasi bisa dipakai tanpa verifikasi Google dan
# refresh token tidak kedaluwarsa 7 hari seperti aplikasi berstatus "Testing".
# "drive" (penuh) bisa dipakai lewat --scope drive, tapi konsekuensinya token
# mati tiap 7 hari selama consent screen masih Testing.
SCOPES = {
    "drive.file": "https://www.googleapis.com/auth/drive.file",
    "drive": "https://www.googleapis.com/auth/drive",
}


def request_device_code(client_id: str, scope: str = "drive.file") -> dict:
    form = urllib.parse.urlencode({"client_id": client_id, "scope": SCOPES[scope]}).encode()
    status, _, body = _http("POST", DEVICE_URL, form, {"Content-Type": "application/x-www-form-urlencoded"})
    if status != 200:
        raise RuntimeError(f"permintaan kode ditolak ({status}): {_decode_error(body)}")
    return json.loads(body.decode())


def poll_for_token(
    client_id: str,
    client_secret: str,
    device_code: str,
    interval: float,
    deadline: float,
) -> dict:
    form_base = {
        "client_id": client_id,
        "client_secret": client_secret,
        "device_code": device_code,
        "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
    }
    while time.time() < deadline:
        time.sleep(interval)
        status, _, body = _http(
            "POST",
            TOKEN_URL,
            urllib.parse.urlencode(form_base).encode(),
            {"Content-Type": "application/x-www-form-urlencoded"},
        )
        payload = json.loads(body.decode() or "{}") if body else {}
        if status == 200:
            return payload
        error = str(payload.get("error") or "")
        if error == "authorization_pending":
            continue
        if error == "slow_down":
            interval += 1
            continue
        raise RuntimeError(f"persetujuan gagal: {error or _decode_error(body)}")
    raise RuntimeError("kode kedaluwarsa sebelum disetujui; jalankan ulang skrip ini")


def write_config(
    path,
    client_id: str,
    client_secret: str,
    refresh_token: str,
    folder: str,
    scope: str = "drive.file",
):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "mode": "oauth",
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
                "scope": scope,
                "folder": folder,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    path.chmod(stat.S_IRUSR | stat.S_IWUSR)  # 600: hanya pemilik
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description="Hubungkan Google Drive via OAuth device flow.")
    parser.add_argument("--client-id", default=os.environ.get("GOOGLE_CLIENT_ID", ""))
    parser.add_argument("--folder", default=os.environ.get("PLAYDESIGN_DRIVE_FOLDER", "Playdesign Video"))
    parser.add_argument("--out", default=str(DEFAULT_CONFIG))
    parser.add_argument(
        "--scope",
        choices=sorted(SCOPES),
        default="drive.file",
        help="drive.file (default, tanpa verifikasi) atau drive (akses penuh)",
    )
    parser.add_argument("--no-verify", action="store_true", help="jangan uji folder setelah token didapat")
    args = parser.parse_args()

    client_id = args.client_id.strip()
    if not client_id:
        client_id = input("OAuth client id: ").strip()
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "") or getpass.getpass("OAuth client secret (tidak ditampilkan): ").strip()
    if not client_id or not client_secret:
        print("client id dan secret wajib diisi.", file=sys.stderr)
        return 2

    device = request_device_code(client_id, args.scope)
    url = device.get("verification_url") or device.get("verification_uri")
    print("\nBuka URL ini di browser, login, lalu masukkan kode di bawah:\n")
    print(f"  URL  : {url}")
    print(f"  Kode : {device.get('user_code')}")
    print(f"\nMenunggu persetujuan (kedaluwarsa dalam {device.get('expires_in', 1800)} detik)...")

    token = poll_for_token(
        client_id,
        client_secret,
        device["device_code"],
        float(device.get("interval") or 5),
        time.time() + float(device.get("expires_in") or 1800),
    )
    refresh_token = token.get("refresh_token")
    if not refresh_token:
        print(
            "Google tidak memberi refresh_token. Cabut akses aplikasi di "
            "https://myaccount.google.com/permissions lalu jalankan ulang.",
            file=sys.stderr,
        )
        return 1

    from pathlib import Path

    path = write_config(Path(args.out), client_id, client_secret, refresh_token, args.folder, args.scope)
    print(f"\nTersimpan: {path} (chmod 600)")

    if not args.no_verify:
        import drive_upload

        client = drive_upload.DriveClient()
        folder_id = client.ensure_folder(args.folder)
        print(f"Folder '{args.folder}' siap, id: {folder_id}")
    print("\nSelesai. Runner akan memakai Drive API pada putaran berikutnya.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
