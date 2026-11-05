#!/usr/bin/env python3
"""Video render runner.

Alur: ambil job `queued` dari API -> render dengan Remotion CLI di mesin ini ->
unggah hasil ke Google Drive -> catat pointer Drive ke D1 lewat API.
File video TIDAK pernah disimpan di server: satu-satunya salinan sementara ada di
folder temp mesin ini dan dihapus setelah unggahan sukses.

Unggahan punya dua jalur, dipilih otomatis:
  1. Drive API langsung (scripts/drive_upload.py) kalau ~/.config/playdesign/drive.json ada.
     Jalur ini yang disarankan: file id dan link datang dari respons Drive.
  2. rclone, kalau remote `gdrive` sudah dikonfigurasi dan drive.json belum ada.

Sengaja senyap kalau tidak ada job (cron no_agent meneruskan stdout ke notifikasi).

Env yang dibaca:
  VIDEO_REMOTE        nama remote rclone (default: gdrive)
  VIDEO_REMOTE_BASE   folder tujuan di Drive (default: Playdesign Video)
  REMOTION_DIR        proyek Remotion (default: ~/work/remotion-starter)
  VIDEO_WORKSPACE     workspace CRM (default: playdesign)
  PLAYDESIGN_DRIVE_CONFIG  path drive.json (default: ~/.config/playdesign/drive.json)
"""

from __future__ import annotations

import fcntl
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

import drive_upload  # noqa: E402
import video_spec  # noqa: E402
from gmaps_lead_scraper import BASE_URL, _headers  # noqa: E402

WORKSPACE = os.environ.get("VIDEO_WORKSPACE", "playdesign")
REMOTE = os.environ.get("VIDEO_REMOTE", "gdrive")
REMOTE_BASE = os.environ.get("VIDEO_REMOTE_BASE", "Playdesign Video")
REMOTION_DIR = Path(os.environ.get("REMOTION_DIR", str(Path.home() / "work" / "remotion-starter")))
# edge-tts dipasang di venv terpisah supaya Python sistem tidak tersentuh.
EDGE_TTS = os.environ.get("EDGE_TTS", str(Path.home() / ".venvs" / "media" / "bin" / "edge-tts"))
# Kalau unggahan dimatikan, file tinggal di sini (bukan di infrastruktur Cloudflare).
LOCAL_OUT_DIR = Path(os.environ.get("VIDEO_LOCAL_DIR", str(Path.home() / "work" / "drive-out" / "lokal")))
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
    # rstrip setelah dipotong: "abc def" limit=4 -> "abc-", bukan "abc"
    return slug.strip("-")[:limit].rstrip("-") or "video"


def rclone_status(remote: str) -> tuple[bool, str]:
    """Remote terdaftar belum tentu sudah login — cek token-nya ada."""
    if not shutil.which("rclone"):
        return False, "rclone tidak terpasang"
    try:
        out = subprocess.run(["rclone", "config", "dump"], capture_output=True, text=True, timeout=30)
    except Exception as exc:  # pragma: no cover - environment dependent
        return False, f"rclone gagal dijalankan: {exc}"
    if out.returncode != 0:
        return False, "konfigurasi rclone tidak terbaca"
    try:
        remotes = json.loads(out.stdout or "{}")
    except json.JSONDecodeError:
        return False, "konfigurasi rclone tidak terbaca"
    entry = remotes.get(remote)
    if not entry:
        return False, f"remote rclone '{remote}' belum ada"
    if entry.get("type") == "drive" and not entry.get("token"):
        return False, f"remote rclone '{remote}' ada tapi belum login (token kosong)"
    return True, ""


def uploader_status() -> tuple[str | None, str]:
    """Pilih jalur unggah: 'drive' (Drive API) -> 'rclone' -> None (belum siap)."""
    ok, drive_reason = drive_upload.available()
    if ok:
        return "drive", ""

    rclone_ok, rclone_reason = rclone_status(REMOTE)
    if rclone_ok:
        return "rclone", ""
    return None, f"Drive API belum siap ({drive_reason}); {rclone_reason}"


def remote_ready() -> tuple[bool, str]:
    """Dipertahankan untuk pemanggil lama; True kalau salah satu jalur siap."""
    mode, reason = uploader_status()
    return mode is not None, reason


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


def upload_rclone(local: Path, dest_name: str) -> tuple[str, str, str]:
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


def upload_drive(local: Path, dest_name: str, job_id: str) -> tuple[str, str, str]:
    """Unggah lewat Drive API: id dan link diambil dari respons, bukan ditebak."""
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    folder = f"{REMOTE_BASE}/{month}"
    result = drive_upload.upload_video(local, dest_name, folder, job_id=job_id)
    file_id = str(result.get("id") or "")
    if not file_id:
        raise RuntimeError("Drive tidak mengembalikan file id")
    link = str(result.get("webViewLink") or f"https://drive.google.com/file/d/{file_id}/view")
    folder_id = str(result.get("folderId") or folder)
    return file_id, link, folder_id


