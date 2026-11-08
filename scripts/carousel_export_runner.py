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
import re
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

# Sama dengan preview: template mengubah palet, bukan hanya label.
TEMPLATE_STYLES: dict[str, dict[str, object]] = {
    "split-brand": {"bg": "#11131a", "bar": "#bf1d2d", "title_y": 420, "overlay": False},
    "split-dark": {"bg": "#090b10", "bar": "#ef5a6b", "title_y": 420, "overlay": False},
    "full-image": {"bg": "#11131a", "bar": None, "title_y": 860, "overlay": True},
}


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
    """Layout 1080x1350 yang selaras dengan preview Carousel Studio."""
    slides = document.get("slides") or []
    slide = slides[index] if 0 <= index < len(slides) else {"kind": "cover", "title": "", "body": ""}
    total = len(slides) or 1
    is_cover = slide.get("kind") == "cover"
    title = str(document.get("headline") or "") if is_cover else str(slide.get("title") or "")
    has_cover_image = bool(document.get("coverImageUrl"))

    style = TEMPLATE_STYLES.get(str(document.get("template") or "split-brand"), TEMPLATE_STYLES["split-brand"])
    bg = str(style["bg"])
    bar = style["bar"]
    overlay = bool(style["overlay"])
    counter = f"{index + 1:02d} / {total:02d}"

    backdrop = f'<rect width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" fill="{bg}"/>'
    bar_rect = (
        f'<rect x="0" y="0" width="24" height="{SLIDE_HEIGHT}" fill="{bar}"/>' if bar else ""
    )

    tagline = f'<text x="540" y="1260" fill="rgba(255,255,255,0.35)" font-family="{FONT}" font-size="18" font-weight="700" letter-spacing="6" text-anchor="middle">LETS PLAY CREATIVITY WITH US</text>'
    footer = f'''
  <text x="88" y="1260" fill="{ACCENT}" font-family="{FONT}" font-size="30" font-weight="700">playdesign</text>
  {tagline}
  <text x="992" y="1260" fill="{INK}" font-family="{FONT}" font-size="30" text-anchor="end">{counter}</text>'''

    if is_cover:
        # Template full-image dengan foto atau overlay eksplisit
        if overlay or has_cover_image:
            title_lines = wrap_text(title, 24, 5)
            body = f"Sumber: {document.get('sourceName') or 'Belum diisi'}"
            body_lines = wrap_text(body, 42, 5 if overlay else 8)
            title_y = int(str(style["title_y"]))
            title_spans = "".join(
                f'<tspan x="88" dy="{0 if position == 0 else 80}">{escape_xml(line)}</tspan>'
                for position, line in enumerate(title_lines)
            )
            body_y = title_y + max(len(title_lines), 1) * 80 + (40 if overlay else 60)
            body_spans = "".join(
                f'<tspan x="88" dy="{0 if position == 0 else 46}">{escape_xml(line)}</tspan>'
                for position, line in enumerate(body_lines)
            )
            kicker = escape_xml(str(document.get("kicker") or "PLAYDESIGN / CAROUSEL"))
            return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" viewBox="0 0 {SLIDE_WIDTH} {SLIDE_HEIGHT}">
  {backdrop}
  {bar_rect}
  <text x="88" y="110" fill="{ACCENT}" font-family="{FONT}" font-size="24" font-weight="700" letter-spacing="4">{kicker}</text>
  <text x="88" y="{title_y}" fill="{INK}" font-family="{FONT}" font-size="68" font-weight="800">{title_spans}</text>
  <text x="88" y="{body_y}" fill="{MUTED}" font-family="{FONT}" font-size="30">{body_spans}</text>
  {footer}
