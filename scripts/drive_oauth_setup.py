#!/usr/bin/env python3
"""Sekali jalan: hubungkan Google Drive ke mesin ini lewat OAuth.

Dua alur, pilih sesuai tipe OAuth client yang Anda buat di Google Cloud Console:

  --flow device  (default)  client tipe "TVs and Limited Input devices"
                            skrip menampilkan URL + kode 8 huruf

  --flow manual             client tipe "Desktop app"
                            skrip menampilkan URL; setelah Anda menyetujui, browser
                            gagal membuka 127.0.0.1 — salin kode dari address bar
                            lalu tempel ke terminal

Client id/secret TIDAK ditanyakan lewat obrolan: Anda mengetiknya di terminal ini,
atau menaruhnya di env. Hasilnya ~/.config/playdesign/drive.json (chmod 600).

Periksa dulu tanpa menyetujui apa pun:
  python3 drive_oauth_setup.py --client-id XXX.apps.googleusercontent.com --check
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import stat
import sys
import time
import urllib.parse

from drive_upload import DEFAULT_CONFIG, _decode_error, _http

DEVICE_URL = os.environ.get("PLAYDESIGN_DEVICE_URL", "https://oauth2.googleapis.com/device/code")
TOKEN_URL = os.environ.get("PLAYDESIGN_OAUTH_TOKEN_URL", "https://oauth2.googleapis.com/token")
AUTH_URL = os.environ.get("PLAYDESIGN_AUTH_URL", "https://accounts.google.com/o/oauth2/v2/auth")

# drive.file = hanya file/folder yang dibuat aplikasi ini. Scope ini tidak
# tergolong sensitif, jadi aplikasi bisa dipakai tanpa verifikasi Google dan
# refresh token tidak kedaluwarsa 7 hari seperti aplikasi berstatus "Testing".
# "drive" (penuh) bisa dipakai lewat --scope drive, tapi konsekuensinya token
# mati tiap 7 hari selama consent screen masih Testing.
SCOPES = {
    "drive.file": "https://www.googleapis.com/auth/drive.file",
    "drive": "https://www.googleapis.com/auth/drive",
}
CLIENT_ID_SUFFIX = ".apps.googleusercontent.com"
# Port loopback apa saja sah untuk client tipe Desktop app; tidak ada yang
# mendengarkan di sini — itu disengaja, kodenya disalin manual.
MANUAL_REDIRECT = "http://127.0.0.1:53682"


def diagnose_client_id(client_id: str) -> list[str]:
    """Cari kesalahan yang paling sering terjadi sebelum memanggil Google."""
    problems: list[str] = []
    value = client_id.strip()
    if not value:
        return ["client id kosong"]
    if re.fullmatch(r"\d{6,}", value):
        problems.append("ini nomor project, bukan OAuth client id")
    if value.startswith("GOCSPX-"):
        problems.append("ini client SECRET (berawalan GOCSPX-), bukan client id")
    if value.startswith("AIza"):
        problems.append("ini API key, bukan OAuth client id")
    if value.startswith("ya29."):
        problems.append("ini access token, bukan client id")
    if any(c.isspace() for c in value):
        problems.append("ada spasi/baris baru di dalam client id")
    if value != client_id:
        problems.append("ada spasi di awal/akhir (sudah dibuang otomatis)")
    if not value.endswith(CLIENT_ID_SUFFIX):
        problems.append(f"tidak berakhiran {CLIENT_ID_SUFFIX} — kemungkinan terpotong saat menyalin")
    elif not value.split("-", 1)[0].isdigit():
        problems.append("bagian sebelum tanda '-' harus nomor project (angka)")
    return problems


def warn_client_id(client_id: str) -> list[str]:
    """Hal yang mencurigakan tapi TIDAK menghalangi: biar Google yang memutuskan."""
    value = client_id.strip()
    warnings: list[str] = []
    if value.endswith(CLIENT_ID_SUFFIX):
        random_part = value[: -len(CLIENT_ID_SUFFIX)].split("-", 1)[-1]
        if len(random_part) < 20:
            warnings.append(f"bagian acak hanya {len(random_part)} karakter (umumnya ~32) — pastikan tidak terpotong")
        if not re.fullmatch(r"[A-Za-z0-9_-]+", random_part):
            warnings.append("ada karakter tak biasa di bagian acak — pastikan tidak ada karakter tersembunyi")
    return warnings


def explain_oauth_error(status: int, body: bytes, flow: str) -> str:
    """Terjemahkan error OAuth jadi langkah perbaikan, bukan cuma kode."""
    raw = _decode_error(body)
    lines = [f"Google menolak ({status}): {raw}"]
    lowered = raw.lower()
    if "invalid_client" in lowered or status == 401:
        lines += [
            "",
            "Artinya Google tidak mengenali client id itu. Urutan pemeriksaan:",
            "  1. Client id harus dari project yang SAMA dengan tempat Drive API diaktifkan.",
            "  2. Salin ulang dari Credentials → OAuth 2.0 Client IDs; kolomnya panjang,",
            "     sering terpotong saat menyalin. Pastikan berakhiran .apps.googleusercontent.com",
            "  3. Tipe client harus cocok dengan alur:",
            "       TVs and Limited Input devices  ->  --flow device",
            "       Desktop app                    ->  --flow manual",
            "     Client tipe \"Web application\" tidak bisa dipakai di sini.",
            "  4. Kalau client-nya pernah dihapus, buat baru.",
        ]
    elif "unauthorized_client" in lowered:
        lines += [
            "",
            "Client id dikenali, tapi tipenya tidak mendukung alur ini.",
            "  - Buat client tipe \"TVs and Limited Input devices\" lalu pakai --flow device",
            "  - atau client tipe \"Desktop app\" lalu pakai --flow manual",
        ]
    elif "access_denied" in lowered:
        lines += ["", "Persetujuan dibatalkan di browser. Jalankan ulang dan klik Allow."]
    elif "invalid_grant" in lowered:
        lines += ["", "Kode sudah dipakai atau kedaluwarsa. Jalankan ulang skrip ini."]
    elif "admin_policy" in lowered or "org_internal" in lowered:
        lines += [
            "",
            "Akun Anda dibatasi kebijakan organisasi (Workspace).",
            "  - Pakai akun Gmail pribadi, atau",
            "  - minta admin mengizinkan aplikasi ini, atau",
            "  - pakai mode service_account + Shared Drive.",
        ]
    return "\n".join(lines)


def request_device_code(client_id: str, scope: str = "drive.file") -> dict:
    form = urllib.parse.urlencode({"client_id": client_id, "scope": SCOPES[scope]}).encode()
    status, _, body = _http("POST", DEVICE_URL, form, {"Content-Type": "application/x-www-form-urlencoded"})
    if status != 200:
        raise RuntimeError(explain_oauth_error(status, body, "device"))
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
        raise RuntimeError(explain_oauth_error(status, body, "device"))
    raise RuntimeError("kode kedaluwarsa sebelum disetujui; jalankan ulang skrip ini")


def build_auth_url(client_id: str, scope: str = "drive.file") -> str:
    query = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": MANUAL_REDIRECT,
            "response_type": "code",
            "scope": SCOPES[scope],
            "access_type": "offline",
            "prompt": "consent",
        }
    )
    return f"{AUTH_URL}?{query}"


def extract_code(answer: str) -> str:
    """Terima kode mentah atau URL lengkap hasil redirect."""
    text = answer.strip().strip('"').strip("'")
    if "code=" in text:
        query = urllib.parse.urlsplit(text).query or text.split("?", 1)[-1]
        values = urllib.parse.parse_qs(query)
        return (values.get("code") or [""])[0].strip()
    return text


def exchange_code(client_id: str, client_secret: str, code: str) -> dict:
    form = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": MANUAL_REDIRECT,
        }
    ).encode()
    status, _, body = _http("POST", TOKEN_URL, form, {"Content-Type": "application/x-www-form-urlencoded"})
    if status != 200:
        raise RuntimeError(explain_oauth_error(status, body, "manual"))
    return json.loads(body.decode())


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
    parser = argparse.ArgumentParser(description="Hubungkan Google Drive via OAuth.")
    parser.add_argument("--client-id", default=os.environ.get("GOOGLE_CLIENT_ID", ""))
    parser.add_argument("--folder", default=os.environ.get("PLAYDESIGN_DRIVE_FOLDER", "Playdesign Video"))
    parser.add_argument("--out", default=str(DEFAULT_CONFIG))
    parser.add_argument(
        "--flow",
        choices=("device", "manual"),
        default="device",
        help="device = client TV & Limited Input; manual = client Desktop app",
    )
    parser.add_argument(
        "--scope",
        choices=sorted(SCOPES),
        default="drive.file",
        help="drive.file (default, tanpa verifikasi) atau drive (akses penuh)",
    )
    parser.add_argument("--check", action="store_true", help="hanya uji client id, tidak menyetujui apa pun")
    parser.add_argument("--no-verify", action="store_true", help="jangan uji folder setelah token didapat")
    args = parser.parse_args()

    client_id = args.client_id.strip()
    if not client_id:
        client_id = input("OAuth client id: ").strip()

    problems = diagnose_client_id(client_id)
    if problems:
        print("Client id bermasalah:", file=sys.stderr)
        for item in problems:
            print(f"  - {item}", file=sys.stderr)
        print("\nPerbaiki dulu, lalu jalankan lagi.", file=sys.stderr)
        return 2
    for item in warn_client_id(client_id):
        print(f"catatan: {item}", file=sys.stderr)

    if args.check:
        print(f"Client id berbentuk benar ({len(client_id)} karakter). Menguji ke Google...")
        try:
            device = request_device_code(client_id, args.scope)
        except RuntimeError as exc:
            print(f"\n{exc}", file=sys.stderr)
            return 1
        print(
            "Diterima Google. Client ini siap dipakai.\n"
            f"  verification_url: {device.get('verification_url') or device.get('verification_uri')}\n"
            f"  interval        : {device.get('interval')} detik"
        )
        return 0

    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "") or getpass.getpass(
        "OAuth client secret (tidak ditampilkan): "
    ).strip()
    if not client_secret:
        print("client secret wajib diisi.", file=sys.stderr)
        return 2

    try:
        if args.flow == "device":
            device = request_device_code(client_id, args.scope)
            print("\nBuka URL ini di browser, login, lalu masukkan kode di bawah:\n")
            print(f"  URL  : {device.get('verification_url') or device.get('verification_uri')}")
            print(f"  Kode : {device.get('user_code')}")
            print(f"\nMenunggu persetujuan (kedaluwarsa dalam {device.get('expires_in', 1800)} detik)...")
            token = poll_for_token(
                client_id,
                client_secret,
                device["device_code"],
                float(device.get("interval") or 5),
                time.time() + float(device.get("expires_in") or 1800),
            )
        else:
            # Client tipe "TVs and Limited Input" hanya bisa device flow. Kalau
            # device/code menerima client ini, alur manual pasti ditolak Google
            # dengan halaman "Akses diblokir: Permintaan ... tidak valid".
            try:
                request_device_code(client_id, args.scope)
            except RuntimeError as exc:
                if "invalid_client" in str(exc).lower():
                    raise
                # unauthorized_client / invalid_request -> memang bukan tipe TV,
                # lanjutkan alur manual.
            else:
                print(
                    "Client ini menerima device flow, artinya tipenya \"TVs and Limited Input devices\".\n"
                    "Alur manual akan ditolak Google (\"Akses diblokir: Permintaan ... tidak valid\").\n"
                    "Jalankan tanpa --flow manual.",
                    file=sys.stderr,
                )
                return 2

            print("\nBuka URL ini di browser, login, lalu klik Allow:\n")
            print(build_auth_url(client_id, args.scope))
            print(
                "\nBrowser akan gagal membuka 127.0.0.1 — itu wajar."
                "\nSalin seluruh URL dari address bar (atau hanya nilai code=), tempel di bawah."
                "\nKalau yang muncul justru 'Akses diblokir', client Anda bukan tipe Desktop app"
                "\n— pakai client tipe 'TVs and Limited Input devices' dan jalankan tanpa --flow manual."
            )
            answer = input("\nURL/kode: ")
            code = extract_code(answer)
            if not code:
                print("kode kosong.", file=sys.stderr)
                return 2
            token = exchange_code(client_id, client_secret, code)
    except RuntimeError as exc:
        print(f"\n{exc}", file=sys.stderr)
        return 1

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