def upload(local: Path, dest_name: str, job_id: str = "", mode: str = "rclone") -> tuple[str, str, str]:
    if mode == "drive":
        return upload_drive(local, dest_name, job_id)
    return upload_rclone(local, dest_name)


def patch_soft(job_id: str, body: dict) -> dict | None:
    """PATCH status; 409 (mis. job dibatalkan di tengah render) bukan error fatal."""
    try:
        return api("PATCH", f"/api/video/jobs/{job_id}", body)
    except urllib.error.HTTPError as exc:
        if exc.code in (409, 404):
            return None
        raise


def upload_with_retry(
    local: Path, dest_name: str, job_id: str = "", mode: str = "rclone", attempts: int = 3
) -> tuple[str, str, str]:
    """Jaringan/Drive bisa gagal sesaat — coba ulang sebelum menyerah."""
    last: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            return upload(local, dest_name, job_id=job_id, mode=mode)
        except Exception as exc:  # noqa: BLE001
            last = exc
            if attempt < attempts:
                time.sleep(5 * attempt)
    raise RuntimeError(f"unggah gagal setelah {attempts} percobaan: {last}")


def cleanup_temp(max_age_hours: int = 24) -> None:
    """Folder temp yang tertinggal dari proses yang mati mendadak."""
    cutoff = time.time() - max_age_hours * 3600
    for path in Path(tempfile.gettempdir()).glob("pd-video-*"):
        try:
            if path.is_dir() and path.stat().st_mtime < cutoff:
                shutil.rmtree(path, ignore_errors=True)
        except OSError:
            continue


def acquire_lock():
    """Cegah dua runner berjalan bersamaan (cron tumpang tindih dengan proses manual)."""
    lock_path = Path.home() / ".cache" / "playdesign" / "video_runner.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    handle = lock_path.open("w")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        handle.close()
        return None
    handle.write(str(os.getpid()))
    handle.flush()
    return handle


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
    lock = acquire_lock()
    if lock is None:
        return 0  # runner lain sedang jalan
    try:
        cleanup_temp()
        return _run_locked()
    finally:
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()


def patch_reference(ref_id: str, payload: dict) -> None:
    """Simpan metadata hasil baca berkas (palet/dimensi) ke pustaka referensi."""
    try:
        api("PATCH", f"/api/video/references/{ref_id}", payload)
    except Exception:  # noqa: BLE001 - metadata opsional, render tidak boleh gagal
        pass


def needs_upload(job: dict) -> bool:
    """Job tanpa spec selalu diunggah; job berspec mengikuti render.upload."""
    spec = job.get("spec")
    if isinstance(spec, dict) and isinstance(spec.get("render"), dict):
        return spec["render"].get("upload") is not False
    return True


def prepare_assets(spec: dict, job_id: str) -> tuple[dict, list[Path]]:
    """Suara + subtitle dari spec. File ditaruh di public/ agar `staticFile` jalan."""
    assets: dict = {}
    cleanup: list[Path] = []
    audio_dir = REMOTION_DIR / "public" / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)

    text = video_spec.narration(spec)
    voice = (spec.get("audio") or {}).get("voice") or {}
    if voice.get("enabled") and text.strip():
        if not Path(EDGE_TTS).exists():
            raise RuntimeError(
                f"TTS tidak tersedia: {EDGE_TTS} tidak ditemukan. "
                "Pasang dengan: python3 -m venv ~/.venvs/media && ~/.venvs/media/bin/pip install edge-tts"
            )
        mp3 = audio_dir / f"{job_id}.mp3"
        srt = audio_dir / f"{job_id}.srt"
        txt = audio_dir / f"{job_id}.txt"
        txt.write_text(text, encoding="utf-8")
        cmd = [
            EDGE_TTS,
            "--voice", str(voice.get("voiceId") or "id-ID-GadisNeural"),
            "--rate", f"{int(voice.get('rate') or 0):+d}%",
            "--pitch", f"{int(voice.get('pitch') or 0):+d}Hz",
            "--file", str(txt),
            "--write-media", str(mp3),
            "--write-subtitles", str(srt),
            "--no-progress",
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if proc.returncode != 0 or not mp3.exists() or mp3.stat().st_size == 0:
            detail = (proc.stderr or proc.stdout or "").strip().splitlines()[-3:]
            raise RuntimeError("TTS gagal: " + " | ".join(detail)[:300])
        assets["voiceover"] = f"audio/{job_id}.mp3"
        cleanup.extend([mp3, srt, txt])
        if (spec.get("subtitle") or {}).get("enabled") and srt.exists():
            assets["captions"] = video_spec.parse_srt(srt.read_text(encoding="utf-8"))

    return assets, cleanup


# ---------------------------------------------------------------------------
# Referensi: unduh ke public/refs/<job>/ supaya `staticFile` bisa membacanya
# ---------------------------------------------------------------------------

def _ref_ext(url: str, kind: str) -> str:
    name = url.split("?")[0].split("#")[0]
    suffix = Path(name).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".mov", ".webm", ".mp3", ".wav", ".m4a", ".aac"}:
        return suffix
    return {"image": ".png", "video": ".mp4", "audio": ".mp3"}.get(kind, ".bin")