</svg>'''

        # Editorial Typography Cover (tanpa foto cover / poster berita editorial PlayDesign)
        kicker_raw = str(document.get("kicker") or "PLAYDESIGN / RADAR").strip()
        is_crypto = "crypto" in kicker_raw.lower()
        badge_bg = "#f59e0b" if is_crypto else "#ef4444"
        clean_kicker = kicker_raw.replace("PLAYDESIGN / ", "").replace("PLAYDESIGN/", "").strip()
        badge_w = min(max(len(clean_kicker) * 16 + 48, 160), 450)

        watermark = f'<text x="1000" y="620" fill="#ffffff" fill-opacity="0.03" font-family="{FONT}" font-size="180" font-weight="900" text-anchor="end" transform="rotate(-90 1000 620)">PLAYDESIGN</text>'

        title_lines = wrap_text(title, 22, 5)
        title_y = int(str(style["title_y"]))
        title_spans = "".join(
            f'<tspan x="88" dy="{0 if position == 0 else 82}">{escape_xml(line)}</tspan>'
            for position, line in enumerate(title_lines)
        )

        subtitle = str(slide.get("body") or "").strip()
        sub_elements = ""
        if subtitle:
            sub_lines = wrap_text(subtitle, 38, 4)
            sub_y = title_y + len(title_lines) * 82 + 24
            sub_spans = "".join(
                f'<tspan x="88" dy="{0 if position == 0 else 46}">{escape_xml(line)}</tspan>'
                for position, line in enumerate(sub_lines)
            )
            sub_elements = f'<text x="88" y="{sub_y}" fill="#c8c0be" font-family="{FONT}" font-size="28">{sub_spans}</text>'

        src_label = f"Sumber: {document.get('sourceName') or 'Belum diisi'}"
        src_w = min(max(len(src_label) * 14 + 56, 260), 650)
        source_pill = f'''
  <rect x="88" y="1110" width="{src_w}" height="50" rx="25" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)"/>
  <text x="120" y="1143" fill="#fffaf5" font-family="{FONT}" font-size="22">{escape_xml(src_label)}</text>'''

        badge_pill = f'''
  <rect x="88" y="100" width="{badge_w}" height="46" rx="23" fill="{badge_bg}"/>
  <text x="{88 + badge_w // 2}" y="131" fill="#000000" font-family="{FONT}" font-size="20" font-weight="800" letter-spacing="2" text-anchor="middle">{escape_xml(clean_kicker)}</text>
  <text x="{88 + badge_w + 24}" y="130" fill="#8f8785" font-family="{FONT}" font-size="18" font-weight="600" letter-spacing="3">EDISI EDITORIAL</text>'''

        return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" viewBox="0 0 {SLIDE_WIDTH} {SLIDE_HEIGHT}">
  {backdrop}
  {bar_rect}
  {watermark}
  {badge_pill}
  <text x="88" y="{title_y}" fill="{INK}" font-family="{FONT}" font-size="68" font-weight="800">{title_spans}</text>
  {sub_elements}
  {source_pill}
  {footer}
</svg>'''

    # Slide Isi (Slide 2-5): Terstruktur dengan point cards jika teks memiliki baris poin
    kicker = escape_xml(f"PLAYDESIGN / {index + 1:02d}")
    title_lines = wrap_text(title, 26, 3)
    title_spans = "".join(
        f'<tspan x="88" dy="{0 if position == 0 else 72}">{escape_xml(line)}</tspan>'
        for position, line in enumerate(title_lines)
    )

    body_text = str(slide.get("body") or "").strip() or "Isi slide belum diisi."
    raw_lines = [l.strip() for l in body_text.splitlines() if l.strip()]
    if len(raw_lines) <= 1 and re.search(r"\b1[\.\)]\s+.*\b2[\.\)]\s+", body_text):
        raw_lines = [l.strip() for l in re.split(r"(?=\b\d+[\.\)]\s+)", body_text) if l.strip()]
    points = []
    for line in raw_lines:
        match = re.match(r"^(\d+[\.\)]|[-*•])\s*(.*)", line)
        if match:
            num = match.group(1).rstrip(".):")
            points.append((num if len(num) <= 2 else "•", match.group(2)))

    cards_elements = []
    start_y = 220 + len(title_lines) * 72 + 30

    if len(points) >= 2:
        curr_y = start_y
        for num, text in points[:4]:
            p_lines = wrap_text(text, 44, 4)
            card_h = max(len(p_lines) * 40 + 36, 96)
            p_spans = "".join(
                f'<tspan x="184" dy="{0 if position == 0 else 40}">{escape_xml(pl)}</tspan>'
                for position, pl in enumerate(p_lines)
            )
            card_svg = f'''
  <rect x="88" y="{curr_y}" width="904" height="{card_h}" rx="14" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)"/>
  <rect x="114" y="{curr_y + 20}" width="46" height="46" rx="8" fill="{ACCENT}"/>
  <text x="137" y="{curr_y + 51}" fill="#ffffff" font-family="{FONT}" font-size="22" font-weight="800" text-anchor="middle">{escape_xml(num)}</text>
  <text x="184" y="{curr_y + 50}" fill="#c8c0be" font-family="{FONT}" font-size="26">{p_spans}</text>'''
            cards_elements.append(card_svg)
            curr_y += card_h + 18
    else:
        # Standard paragraph card
        body_lines = wrap_text(body_text, 42, 8)
        box_h = max(len(body_lines) * 48 + 48, 140)
        body_spans = "".join(
            f'<tspan x="134" dy="{0 if position == 0 else 48}">{escape_xml(line)}</tspan>'
            for position, line in enumerate(body_lines)
        )
        card_svg = f'''
  <rect x="88" y="{start_y}" width="904" height="{box_h}" rx="14" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.08)"/>
  <rect x="88" y="{start_y}" width="8" height="{box_h}" rx="4" fill="{ACCENT}"/>
  <text x="134" y="{start_y + 52}" fill="{MUTED}" font-family="{FONT}" font-size="30">{body_spans}</text>'''
        cards_elements.append(card_svg)

    body_section = "".join(cards_elements)

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" viewBox="0 0 {SLIDE_WIDTH} {SLIDE_HEIGHT}">
  {backdrop}
  {bar_rect}
  <text x="88" y="105" fill="{ACCENT}" font-family="{FONT}" font-size="24" font-weight="700" letter-spacing="4">{kicker}</text>
  <rect x="88" y="125" width="80" height="4" fill="{bar if bar else ACCENT}"/>
  <text x="88" y="220" fill="{INK}" font-family="{FONT}" font-size="56" font-weight="800">{title_spans}</text>
  {body_section}
  {footer}
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


