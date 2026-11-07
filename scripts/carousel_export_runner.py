#!/usr/bin/env python3
"""Carousel export runner.

Alur: ambil job `queued` dari API -> render tiap slide menjadi PNG 1080x1350 di
mesin ini -> tulis caption + manifest -> unggah satu folder ke Google Drive ->
catat pointer Drive ke D1 lewat API.

Byte gambar TIDAK pernah menyentuh Cloudflare: D1 hanya menyimpan spesifikasi
dokumen (teks), status, dan pointer Drive. Kredensial Drive dibaca dari
~/.config/playdesign/drive.json lewat `scripts/drive_upload.py` (jalur unggah
yang sudah dipakai Video Studio) — tidak ada OAuth atau uploader kedua.

Sengaja senyap kalau tidak ada job, supaya cron tidak mengirim notifikasi kosong.

Env yang dibaca:
  CAROUSEL_WORKSPACE     workspace CRM (default: playdesign)
  CAROUSEL_DRIVE_BASE    folder tujuan di Drive (default: Playdesign Carousel)
  CAROUSEL_LOCAL_DIR     folder fallback kalau Drive belum siap
  CAROUSEL_FONT          font ImageMagick (default: DejaVu Sans)
  CAROUSEL_RENDER_BIN    binary ImageMagick (default: auto `magick`/`convert`)
  PLAYDESIGN_DRIVE_CONFIG path drive.json (default: ~/.config/playdesign/drive.json)
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
from typing import Any, Callable

sys.path.insert(0, str(Path(__file__).resolve().parent))

import drive_upload  # noqa: E402
import tebar_mcp  # noqa: E402
from gmaps_lead_scraper import BASE_URL, _headers  # noqa: E402

WORKSPACE = os.environ.get("CAROUSEL_WORKSPACE", "playdesign")
REMOTE_BASE = os.environ.get("CAROUSEL_DRIVE_BASE", "Playdesign Carousel")
LOCAL_OUT_DIR = Path(
    os.environ.get("CAROUSEL_LOCAL_DIR", str(Path.home() / "work" / "drive-out" / "carousel"))
)
FONT = os.environ.get("CAROUSEL_FONT", "DejaVu Sans")
SLIDE_WIDTH = 1080
SLIDE_HEIGHT = 1350
BG = "#11131a"
INK = "#fffaf5"
MUTED = "#d8d2cf"
ACCENT = "#ef5a6b"


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

def api(method: str, path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE_URL}{path}", data=data, method=method, headers=_headers())
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode() or "{}")


def patch_soft(job_id: str, body: dict) -> dict | None:
    """PATCH status; 409 (job dibatalkan di tengah jalan) bukan error fatal."""
    try:
        return api("PATCH", f"/api/carousel/jobs/{job_id}", body)
    except urllib.error.HTTPError as exc:
        if exc.code in (409, 404):
            return None
        raise


# ---------------------------------------------------------------------------
# Teks & nama berkas
# ---------------------------------------------------------------------------

def slugify(text: str, limit: int = 40) -> str:
    keep = [c.lower() if c.isalnum() else "-" for c in (text or "").strip()]
    slug = "".join(keep)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-")[:limit].rstrip("-") or "carousel"


def escape_xml(value: str) -> str:
    return (
        (value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def wrap_text(value: str, max_chars: int, max_lines: int = 8) -> list[str]:
    words = (value or "").split()
    lines: list[str] = []
    line = ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if len(candidate) > max_chars and line:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    return lines[:max_lines] or [""]


def slide_filename(index: int, kind: str) -> str:
    label = "cover" if kind == "cover" else "slide"
    return f"{index + 1:02d}-{label}.png"


def folder_path_for(job: dict) -> str:
    created = str(job.get("createdAt") or "")
    try:
        stamp = datetime.fromisoformat(created.replace("Z", "+00:00"))
    except ValueError:
        stamp = datetime.now(timezone.utc)
    month = stamp.strftime("%Y-%m")
    day = stamp.strftime("%Y%m%d")
    job_id = str(job.get("id") or "job")
    return f"{REMOTE_BASE}/{month}/{day}-{slugify(job.get('title') or 'carousel')}-{job_id[-6:]}"


def build_caption(document: dict) -> str:
    caption = str(document.get("caption") or "").strip()
    tags = " ".join(
        f"#{str(tag).strip().lstrip('#')}" for tag in (document.get("hashtags") or []) if str(tag).strip()
    )
    return "\n\n".join(part for part in (caption, tags) if part)


# ---------------------------------------------------------------------------
# SVG -> PNG
# ---------------------------------------------------------------------------

def build_slide_svg(document: dict, index: int) -> str:
    """Layout 1080x1350 yang sama dengan preview Carousel Studio."""
    slides = document.get("slides") or []
    slide = slides[index] if 0 <= index < len(slides) else {"kind": "cover", "title": "", "body": ""}
    total = len(slides) or 1
    is_cover = slide.get("kind") == "cover"
    title = str(document.get("headline") or "") if is_cover else str(slide.get("title") or "")
    if is_cover:
        body = f"Sumber: {document.get('sourceName') or 'Belum diisi'}"
    else:
        body = str(slide.get("body") or "") or "Isi slide belum diisi."

    title_lines = wrap_text(title, 24, 5)
    body_lines = wrap_text(body, 42, 8)
    title_y = 420
    title_spans = "".join(
        f'<tspan x="88" dy="{0 if position == 0 else 80}">{escape_xml(line)}</tspan>'
        for position, line in enumerate(title_lines)
    )
    body_y = title_y + max(len(title_lines), 1) * 80 + 60
    body_spans = "".join(
        f'<tspan x="88" dy="{0 if position == 0 else 46}">{escape_xml(line)}</tspan>'
        for position, line in enumerate(body_lines)
    )
    kicker = escape_xml(str(document.get("kicker") or "PLAYDESIGN / CAROUSEL"))
    counter = f"{index + 1:02d} / {total:02d}"

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" viewBox="0 0 {SLIDE_WIDTH} {SLIDE_HEIGHT}">
  <rect width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" fill="{BG}"/>
  <rect x="0" y="0" width="24" height="{SLIDE_HEIGHT}" fill="#bf1d2d"/>
  <text x="88" y="110" fill="{ACCENT}" font-family="{FONT}" font-size="24" font-weight="700" letter-spacing="4">{kicker}</text>
  <text x="88" y="{title_y}" fill="{INK}" font-family="{FONT}" font-size="68" font-weight="800">{title_spans}</text>
  <text x="88" y="{body_y}" fill="{MUTED}" font-family="{FONT}" font-size="30">{body_spans}</text>
  <text x="88" y="1260" fill="{ACCENT}" font-family="{FONT}" font-size="30" font-weight="700">playdesign</text>
  <text x="992" y="1260" fill="{INK}" font-family="{FONT}" font-size="30" text-anchor="end">{counter}</text>
</svg>'''


def render_binary() -> str:
    override = os.environ.get("CAROUSEL_RENDER_BIN")
    if override:
        return override
    for candidate in ("magick", "convert"):
        found = shutil.which(candidate)
        if found:
            return found
    raise RuntimeError("ImageMagick tidak ditemukan (magick/convert). Render PNG dibatalkan.")


def render_png(svg_text: str, out_path: Path) -> None:
    """Render SVG -> PNG 1080x1350. Gagal keras, tidak pernah menulis placeholder."""
    binary = render_binary()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    svg_path = out_path.with_suffix(".svg")
    svg_path.write_text(svg_text, encoding="utf-8")
    cmd = [binary]
    if Path(binary).name == "magick":
        cmd.append("svg:" + str(svg_path))
    else:
        cmd.append(str(svg_path))
    cmd += ["-background", BG, "-alpha", "remove", "-alpha", "off", str(out_path)]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if proc.returncode != 0 or not out_path.exists() or out_path.stat().st_size == 0:
        detail = (proc.stderr or proc.stdout or "").strip().splitlines()[-3:]
        raise RuntimeError("render PNG gagal: " + " | ".join(detail)[:300])


# ---------------------------------------------------------------------------
# Unggah
# ---------------------------------------------------------------------------

def uploader_status() -> tuple[bool, str]:
    return drive_upload.available()


def upload_file(local: Path, name: str, folder_path: str, job_id: str, mime: str) -> dict:
    """Satu pintu unggah: perluas `drive_upload.upload_video` yang sudah ada."""
    return drive_upload.upload_video(local, name, folder_path, job_id=job_id, mime=mime)


def build_manifest(job: dict, document: dict, files: list[dict]) -> dict:
    return {
        "jobId": job.get("id"),
        "postId": job.get("postId"),
        "workspace": WORKSPACE,
        "headline": document.get("headline"),
        "template": document.get("template"),
        "caption": document.get("caption") or "",
        "hashtags": document.get("hashtags") or [],
        "dimensions": {"width": SLIDE_WIDTH, "height": SLIDE_HEIGHT},
        "slideCount": len(files),
        "slides": files,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "generator": "playdesign-carousel-runner/1",
    }


def parse_document(job: dict) -> dict:
    document = job.get("document")
    if isinstance(document, str):
        document = json.loads(document or "{}")
    document = document or {}
    if not document.get("slides"):
        raise RuntimeError("Dokumen job kosong; tidak ada slide untuk dirender.")
    return document


def render_slides(
    document: dict,
    job: dict,
    *,
    render: Callable[[str, Path], None] | None = None,
) -> tuple[Path, list[dict]]:
    """Render semua slide ke folder sementara. Pemanggil yang membersihkan."""
    render = render or render_png
    tmp_dir = Path(tempfile.mkdtemp(prefix="pd-carousel-"))
    slides = document.get("slides") or []
    rendered: list[dict] = []
    for index, slide in enumerate(slides):
        name = slide_filename(index, str(slide.get("kind") or "text"))
        out_path = tmp_dir / name
        render(build_slide_svg(document, index), out_path)
        if not out_path.exists() or out_path.stat().st_size == 0:
            shutil.rmtree(tmp_dir, ignore_errors=True)
            raise RuntimeError(f"Slide {index + 1} kosong setelah render.")
        rendered.append(
            {
                "index": index + 1,
                "kind": slide.get("kind"),
                "title": slide.get("title") or document.get("headline"),
                "file": name,
                "bytes": out_path.stat().st_size,
                "localPath": str(out_path),
            }
        )
    return tmp_dir, rendered


def export_job(
    job: dict,
    *,
    render: Callable[[str, Path], None] | None = None,
    upload: Callable[[Path, str, str, str, str], dict] | None = None,
    keep_local: bool = False,
) -> dict:
    """Render + unggah satu job. Fungsi murni terhadap I/O yang bisa diinjeksi.

    `keep_local=True` menahan folder sementara supaya runner bisa mengunggah byte
    yang sama ke Tebar tanpa merender ulang; pemanggil wajib menghapusnya.
    """
    upload = upload or upload_file
    document = parse_document(job)
    job_id = str(job.get("id") or "")
    folder_path = folder_path_for(job)

    tmp_dir, rendered = render_slides(document, job, render=render)
    uploaded: list[dict] = []
    total_bytes = 0

    try:
        for item in rendered:
            out_path = Path(item["localPath"])
            result = upload(out_path, item["file"], folder_path, f"{job_id}:{item['file']}", "image/png")
            file_id = str(result.get("id") or "")
            if not file_id:
                raise RuntimeError(f"Drive tidak mengembalikan file id untuk {item['file']}.")
            total_bytes += item["bytes"]
            uploaded.append(
                {
                    **item,
                    "driveFileId": file_id,
                    "driveWebLink": result.get("webViewLink")
                    or f"https://drive.google.com/file/d/{file_id}/view",
                }
            )

        caption_path = tmp_dir / "caption.txt"
        caption_path.write_text(build_caption(document), encoding="utf-8")
        caption_result = upload(caption_path, "caption.txt", folder_path, f"{job_id}:caption", "text/plain")

        manifest_path = tmp_dir / "manifest.json"
        manifest = build_manifest(job, document, uploaded)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        manifest_result = upload(
            manifest_path, "manifest.json", folder_path, f"{job_id}:manifest", "application/json"
        )

        folder_id = str(caption_result.get("folderId") or manifest_result.get("folderId") or "")
        return {
            "slideCount": len(uploaded),
            "bytes": total_bytes,
            "driveFolderId": folder_id or None,
            "driveFolderLink": f"https://drive.google.com/drive/folders/{folder_id}" if folder_id else None,
            "manifestFileId": str(manifest_result.get("id") or "") or None,
            "files": uploaded,
            "localDir": str(tmp_dir) if keep_local else None,
            "caption": build_caption(document),
        }
    finally:
        if not keep_local:
            shutil.rmtree(tmp_dir, ignore_errors=True)


# ---------------------------------------------------------------------------
# Tebar (jadwalkan ke Instagram/Threads lewat MCP)
# ---------------------------------------------------------------------------

def publish_job(
    job: dict,
    *,
    render: Callable[[str, Path], None] | None = None,
    client: Any = None,
) -> dict:
    """Render lokal -> unggah byte ke Tebar -> create_post (carousel bila >1 media)."""
    document = parse_document(job)
    client = client or tebar_mcp.TebarClient()
    ready, reason = client.available()
    if not ready:
        raise RuntimeError(reason)

    accounts = client.list_accounts()
    wanted = job.get("publishAccounts") or ["instagram"]
    if isinstance(wanted, str):
        try:
            wanted = json.loads(wanted)
        except ValueError:
            wanted = [wanted]
    if not isinstance(wanted, list):
        wanted = [str(wanted)]

    account_ids: list[str] = []
    missing: list[str] = []
    for platform in wanted:
        account = client.account_for(str(platform), accounts)
        if account:
            account_ids.append(str(account["id"]))
        else:
            missing.append(str(platform))
    if not account_ids:
        raise RuntimeError("Akun Tebar belum terhubung untuk: " + ", ".join(missing))

    tmp_dir, rendered = render_slides(document, job, render=render)
    try:
        media_ids = [str(client.upload_file(Path(item["localPath"]))["id"]) for item in rendered]
        result = client.create_post(
            account_ids=account_ids,
            text=build_caption(document),
            media_ids=media_ids,
            scheduled_at=job.get("publishAt") or None,
        )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    return {
        "postId": result.get("postId"),
        "raw": result.get("raw") or "",
        "accounts": account_ids,
        "missing": missing,
        "slideCount": len(media_ids),
    }


# ---------------------------------------------------------------------------
# Lock & main loop
# ---------------------------------------------------------------------------

def acquire_lock():
    lock_path = Path.home() / ".cache" / "playdesign" / "carousel_runner.lock"
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


def run() -> int:
    lock = acquire_lock()
    if lock is None:
        return 0
    try:
        return _run_locked()
    except urllib.error.HTTPError as exc:
        # Cron tidak boleh berisik: 404 saat deploy belum jalan / 5xx sementara cukup dilaporkan singkat.
        print(f"carousel runner: API menjawab {exc.code}; job tetap di antrean.")
        return 0
    except urllib.error.URLError as exc:
        print(f"carousel runner: API tidak bisa dihubungi ({exc.reason}); coba lagi nanti.")
        return 0
    finally:
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()


def _export_batch(pending: list[dict]) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    done: list[tuple[str, str]] = []
    failed: list[tuple[str, str]] = []
    for job in pending:
        job_id = str(job.get("id") or "")
        try:
            claimed = api("POST", f"/api/carousel/jobs/{job_id}/claim", {"workspace": WORKSPACE}).get("job") or job
        except urllib.error.HTTPError as exc:
            if exc.code == 409:
                continue
            raise

        try:
            patch_soft(job_id, {"status": "rendering"})
            result = export_job(claimed)
            patch_soft(job_id, {"status": "uploading"})
            updated = patch_soft(
                job_id,
                {
                    "status": "done",
                    "bytes": result["bytes"],
                    "driveFolderId": result["driveFolderId"],
                    "driveFolderLink": result["driveFolderLink"],
                    "manifestFileId": result["manifestFileId"],
                    "error": None,
                },
            )
            if updated is None:
                done.append((job_id, "sudah diunggah, status dibiarkan apa adanya"))
            else:
                done.append((job_id, result["driveFolderLink"] or result["driveFolderId"] or ""))
        except Exception as exc:  # noqa: BLE001 - satu job gagal tidak menghentikan batch
            patch_soft(job_id, {"status": "failed", "error": str(exc)[:500]})
            failed.append((job_id, str(exc)[:160]))
    return done, failed


def _publish_batch(publishable: list[dict]) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    """Job yang sudah diekspor & dijadwalkan manusianya -> kirim ke Tebar."""
    done: list[tuple[str, str]] = []
    failed: list[tuple[str, str]] = []
    for job in publishable:
        job_id = str(job.get("id") or "")
        if str(job.get("status") or "") != "done":
            continue
        try:
            patch_soft(job_id, {"publishStatus": "scheduling"})
            detail = api("GET", f"/api/carousel/jobs/{job_id}").get("job") or job
            result = publish_job(detail)
            post_id = str(result.get("postId") or "")
            if not post_id:
                raise RuntimeError("Tebar tidak mengembalikan id post.")
            patch_soft(
                job_id,
                {"publishStatus": "scheduled", "tebarPostId": post_id, "publishError": None},
            )
            when = job.get("publishAt") or "sekarang"
            done.append((job_id, f"tebar {post_id} @ {when}"))
        except Exception as exc:  # noqa: BLE001
            patch_soft(job_id, {"publishStatus": "failed", "publishError": str(exc)[:500]})
            failed.append((job_id, str(exc)[:160]))
    return done, failed


def _run_locked() -> int:
    pending = api("GET", f"/api/carousel/jobs?workspace={WORKSPACE}&status=queued&limit=5").get("jobs", [])
    publishable = api(
        "GET", f"/api/carousel/jobs?workspace={WORKSPACE}&publishStatus=queued&limit=5"
    ).get("jobs", [])
    if not pending and not publishable:
        return 0

    done: list[tuple[str, str]] = []
    failed: list[tuple[str, str]] = []

    if pending:
        ready, reason = uploader_status()
        if ready:
            exported, export_failed = _export_batch(pending)
            done += exported
            failed += export_failed
        else:
            print(f"{len(pending)} job carousel menunggu, tapi {reason}. Job tetap di antrean.")

    if publishable:
        client = tebar_mcp.TebarClient()
        ready, reason = client.available()
        if ready:
            published, publish_failed = _publish_batch(publishable)
            done += published
            failed += publish_failed
        else:
            print(f"{len(publishable)} carousel siap dijadwalkan, tapi {reason}. Tetap di antrean.")

    for job_id, info in done:
        print(f"ok   {job_id} -> {info}")
    for job_id, err in failed:
        print(f"fail {job_id} -> {err}")
    return 0


if __name__ == "__main__":
    time.sleep(0)
    sys.exit(run())