def _fetch_reference(url: str, dest: Path) -> None:
    """`local:` dibaca dari mesin ini; selain itu diunduh lewat HTTP."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if url.startswith("local:"):
        source = Path(url[6:]).expanduser()
        if not source.is_file():
            raise RuntimeError(f"Referensi lokal tidak ditemukan: {source}")
        shutil.copy2(source, dest)
        return
    req = urllib.request.Request(url, headers={"User-Agent": "playdesign-runner/1.0"})
    with urllib.request.urlopen(req, timeout=180) as resp, dest.open("wb") as out:
        shutil.copyfileobj(resp, out)
    if dest.stat().st_size == 0:
        raise RuntimeError(f"Referensi kosong setelah diunduh: {url}")


def _probe(path: Path) -> dict:
    try:
        proc = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "stream=width,height,duration:format=duration",
             "-of", "json", str(path)],
            capture_output=True, text=True, timeout=60,
        )
        data = json.loads(proc.stdout or "{}")
    except (subprocess.SubprocessError, ValueError):
        return {}
    stream = (data.get("streams") or [{}])[0]
    duration = stream.get("duration") or (data.get("format") or {}).get("duration")
    meta: dict = {}
    if stream.get("width"):
        meta["width"] = int(stream["width"])
    if stream.get("height"):
        meta["height"] = int(stream["height"])
    if duration:
        try:
            meta["durationMs"] = int(float(duration) * 1000)
        except ValueError:
            pass
    return meta


def _palette(path: Path) -> dict:
    """Ambil palet dari gambar tanpa AI: rata-rata 8x8 piksel lewat ffmpeg."""
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-vf", "scale=8:8", "-frames:v", "1",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True, timeout=60,
    )
    raw = proc.stdout or b""
    if len(raw) < 3 * 64:
        return {}
    pixels = [tuple(raw[i:i + 3]) for i in range(0, 3 * 64, 3)]
    avg = tuple(sum(channel) // 64 for channel in zip(*pixels))
    # aksen = piksel paling jenuh, supaya warna khas gambar tidak hilang jadi abu-abu
    accent = max(pixels, key=lambda px: (max(px) - min(px)) + sum(px) / 6)
    return {"bg": "#%02x%02x%02x" % avg, "accent": "#%02x%02x%02x" % accent}


def prepare_references(spec: dict, job_id: str) -> tuple[dict, dict, list[Path], list[tuple[str, dict]]]:
    """Unduh semua referensi job, rapikan URL-nya, dan hitung palet gambar gaya."""
    refs = spec.get("references") or []
    if not refs:
        return spec, {}, [], []

    ref_dir = REMOTION_DIR / "public" / "refs" / job_id
    ref_dir.mkdir(parents=True, exist_ok=True)
    files: list[Path] = []
    updates: list[tuple[str, dict]] = []
    assets: dict = {}

    for index, ref in enumerate(refs):
        url = (ref.get("url") or "").strip()
        if not url:
            continue
        kind = ref.get("kind") or "image"
        dest = ref_dir / f"{index:02d}-{slugify(ref.get('name') or 'ref', 24)}{_ref_ext(url, kind)}"
        _fetch_reference(url, dest)
        files.append(dest)
        ref["url"] = f"refs/{job_id}/{dest.name}"
        meta = _probe(dest)
        if kind == "image" and ref.get("role") in ("style", "subject"):
            meta.update(_palette(dest))
        if meta:
            updates.append((str(ref.get("id") or ""), meta))

    music = (spec.get("audio") or {}).get("music") or {}
    if music.get("enabled") and music.get("refId"):
        target = next((r for r in refs if r.get("id") == music.get("refId")), None)
        if target and target.get("url", "").startswith("refs/"):
            assets["music"] = target["url"]

    sfx: list[dict] = []
    for effect in (spec.get("audio") or {}).get("sfx") or []:
        target = next((r for r in refs if r.get("id") == effect.get("refId")), None)
        if target and target.get("url", "").startswith("refs/"):
            sfx.append({"src": target["url"], "atSec": effect.get("atSec") or 0, "volume": effect.get("volume") or 60})
    if sfx:
        assets["sfx"] = sfx

    return spec, assets, files, updates


def _run_locked() -> int:
    pending = api("GET", f"/api/video/jobs?workspace={WORKSPACE}&status=queued&limit=5").get("jobs", [])
    if not pending:
        return 0

    mode, reason = uploader_status()
    # Job yang unggahannya dimatikan tetap boleh jalan tanpa Drive.
    jobs = [job for job in pending if needs_upload(job) is False or mode is not None]
    blocked = [job for job in pending if job not in jobs]
    if blocked:
        # Job sengaja dibiarkan `queued`: brief tidak hilang dan akan diproses
        # otomatis begitu Drive siap. Peringatan dicetak sekali per job.
        fresh = [job for job in blocked if warn_once(job["id"], reason)]
        if fresh:
            print(f"{len(blocked)} job video menunggu, tapi {reason}. Job tetap di antrean.")
    if not jobs:
        return 0

    templates = {t["id"]: t for t in api("GET", "/api/video/templates").get("templates", [])}
    done, failed, cancelled = [], [], []
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

        spec = video_spec.normalize(claimed.get("spec"))
        story_mode = bool(spec and spec.get("scenes"))
        composition_id = (spec or {}).get("render", {}).get("compositionId") or template["compositionId"]

        api("PATCH", f"/api/video/jobs/{job_id}", {"status": "rendering"})
        tmp_dir = Path(tempfile.mkdtemp(prefix="pd-video-"))
        out_file = tmp_dir / "out.mp4"
        assets: dict = {}
        asset_files: list[Path] = []
        try:
            props = claimed.get("props") or {}
            if story_mode:
                spec, ref_assets, ref_files, ref_updates = prepare_references(spec, job_id)
                assets, asset_files = prepare_assets(spec, job_id)
                assets.update(ref_assets)
                asset_files.extend(ref_files)
                for ref_id, meta in ref_updates:
                    if ref_id:
                        patch_reference(ref_id, meta)
                props = {"spec": spec, "assets": assets}
            render(composition_id, props, out_file)
            size = out_file.stat().st_size

            stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
            dest_name = f"{stamp}-{slugify(claimed.get('title', 'video'))}-{composition_id.lower()}-{job_id[-6:]}.mp4"

            if story_mode and not spec["render"]["upload"]:
                # Unggahan dimatikan: file tetap di mesin runner, bukan di Cloudflare.
                LOCAL_OUT_DIR.mkdir(parents=True, exist_ok=True)
                local_path = LOCAL_OUT_DIR / dest_name
                shutil.move(str(out_file), local_path)
                updated = patch_soft(
                    job_id,
                    {"status": "done", "bytes": size, "localPath": str(local_path), "error": None},
                )
                if updated is None:
                    cancelled.append((job_id, dest_name))
                else:
                    done.append((job_id, f"{dest_name} (lokal)", size))
                continue

            patch_soft(job_id, {"status": "uploading", "bytes": size})
            file_id, link, folder = upload_with_retry(out_file, dest_name, job_id=job_id, mode=mode)
            updated = patch_soft(
                job_id,
                {
                    "status": "done",
                    "bytes": size,
                    "driveFileId": file_id,
                    "driveWebLink": link,
                    "driveFolderId": folder,
                    "error": None,
                },
            )
            if updated is None:
                # Job dibatalkan saat sedang dirender: filenya sudah terunggah,
                # tapi status tidak boleh dipaksa `done`.
                cancelled.append((job_id, dest_name))
            else:
                done.append((job_id, dest_name, size))
        except Exception as exc:  # noqa: BLE001 - satu job gagal tidak boleh menghentikan batch
            patch_soft(job_id, {"status": "failed", "error": str(exc)[:500]})
            failed.append((job_id, str(exc)[:120]))
        finally:
            for asset in asset_files:
                asset.unlink(missing_ok=True)
            shutil.rmtree(tmp_dir, ignore_errors=True)
            shutil.rmtree(REMOTION_DIR / "public" / "refs" / job_id, ignore_errors=True)

    if done or failed or cancelled:
        for job_id, name, size in done:
            print(f"ok   {job_id} -> {name} ({size / 1024 / 1024:.1f} MB)")
        for job_id, name in cancelled:
            print(f"batal {job_id} -> {name} sudah terunggah, status dibiarkan canceled")
        for job_id, err in failed:
            print(f"fail {job_id} -> {err}")
    return 0


if __name__ == "__main__":
    time.sleep(0)
    sys.exit(run())
