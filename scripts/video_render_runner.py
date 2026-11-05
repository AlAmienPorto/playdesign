#!/usr/bin/env python3
"""Video render runner.

Alur: ambil job `queued` dari API -> render dengan Remotion CLI di mesin ini ->
unggah hasil ke Google Drive lewat rclone -> catat pointer Drive ke D1 lewat API.
File video TIDAK pernah disimpan di server: satu-satunya salinan sementara ada di
folder temp mesin ini dan dihapus setelah unggahan sukses.

Sengaja senyap kalau tidak ada job (cron no_agent meneruskan stdout ke notifikasi).

Env yang dibaca:
  VIDEO_REMOTE        nama remote rclone (default: gdrive)
  VIDEO_REMOTE_BASE   folder tujuan di remote (default: Playdesign Video)
  REMOTION_DIR        proyek Remotion (default: ~/work/remotion-starter)
  VIDEO_WORKSPACE     workspace CRM (default: playdesign)
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gmaps_lead_scraper import BASE_URL, _headers  # noqa: E402

WORKSPACE = os.environ.get("VIDEO_WORKSPACE", "playdesign")
REMOTE = os.environ.get("VIDEO_REMOTE", "gdrive")
REMOTE_BASE = os.environ.get("VIDEO_REMOTE_BASE", "Playdesign Video")
REMOTION_DIR = Path(os.environ.get("REMOTION_DIR", str(Path.home() / "work" / "remotion-starter")))
RENDER_TIMEOUT = int(os.environ.get("VIDEO_RENDER_TIMEOUT", "1800"))


def api(method: str, path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE_URL}{path}", data=data, method=method, headers=_headers())
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode() or "{}")


def slugify(text: str, limit: int = 40) -> str:
    keep = [c.lower() if c.isalnum() else "-" for c in text.strip()]
    slug = "".join(keep)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-")[:limit] or "video"


def remote_ready() -> tuple[bool, str]:
    if not shutil.which("rclone"):
        return False, "rclone tidak terpasang di mesin ini"
    try:
        out = subprocess.run(["rclone", "listremotes"], capture_output=True, text=True, timeout=30)
    except Exception as exc:  # pragma: no cover - environment dependent
        return False, f"rclone gagal dijalankan: {exc}"
    remotes = {line.strip().rstrip(":") for line in out.stdout.splitlines() if line.strip()}
    if REMOTE not in remotes:
        return False, f"remote rclone '{REMOTE}' belum ada (jalankan: rclone config)"
    return True, ""


def render(composition_id: str, props: dict, out_path: Path) -> None:
    props_file = out_path.with_suffix(".props.json")
    props_file.write_text(json.dumps(props), encoding="utf-8")
    cmd = [
        "npx",
        "remotion",
        "render",
        "src/index.ts",
        composition_id,
        str(out_path),
        f"--props={props_file}",
        "--log=error",
    ]
    proc = subprocess.run(cmd, cwd=str(REMOTION_DIR), capture_output=True, text=True, timeout=RENDER_TIMEOUT)
    props_file.unlink(missing_ok=True)
    if proc.returncode != 0 or not out_path.exists():
        detail = (proc.stderr or proc.stdout or "").strip().splitlines()[-4:]
        raise RuntimeError("render gagal: " + " | ".join(detail)[:400])


def upload(local: Path, dest_name: str) -> tuple[str, str, str]:
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    folder = f"{REMOTE_BASE}/{month}"
    target = f"{REMOTE}:{folder}/{dest_name}"
    proc = subprocess.run(["rclone", "copyto", str(local), target], capture_output=True, text=True, timeout=900)
    if proc.returncode != 0:
        raise RuntimeError("upload gagal: " + (proc.stderr or proc.stdout).strip()[:400])

    file_id = ""
    meta = subprocess.run(
        ["rclone", "lsjson", f"{REMOTE}:{folder}", "--files-only"],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if meta.returncode == 0:
        try:
            for entry in json.loads(meta.stdout or "[]"):
                if entry.get("Name") == dest_name:
                    file_id = str(entry.get("ID") or "")
                    break
        except json.JSONDecodeError:
            pass
    if not file_id:
        # Remote non-Drive (mis. uji lokal): simpan path sebagai identitas.
        file_id = f"local:{folder}/{dest_name}"
        link = f"file://{os.path.join(REMOTE_BASE, month, dest_name)}"
    else:
        link = f"https://drive.google.com/file/d/{file_id}/view"
    return file_id, link, folder


def warn_once(job_id: str, message: str) -> bool:
    """True kalau peringatan untuk job ini belum pernah dicetak."""
    path = Path.home() / ".cache" / "playdesign" / "video_runner_warn.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        seen = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        seen = {}
    if seen.get(job_id) == message:
        return False
    seen[job_id] = message
    path.write_text(json.dumps(seen, indent=1), encoding="utf-8")
    return True


def run() -> int:
    jobs = api("GET", f"/api/video/jobs?workspace={WORKSPACE}&status=queued&limit=5").get("jobs", [])
    if not jobs:
        return 0

    ok, reason = remote_ready()
    if not ok:
        # Job sengaja dibiarkan `queued`: brief tidak hilang dan akan diproses
        # otomatis begitu remote Drive siap. Peringatan dicetak sekali per job.
        fresh = [job for job in jobs if warn_once(job["id"], reason)]
        if fresh:
            print(f"{len(jobs)} job video menunggu, tapi {reason}. Job tetap di antrean.")
        return 0

    templates = {t["id"]: t for t in api("GET", "/api/video/templates").get("templates", [])}
    done, failed = [], []
    for job in jobs:
        job_id = job["id"]
        try:
            claimed = api("POST", f"/api/video/jobs/{job_id}/claim", {"workspace": WORKSPACE}).get("job") or job
        except urllib.error.HTTPError as exc:
            if exc.code == 409:
                continue
            raise

        template = templates.get(claimed.get("templateId", ""))
        if not template:
            api("PATCH", f"/api/video/jobs/{job_id}", {"status": "failed", "error": "Template tidak dikenal runner."})
            failed.append((job_id, "template hilang"))
            continue

        api("PATCH", f"/api/video/jobs/{job_id}", {"status": "rendering"})
        tmp_dir = Path(tempfile.mkdtemp(prefix="pd-video-"))
        out_file = tmp_dir / "out.mp4"
        try:
            render(template["compositionId"], claimed.get("props") or {}, out_file)
            size = out_file.stat().st_size
            api("PATCH", f"/api/video/jobs/{job_id}", {"status": "uploading", "bytes": size})

            stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
            dest_name = f"{stamp}-{slugify(claimed.get('title', 'video'))}-{template['id']}-{job_id[-6:]}.mp4"
            file_id, link, folder = upload(out_file, dest_name)
            api(
                "PATCH",
                f"/api/video/jobs/{job_id}",
                {
                    "status": "done",
                    "bytes": size,
                    "driveFileId": file_id,
                    "driveWebLink": link,
                    "driveFolderId": folder,
                    "error": None,
                },
            )
            done.append((job_id, dest_name, size))
        except Exception as exc:  # noqa: BLE001 - satu job gagal tidak boleh menghentikan batch
            api("PATCH", f"/api/video/jobs/{job_id}", {"status": "failed", "error": str(exc)[:500]})
            failed.append((job_id, str(exc)[:120]))
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    if done or failed:
        for job_id, name, size in done:
            print(f"ok   {job_id} -> {name} ({size / 1024 / 1024:.1f} MB)")
        for job_id, err in failed:
            print(f"fail {job_id} -> {err}")
    return 0


if __name__ == "__main__":
    time.sleep(0)
    sys.exit(run())