COVER_MAX_BYTES = 8 * 1024 * 1024
COVER_BAND_HEIGHT = 640


def fetch_cover(url: str, dest: Path, *, opener=None, timeout: int = 20) -> Path | None:
    """Unduh foto cover untuk template full-image. Gagal -> None (render tetap jalan)."""
    if not re.match(r"^https?://", url or "", re.I):
        return None
    opener = opener or (lambda req: urllib.request.urlopen(req, timeout=timeout))
    request = urllib.request.Request(url, headers={"User-Agent": "playdesign-carousel-runner/1"})
    try:
        with opener(request) as response:
            payload = response.read(COVER_MAX_BYTES + 1)
    except Exception:  # noqa: BLE001 - foto eksternal tidak boleh menggagalkan ekspor
        return None
    if not payload or len(payload) > COVER_MAX_BYTES:
        return None
    if payload.startswith(b"\x89PNG"):
        suffix = ".png"
    elif payload[:3] == b"\xff\xd8\xff":
        suffix = ".jpg"
    elif payload[:4] == b"RIFF" and payload[8:12] == b"WEBP":
        suffix = ".webp"
    else:
        return None
    dest = dest.with_suffix(suffix)
    dest.write_bytes(payload)
    return dest


def render_png(svg_text: str, out_path: Path, *, cover: Path | None = None) -> None:
    """Render SVG -> PNG 1080x1350. Gagal keras, tidak pernah menulis placeholder.

    `cover` menempelkan foto di pita atas (template full-image); kalau komposit gagal,
    PNG teks tetap dipakai supaya ekspor tidak hilang.
    """
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

    if cover is None:
        return

    composite = subprocess.run(
        [
            binary,
            str(out_path),
            "(",
            str(cover),
            "-resize",
            f"{SLIDE_WIDTH}x{COVER_BAND_HEIGHT}^",
            "-gravity",
            "center",
            "-extent",
            f"{SLIDE_WIDTH}x{COVER_BAND_HEIGHT}",
            "+gravity",
            ")",
            "-gravity",
            "northwest",
            "-composite",
            str(out_path),
        ],
        capture_output=True,
        text=True,
        timeout=180,
    )
    if composite.returncode != 0 or out_path.stat().st_size == 0:
        detail = (composite.stderr or composite.stdout or "").strip().splitlines()[-3:]
        print("peringatan: komposit foto cover dilewati: " + " | ".join(detail)[:200])


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
    overlay = str(document.get("template") or "") == "full-image"
    cover = (
        fetch_cover(str(document.get("coverImageUrl") or ""), tmp_dir / "cover")
        if overlay
        else None
    )
    for index, slide in enumerate(slides):
        name = slide_filename(index, str(slide.get("kind") or "text"))
        out_path = tmp_dir / name
        svg_text = build_slide_svg(document, index)
        if overlay and index == 0 and cover is not None:
            # Slide cover: teks tetap dari SVG, foto ditempel di pita atas.
            render_png(svg_text, out_path, cover=cover)
        else:
            render(svg_text, out_path)
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


def _minutes_since(stamp: str | None) -> float:
    try:
        when = datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return 0.0
    return (datetime.now(timezone.utc) - when).total_seconds() / 60


def _reap_stale_export() -> list[str]:
    """Job yang tertahan di rendering/uploading (runner mati di tengah jalan) dibebaskan.

    Tanpa ini job tersebut memblokir ekspor baru untuk carousel yang sama (`409 job_active`).
    """
    reaped: list[str] = []
    for status in ("rendering", "uploading"):
        rows = api("GET", f"/api/carousel/jobs?workspace={WORKSPACE}&status={status}&limit=10").get(
            "jobs", []
        )
        for job in rows:
            if _minutes_since(job.get("updatedAt")) < 30:
                continue
            job_id = str(job.get("id") or "")
            patch_soft(
                job_id,
                {"status": "failed", "error": "Runner berhenti di tengah jalan; ekspor diulang dari antrean."},
            )
            reaped.append(job_id)
    return reaped


def _reap_stale_publish() -> list[str]:
    """Job yang tertahan di `scheduling` (runner mati setelah Tebar sukses) ditandai gagal.

    Tanpa ini job menggantung selamanya: hanya status `queued` yang diambil ulang.
    """
    stale = api("GET", f"/api/carousel/jobs?workspace={WORKSPACE}&publishStatus=scheduling&limit=10").get(
        "jobs", []
    )
    reaped: list[str] = []
    for job in stale:
        if _minutes_since(job.get("updatedAt")) < 15:
            continue
        job_id = str(job.get("id") or "")
        patch_soft(
            job_id,
            {
                "publishStatus": "failed",
                "publishError": "Status tayang tidak terkonfirmasi setelah 15 menit; cek Tebar sebelum menjadwalkan ulang.",
            },
        )
        reaped.append(job_id)
    return reaped


def _run_locked() -> int:
    pending = api("GET", f"/api/carousel/jobs?workspace={WORKSPACE}&status=queued&limit=5").get("jobs", [])
    publishable = api(
        "GET", f"/api/carousel/jobs?workspace={WORKSPACE}&publishStatus=queued&limit=5"
    ).get("jobs", [])
    for job_id in _reap_stale_export():
        print(f"warn {job_id} -> ekspor menggantung, ditandai gagal")
    for job_id in _reap_stale_publish():
        print(f"warn {job_id} -> status tayang tidak terkonfirmasi, ditandai gagal")
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
