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

# Font yang benar-benar terpasang di host render (diverifikasi lewat fc-list).
# `font` per dokumen/slide memilih salah satu kunci di bawah; kosong = default.
FONT_STACKS = {
    "grotesk": "DejaVu Sans",
    "sans": "Liberation Sans",
    "narrow": "Nimbus Sans Narrow",
    "serif": "DejaVu Serif",
    "roman": "Nimbus Roman",
    "mono": "DejaVu Sans Mono",
}
DEFAULT_FONT_ID = "grotesk"

# Bagaimana tiap template memperlakukan foto cover:
#   band = pita foto di atas, seluruh teks di bawahnya (tidak mungkin tumpang tindih)
#   full = foto penuh kanvas + scrim, teks menimpa area gelap
#   none = template tipografi, foto tidak dipakai
TEMPLATE_PHOTO = {
    "split-brand": "band",
    "full-image": "full",
    "split-dark": "none",
    "poster": "none",
    "kolase": "none",
    "blok": "none",
}


def normalize_font_id(value: object) -> str:
    """Kembalikan id font yang dikenal, atau '' kalau tidak valid."""
    key = str(value or "").strip().lower()
    return key if key in FONT_STACKS else ""
SLIDE_WIDTH = 1080
SLIDE_HEIGHT = 1350
BG = "#11131a"
INK = "#fffaf5"
MUTED = "#d8d2cf"
ACCENT = "#ef5a6b"
DEFAULT_ACCENT = ACCENT

# Sama dengan preview: tiap template punya komposisi cover & slide isi sendiri.
TEMPLATE_STYLES: dict[str, dict[str, object]] = {
    "split-brand": {"bg": "#11131a", "bar": "#bf1d2d", "cover": "split", "text": "cards"},
    "split-dark": {"bg": "#090b10", "bar": None, "cover": "statement", "text": "statement"},
    "full-image": {"bg": "#0b0c10", "bar": None, "cover": "photo", "text": "cards"},
    "poster": {"bg": "#11131a", "bar": "#bf1d2d", "cover": "poster", "text": "poster"},
    "kolase": {"bg": "#11131a", "bar": None, "cover": "kolase", "text": "cards"},
    "blok": {"bg": "#ef5a6b", "bar": None, "cover": "blok", "text": "blok"},
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


HEX_ACCENT_RE = re.compile(r"^#(?:[0-9a-f]{3}|[0-9a-f]{6})$", re.IGNORECASE)


def normalize_hex_accent(value: object) -> str:
    """Warna aksen brand: hanya #rgb / #rrggbb, selain itu string kosong."""
    raw = str(value or "").strip()
    if not raw:
        return ""
    if not raw.startswith("#"):
        raw = f"#{raw}"
    return raw.lower() if HEX_ACCENT_RE.match(raw) else ""


def normalize_brand_handle(value: object) -> str:
    """Handle brand untuk footer slide, selalu satu '@' di depan."""
    raw = re.sub(r"\s+", "", str(value or "").strip()).lstrip("@")
    return f"@{raw[:30]}" if raw else ""


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

MARGIN = 88
FOOTER_BASELINE = 1260
FOOTER_TAGLINE_X = 430
FOOTER_COUNTER_X = 880


def _text_block(
    lines: list[str],
    *,
    x: int,
    baseline: int,
    line_height: int,
    fill: str,
    size: int,
    weight: int = 800,
    anchor: str = "start",
    letter_spacing: int = 0,
) -> str:
    """Teks multi-baris sebagai satu <text> dengan tspan per baris."""
    if not lines:
        return ""
    spans = "".join(
        f'<tspan x="{x}" dy="{0 if position == 0 else line_height}">{escape_xml(line)}</tspan>'
        for position, line in enumerate(lines)
    )
    spacing = f' letter-spacing="{letter_spacing}"' if letter_spacing else ""
    centering = f' text-anchor="{anchor}"' if anchor != "start" else ""
    return (
        f'<text x="{x}" y="{baseline}" fill="{fill}" font-family="{FONT}" '
        f'font-size="{size}" font-weight="{weight}"{spacing}{centering}>{spans}</text>'
    )


def _paragraph_lines(body: str, max_chars: int, max_lines: int) -> list[str]:
    """Pecah isi slide per baris logis, bukan digabung jadi satu paragraf."""
    out: list[str] = []
    for raw in str(body or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        out.extend(wrap_text(line, max_chars, max_lines))
        if len(out) >= max_lines:
            break
    return out[:max_lines]

def _footer(brand: str, counter: str, accent: str) -> str:
    return (
        f'<text x="{MARGIN}" y="{FOOTER_BASELINE}" fill="{accent}" font-family="{FONT}" '
        f'font-size="30" font-weight="700">{escape_xml(brand)}</text>'
        f'<text x="{FOOTER_TAGLINE_X}" y="{FOOTER_BASELINE}" fill="rgba(255,255,255,0.34)" font-family="{FONT}" '
        f'font-size="15" font-weight="700">'
        f"LETS PLAY CREATIVITY WITH US</text>"
        f'<text x="{FOOTER_COUNTER_X}" y="{FOOTER_BASELINE}" fill="{INK}" font-family="{FONT}" font-size="30" '
        f'font-weight="700">{counter}</text>'
    )


def _niche_label(kicker_raw: str) -> str:
    return kicker_raw.replace("PLAYDESIGN / ", "").replace("PLAYDESIGN/", "").strip() or "EDITORIAL"


def approx_text_width(text: str, size: float, letter_spacing: float = 0) -> int:
    """Perkiraan lebar teks (px) untuk DejaVu Sans Bold di renderer ImageMagick.

    Renderer menerapkan `letter-spacing` sekitar 7x nilai SVG (terukur: font 21,
    ls 2 -> 208 px untuk 8 huruf), jadi jarak antar huruf dihitung 7x di sini.
    Dipakai untuk menghitung lebar pil/badge supaya teks tidak keluar kotak.
    """
    chars = len(text)
    if chars == 0:
        return 0
    return int(chars * size * 0.66 + max(chars - 1, 0) * letter_spacing * 7)


def _niche_badge(label: str, kicker_raw: str, accent: str, y: int = 128) -> str:
    """Badge niche solid: kuning untuk crypto, aksen brand untuk sisanya."""
    bg = "#f59e0b" if "crypto" in kicker_raw.lower() else accent
    text_w = approx_text_width(label, 21, 2)
    width = min(max(text_w + 56, 168), 640)
    return (
        f'<rect x="{MARGIN}" y="{y}" width="{width}" height="48" rx="24" fill="{bg}"/>'
        f'<text x="{MARGIN + 28}" y="{y + 32}" fill="#000000" font-family="{FONT}" font-size="21" '
        f'font-weight="800" letter-spacing="2">{escape_xml(label)}</text>'
    )


def _source_pill(document: dict) -> str:
    label = f"Sumber: {document.get('sourceName') or 'Belum diisi'}"
    width = min(max(len(label) * 14 + 60, 280), 680)
    return (
        f'<rect x="{MARGIN}" y="1078" width="{width}" height="56" rx="28" '
        f'fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.22)"/>'
        f'<text x="{MARGIN + 32}" y="1114" fill="{INK}" font-family="{FONT}" font-size="23">'
        f"{escape_xml(label)}</text>"
    )


def _cover_split(document: dict, title: str, subtitle: str, accent: str, bar: str, kicker_raw: str, brand: str, counter: str) -> str:
    """Editorial split: metadata di atas, judul dijangkar bawah, pita aksen kiri."""
    label = _niche_label(kicker_raw)
    title_lines = wrap_text(title, 22, 5)
    title_y = 1000 - (len(title_lines) - 1) * 82
    deck = wrap_text(subtitle, 40, 2) if subtitle else []
    deck_y = title_y - 70 - max(len(deck) - 1, 0) * 40
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" viewBox="0 0 {SLIDE_WIDTH} {SLIDE_HEIGHT}">
  <rect width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" fill="{TEMPLATE_STYLES['split-brand']['bg']}"/>
  <rect x="0" y="0" width="24" height="{SLIDE_HEIGHT}" fill="{bar}"/>
  <text x="1010" y="780" fill="#ffffff" fill-opacity="0.035" font-family="{FONT}" font-size="200" font-weight="900" text-anchor="end" transform="rotate(-90 1010 780)">PLAYDESIGN</text>
  <text x="{MARGIN}" y="104" fill="#8f8785" font-family="{FONT}" font-size="19" font-weight="700" letter-spacing="5">EDISI EDITORIAL</text>
  {_niche_badge(label, kicker_raw, accent)}
  <rect x="{MARGIN}" y="200" width="904" height="1" fill="rgba(255,255,255,0.12)"/>
  {_text_block(deck, x=MARGIN, baseline=deck_y, line_height=40, fill="#b8b0ae", size=28, weight=400)}
  {_text_block(title_lines, x=MARGIN, baseline=title_y, line_height=82, fill=INK, size=68, weight=800)}
  {_source_pill(document)}
  {_footer(brand, counter, accent)}
</svg>'''


def _cover_split_photo(document: dict, title: str, subtitle: str, accent: str, bar: str, kicker_raw: str, brand: str, counter: str) -> str:
    """Editorial split + foto: pita foto di atas, seluruh teks di bawah pita.

    Semua teks berada di y >= 600 sehingga tidak mungkin bertumpuk dengan foto
    (pita 0..560). Komposit foto dikerjakan `render_png(photo_band=True)`.
    """
    label = _niche_label(kicker_raw)
    band = PHOTO_BAND_HEIGHT
    title_lines = wrap_text(title, 22, 4)
    title_y = 1090 - (len(title_lines) - 1) * 78
    deck = wrap_text(subtitle, 44, 2) if subtitle else []
    deck_y = title_y - 56 - max(len(deck) - 1, 0) * 40
    source = str(document.get("sourceName") or "Belum diisi")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" viewBox="0 0 {SLIDE_WIDTH} {SLIDE_HEIGHT}">
  <rect width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" fill="{TEMPLATE_STYLES['split-brand']['bg']}"/>
  <rect x="0" y="{band}" width="24" height="{SLIDE_HEIGHT - band}" fill="{bar}"/>
  <text x="1010" y="800" fill="#ffffff" fill-opacity="0.035" font-family="{FONT}" font-size="200" font-weight="900" text-anchor="end" transform="rotate(-90 1010 800)">PLAYDESIGN</text>
  <text x="{MARGIN}" y="622" fill="#8f8785" font-family="{FONT}" font-size="19" font-weight="700" letter-spacing="5">EDISI EDITORIAL</text>
  {_niche_badge(label, kicker_raw, accent, y=646)}
  <rect x="{MARGIN}" y="718" width="904" height="1" fill="rgba(255,255,255,0.12)"/>
  {_text_block(deck, x=MARGIN, baseline=deck_y, line_height=40, fill="#b8b0ae", size=27, weight=400)}
  {_text_block(title_lines, x=MARGIN, baseline=title_y, line_height=78, fill=INK, size=64, weight=800)}
  <text x="{MARGIN}" y="1140" fill="#8f8785" font-family="{FONT}" font-size="20" font-weight="600" letter-spacing="3">SUMBER: {escape_xml(source.upper())}</text>
  {_footer(brand, counter, accent)}
</svg>'''


def _cover_statement(document: dict, title: str, subtitle: str, accent: str, kicker_raw: str, brand: str, counter: str) -> str:
    """Statement: satu kalimat besar di tengah, dua garis aksen, tanpa kartu."""
    title_lines = wrap_text(title, 24, 5)
    block_bottom = 700
    title_y = block_bottom - (len(title_lines) - 1) * 88
    attribution = str(document.get("sourceName") or "").strip()
    attribution_svg = (
        _text_block([f"— {attribution}"], x=540, baseline=block_bottom + 96, line_height=40,
                    fill="#b3aaa8", size=24, weight=600, anchor="middle")
        if attribution
        else ""
    )
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" viewBox="0 0 {SLIDE_WIDTH} {SLIDE_HEIGHT}">
  <rect width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" fill="{TEMPLATE_STYLES['split-dark']['bg']}"/>
  <text x="540" y="150" fill="{accent}" font-family="{FONT}" font-size="19" font-weight="700" letter-spacing="6" text-anchor="middle">{escape_xml(_niche_label(kicker_raw).upper())}</text>
  <rect x="470" y="186" width="140" height="3" fill="{accent}"/>
  {_text_block(title_lines, x=540, baseline=title_y, line_height=88, fill=INK, size=62, weight=800, anchor="middle")}
  <rect x="470" y="{block_bottom + 44}" width="140" height="3" fill="rgba(255,255,255,0.22)"/>
  {attribution_svg}
  {_footer(brand, counter, accent)}
</svg>'''


def _cover_photo(document: dict, title: str, subtitle: str, accent: str, kicker_raw: str, brand: str, counter: str) -> str:
    """Full-bleed: foto penuh kanvas, judul menimpa di area scrim.

    Scrim gradien dikerjakan ImageMagick saat komposit (renderer SVG bawaan
    ImageMagick tidak mendukung linearGradient), jadi SVG ini transparan penuh
    ketika foto tersedia.
    """
    has_photo = bool(document.get("coverImageUrl"))
    backdrop = "" if has_photo else f'<rect width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" fill="{TEMPLATE_STYLES["full-image"]["bg"]}"/>'
    title_lines = wrap_text(title, 20, 4)
    title_y = 980 - (len(title_lines) - 1) * 82
    deck = wrap_text(subtitle, 40, 2) if subtitle else []
    deck_y = title_y - 66 - max(len(deck) - 1, 0) * 40
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" viewBox="0 0 {SLIDE_WIDTH} {SLIDE_HEIGHT}">
  {backdrop}
  <rect x="{MARGIN}" y="128" width="8" height="48" fill="{accent}"/>
  <text x="{MARGIN + 26}" y="162" fill="{INK}" font-family="{FONT}" font-size="21" font-weight="800" letter-spacing="3">{escape_xml(_niche_label(kicker_raw).upper())}</text>
  {_text_block(deck, x=MARGIN, baseline=deck_y, line_height=40, fill="#ddd6d3", size=28, weight=400)}
  {_text_block(title_lines, x=MARGIN, baseline=title_y, line_height=82, fill="#ffffff", size=66, weight=800)}
  {_text_block(wrap_text("SUMBER: " + str(document.get("sourceName") or "BELUM DIISI").upper(), 40, 2), x=MARGIN, baseline=1046, line_height=32, fill="#f0eae8", size=21, weight=600)}
  {_footer(brand, counter, accent)}
</svg>'''


def _cover_poster(document: dict, title: str, subtitle: str, accent: str, kicker_raw: str, brand: str, counter: str, index: int) -> str:
    """Poster tipografi: nomor raksasa, judul besar, tanpa badge pil."""
    title_lines = wrap_text(title, 16, 4)
    title_y = 1010 - (len(title_lines) - 1) * 96
    deck = wrap_text(subtitle, 46, 2) if subtitle else []
    deck_y = title_y - 74 - max(len(deck) - 1, 0) * 40
    number = f"{index + 1:02d}"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" viewBox="0 0 {SLIDE_WIDTH} {SLIDE_HEIGHT}">
  <rect width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" fill="{TEMPLATE_STYLES['poster']['bg']}"/>
  <rect x="0" y="0" width="{SLIDE_WIDTH}" height="10" fill="{accent}"/>
  <text x="992" y="420" fill="{accent}" fill-opacity="0.16" font-family="{FONT}" font-size="380" font-weight="900" text-anchor="end">{number}</text>
  <text x="{MARGIN}" y="120" fill="{INK}" font-family="{FONT}" font-size="21" font-weight="800" letter-spacing="6">{escape_xml(_niche_label(kicker_raw).upper())}</text>
  <rect x="{MARGIN}" y="150" width="64" height="6" fill="{accent}"/>
  {_text_block(deck, x=MARGIN, baseline=deck_y, line_height=40, fill="#b8b0ae", size=29, weight=400)}
  {_text_block(title_lines, x=MARGIN, baseline=title_y, line_height=96, fill=INK, size=84, weight=800)}
  <text x="{MARGIN}" y="1058" fill="#8f8785" font-family="{FONT}" font-size="21" font-weight="600" letter-spacing="3">{escape_xml(str(document.get('sourceName') or 'Belum diisi'))}</text>
  {_footer(brand, counter, accent)}
</svg>'''


def _text_cards(document: dict, slide: dict, title: str, accent: str, bar: str, brand: str, counter: str, index: int) -> str:
    """Slide isi standar: kartu bernomor untuk poin, kartu paragraf untuk teks biasa."""
    kicker = escape_xml(f"PLAYDESIGN / {index + 1:02d}")
    style = TEMPLATE_STYLES.get(str(document.get("template") or "split-brand"), TEMPLATE_STYLES["split-brand"])
    bg = str(style["bg"])
    title_lines = wrap_text(title, 26, 3)
    body_text = str(slide.get("body") or "").strip() or "Isi slide belum diisi."
    raw_lines = [line.strip() for line in body_text.splitlines() if line.strip()]
    if len(raw_lines) <= 1 and re.search(r"\b1[\.\)]\s+.*\b2[\.\)]\s+", body_text):
        raw_lines = [line.strip() for line in re.split(r"(?=\b\d+[\.\)]\s+)", body_text) if line.strip()]
    points = []
    for line in raw_lines:
        match = re.match(r"^(\d+[\.\)]|[-*•])\s*(.*)", line)
        if match:
            num = match.group(1).rstrip(".):")
            points.append((num if len(num) <= 2 else "•", match.group(2)))

    cards_elements: list[str] = []
    start_y = 220 + len(title_lines) * 72 + 30

    if len(points) >= 2:
        curr_y = start_y
        for num, text in points[:4]:
            point_lines = wrap_text(text, 44, 4)
            card_h = max(len(point_lines) * 40 + 36, 96)
            point_spans = "".join(
                f'<tspan x="184" dy="{0 if position == 0 else 40}">{escape_xml(pl)}</tspan>'
                for position, pl in enumerate(point_lines)
            )
            cards_elements.append(
                f'<rect x="{MARGIN}" y="{curr_y}" width="904" height="{card_h}" rx="14" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)"/>'
                f'<rect x="114" y="{curr_y + 20}" width="46" height="46" rx="8" fill="{accent}"/>'
                f'<text x="137" y="{curr_y + 51}" fill="#ffffff" font-family="{FONT}" font-size="22" font-weight="800" text-anchor="middle">{escape_xml(num)}</text>'
                f'<text x="184" y="{curr_y + 50}" fill="#c8c0be" font-family="{FONT}" font-size="26">{point_spans}</text>'
            )
            curr_y += card_h + 18
    else:
        body_lines = wrap_text(body_text, 42, 8)
        box_h = max(len(body_lines) * 48 + 48, 140)
        body_spans = "".join(
            f'<tspan x="134" dy="{0 if position == 0 else 48}">{escape_xml(line)}</tspan>'
            for position, line in enumerate(body_lines)
        )
        cards_elements.append(
            f'<rect x="{MARGIN}" y="{start_y}" width="904" height="{box_h}" rx="14" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.08)"/>'
            f'<rect x="{MARGIN}" y="{start_y}" width="8" height="{box_h}" rx="4" fill="{accent}"/>'
            f'<text x="134" y="{start_y + 52}" fill="{MUTED}" font-family="{FONT}" font-size="30">{body_spans}</text>'
        )

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" viewBox="0 0 {SLIDE_WIDTH} {SLIDE_HEIGHT}">
  <rect width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" fill="{bg}"/>
  {f'<rect x="0" y="0" width="24" height="{SLIDE_HEIGHT}" fill="{bar}"/>' if bar else ''}
  <text x="{MARGIN}" y="105" fill="{accent}" font-family="{FONT}" font-size="24" font-weight="700" letter-spacing="4">{kicker}</text>
  <rect x="{MARGIN}" y="125" width="80" height="4" fill="{bar or accent}"/>
  {_text_block(title_lines, x=MARGIN, baseline=220, line_height=72, fill=INK, size=56, weight=800)}
  {''.join(cards_elements)}
  {_footer(brand, counter, accent)}
</svg>'''


def _text_statement(document: dict, slide: dict, title: str, accent: str, brand: str, counter: str, index: int) -> str:
    """Slide isi statement: judul besar di tengah, isi sebagai satu paragraf tengah."""
    title_lines = wrap_text(title, 26, 4)
    title_y = 520 - (len(title_lines) - 1) * 82
    body = str(slide.get("body") or "").strip()
    body_lines = _paragraph_lines(body, 50, 8)
    body_y = title_y + (len(title_lines) - 1) * 82 + 100
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" viewBox="0 0 {SLIDE_WIDTH} {SLIDE_HEIGHT}">
  <rect width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" fill="{TEMPLATE_STYLES['split-dark']['bg']}"/>
  <text x="540" y="150" fill="{accent}" font-family="{FONT}" font-size="19" font-weight="700" letter-spacing="6" text-anchor="middle">BAGIAN {index + 1:02d}</text>
  <rect x="470" y="186" width="140" height="3" fill="{accent}"/>
  {_text_block(title_lines, x=540, baseline=title_y, line_height=82, fill=INK, size=58, weight=800, anchor="middle")}
  {_text_block(body_lines, x=540, baseline=body_y, line_height=52, fill="#c8c0be", size=30, weight=400, anchor="middle")}
  {_footer(brand, counter, accent)}
</svg>'''


def _text_poster(document: dict, slide: dict, title: str, accent: str, brand: str, counter: str, index: int) -> str:
    """Slide isi poster: nomor bagian raksasa, judul menempel, isi rata kiri."""
    title_lines = wrap_text(title, 24, 4)
    title_y = 640 - (len(title_lines) - 1) * 80
    body = str(slide.get("body") or "").strip()
    body_lines = _paragraph_lines(body, 44, 8)
    body_y = title_y + (len(title_lines) - 1) * 80 + 90
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" viewBox="0 0 {SLIDE_WIDTH} {SLIDE_HEIGHT}">
  <rect width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" fill="{TEMPLATE_STYLES['poster']['bg']}"/>
  <rect x="0" y="0" width="{SLIDE_WIDTH}" height="10" fill="{accent}"/>
  <text x="992" y="470" fill="{accent}" fill-opacity="0.14" font-family="{FONT}" font-size="380" font-weight="900" text-anchor="end">{index + 1:02d}</text>
  <rect x="{MARGIN}" y="120" width="64" height="6" fill="{accent}"/>
  {_text_block(title_lines, x=MARGIN, baseline=title_y, line_height=80, fill=INK, size=64, weight=800)}
  {_text_block(body_lines, x=MARGIN, baseline=body_y, line_height=50, fill="#c8c0be", size=30, weight=400)}
  {_footer(brand, counter, accent)}
</svg>'''


def _cover_blok(document: dict, title: str, subtitle: str, accent: str, kicker_raw: str, brand: str, counter: str) -> str:
    """Blok tebal (rujukan ATHLETIC): latar aksen penuh, tipografi hitam kapital."""
    title_lines = wrap_text(title.upper(), 15, 4)
    title_y = 990 - (len(title_lines) - 1) * 86
    deck = wrap_text(subtitle, 38, 2) if subtitle else []
    deck_y = title_y - 78 - max(len(deck) - 1, 0) * 40
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" viewBox="0 0 {SLIDE_WIDTH} {SLIDE_HEIGHT}">
  <rect width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" fill="{accent}"/>
  <rect x="{MARGIN}" y="120" width="72" height="72" fill="#0b0c10"/>
  <text x="{MARGIN + 36}" y="170" fill="{accent}" font-family="{FONT}" font-size="34" font-weight="900" text-anchor="middle">{counter.split(" / ")[0]}</text>
  <text x="{MARGIN + 96}" y="150" fill="#0b0c10" font-family="{FONT}" font-size="24" font-weight="900" letter-spacing="3">{escape_xml(_niche_label(kicker_raw).upper())}</text>
  <text x="{MARGIN + 96}" y="182" fill="#0b0c10" fill-opacity="0.6" font-family="{FONT}" font-size="19" font-weight="700" letter-spacing="2">PLAYDESIGN / CAROUSEL</text>
  {_text_block(deck, x=MARGIN, baseline=deck_y, line_height=40, fill="#0b0c10", size=28, weight=600)}
  {_text_block(title_lines, x=MARGIN, baseline=title_y, line_height=86, fill="#0b0c10", size=78, weight=900)}
  <text x="{MARGIN}" y="1058" fill="#0b0c10" fill-opacity="0.78" font-family="{FONT}" font-size="21" font-weight="700" letter-spacing="3">{escape_xml(str(document.get('sourceName') or 'Belum diisi'))}</text>
  <text x="{MARGIN}" y="{FOOTER_BASELINE}" fill="#0b0c10" font-family="{FONT}" font-size="30" font-weight="900">{escape_xml(brand)}</text>
  <text x="{FOOTER_TAGLINE_X}" y="{FOOTER_BASELINE}" fill="#0b0c10" fill-opacity="0.72" font-family="{FONT}" font-size="15" font-weight="700">LETS PLAY CREATIVITY WITH US</text>
  <text x="{FOOTER_COUNTER_X}" y="{FOOTER_BASELINE}" fill="#0b0c10" font-family="{FONT}" font-size="30" font-weight="900">{counter}</text>
</svg>'''


def _cover_kolase(document: dict, title: str, subtitle: str, accent: str, kicker_raw: str, brand: str, counter: str) -> str:
    """Kolase (rujukan RED_COLLAGE): blok warna bertumpuk, judul menimpa blok."""
    title_lines = wrap_text(title, 18, 4)
    title_y = 960 - (len(title_lines) - 1) * 84
    deck = wrap_text(subtitle, 40, 2) if subtitle else []
    deck_y = title_y - 70 - max(len(deck) - 1, 0) * 40
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" viewBox="0 0 {SLIDE_WIDTH} {SLIDE_HEIGHT}">
  <rect width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" fill="#11131a"/>
  <rect x="740" y="110" width="290" height="340" fill="{accent}"/>
  <rect x="690" y="168" width="290" height="340" fill="#1c1f2a" stroke="rgba(255,255,255,0.12)"/>
  <rect x="640" y="226" width="290" height="340" fill="{accent}" fill-opacity="0.20" stroke="rgba(255,255,255,0.16)"/>
  <text x="{MARGIN}" y="120" fill="{accent}" font-family="{FONT}" font-size="22" font-weight="900" letter-spacing="5">{escape_xml(_niche_label(kicker_raw).upper())}</text>
  <rect x="{MARGIN}" y="146" width="96" height="6" fill="{accent}"/>
  {_text_block(deck, x=MARGIN, baseline=deck_y, line_height=40, fill="#b8b0ae", size=28, weight=400)}
  {_text_block(title_lines, x=MARGIN, baseline=title_y, line_height=84, fill="#fffaf5", size=74, weight=800)}
  <text x="{MARGIN}" y="1058" fill="#8f8785" font-family="{FONT}" font-size="21" font-weight="600" letter-spacing="3">{escape_xml(str(document.get('sourceName') or 'Belum diisi'))}</text>
  {_footer(brand, counter, accent)}
</svg>'''


def _text_blok(document: dict, slide: dict, title: str, accent: str, brand: str, counter: str, index: int) -> str:
    """Slide isi blok tebal: latar aksen, tipografi hitam, daftar rapat."""
    title_lines = wrap_text(title.upper(), 20, 3)
    body_text = str(slide.get("body") or "").strip()
    body_lines = _paragraph_lines(body_text, 40, 8)
    body_y = 300 + (len(title_lines) - 1) * 76 + 100
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" viewBox="0 0 {SLIDE_WIDTH} {SLIDE_HEIGHT}">
  <rect width="{SLIDE_WIDTH}" height="{SLIDE_HEIGHT}" fill="{accent}"/>
  <rect x="{MARGIN}" y="120" width="72" height="72" fill="#0b0c10"/>
  <text x="{MARGIN + 36}" y="170" fill="{accent}" font-family="{FONT}" font-size="34" font-weight="900" text-anchor="middle">{index + 1:02d}</text>
  <text x="{MARGIN + 96}" y="164" fill="#0b0c10" fill-opacity="0.6" font-family="{FONT}" font-size="19" font-weight="700" letter-spacing="2">PLAYDESIGN / CAROUSEL</text>
  {_text_block(title_lines, x=MARGIN, baseline=300, line_height=76, fill="#0b0c10", size=62, weight=900)}
  {_text_block(body_lines, x=MARGIN, baseline=body_y, line_height=52, fill="#0b0c10", size=30, weight=600)}
  <text x="{MARGIN}" y="{FOOTER_BASELINE}" fill="#0b0c10" font-family="{FONT}" font-size="30" font-weight="900">{escape_xml(brand)}</text>
  <text x="{FOOTER_TAGLINE_X}" y="{FOOTER_BASELINE}" fill="#0b0c10" fill-opacity="0.72" font-family="{FONT}" font-size="15" font-weight="700">LETS PLAY CREATIVITY WITH US</text>
  <text x="{FOOTER_COUNTER_X}" y="{FOOTER_BASELINE}" fill="#0b0c10" font-family="{FONT}" font-size="30" font-weight="900">{counter}</text>
</svg>'''


def _build_slide_svg_base(document: dict, index: int) -> str:
    """Layout 1080x1350 yang selaras dengan preview Carousel Studio."""
    slides = document.get("slides") or []
    slide = slides[index] if 0 <= index < len(slides) else {"kind": "cover", "title": "", "body": ""}
    total = len(slides) or 1
    is_cover = slide.get("kind") == "cover"
    title = str(document.get("headline") or "") if is_cover else str(slide.get("title") or "")
    subtitle = str(slide.get("body") or "").strip()

    template = str(document.get("template") or "split-brand")
    style = TEMPLATE_STYLES.get(template, TEMPLATE_STYLES["split-brand"])
    # Brand kit: aksen & handle dari dokumen menimpa palet template.
    accent_override = normalize_hex_accent(document.get("accent"))
    accent = accent_override or DEFAULT_ACCENT
    brand = normalize_brand_handle(document.get("brandHandle")) or "playdesign"
    bar = accent_override or str(style.get("bar") or "")
    counter = f"{index + 1:02d} / {total:02d}"
    kicker_raw = str(document.get("kicker") or "PLAYDESIGN / CAROUSEL").strip()

    if is_cover:
        layout = str(style.get("cover") or "split")
        if layout == "statement":
            return _cover_statement(document, title, subtitle, accent, kicker_raw, brand, counter)
        if layout == "photo":
            return _cover_photo(document, title, subtitle, accent, kicker_raw, brand, counter)
        if layout == "poster":
            return _cover_poster(document, title, subtitle, accent, kicker_raw, brand, counter, index)
        if layout == "kolase":
            return _cover_kolase(document, title, subtitle, accent, kicker_raw, brand, counter)
        if layout == "blok":
            return _cover_blok(document, title, subtitle, accent, kicker_raw, brand, counter)
        if document.get("coverImageUrl"):
            return _cover_split_photo(document, title, subtitle, accent, bar, kicker_raw, brand, counter)
        return _cover_split(document, title, subtitle, accent, bar, kicker_raw, brand, counter)

    layout = str(style.get("text") or "cards")
    if layout == "statement":
        return _text_statement(document, slide, title, accent, brand, counter, index)
    if layout == "poster":
        return _text_poster(document, slide, title, accent, brand, counter, index)
    if layout == "blok":
        return _text_blok(document, slide, title, accent, brand, counter, index)
    return _text_cards(document, slide, title, accent, bar, brand, counter, index)

def build_slide_svg(document: dict, index: int) -> str:
    """SVG satu slide, sudah memakai font pilihan slide/dokumen.

    Pemilihan font dilakukan dengan menukar `font-family` pada SVG jadi:
    semua builder memakai konstanta FONT, jadi satu penggantian cukup dan
    tidak ada elemen yang tertinggal memakai font lama.
    """
    svg = _build_slide_svg_base(document, index)
    slides = document.get("slides") or []
    slide = slides[index] if 0 <= index < len(slides) else {}
    font_id = normalize_font_id(slide.get("font")) or normalize_font_id(document.get("font"))
    if not font_id:
        return svg
    family = FONT_STACKS[font_id]
    if family == FONT:
        return svg
    return svg.replace(f'font-family="{FONT}"', f'font-family="{family}"')


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
PHOTO_BAND_HEIGHT = 560


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


def render_png(
    svg_text: str,
    out_path: Path,
    *,
    cover: Path | None = None,
    full_bleed: bool = False,
    photo_band: bool = False,
) -> None:
    """Render SVG -> PNG 1080x1350. Gagal keras, tidak pernah menulis placeholder.

    `cover` + `full_bleed` menempelkan foto penuh kanvas lalu menggambar teks SVG
    transparan di atasnya (template full-image). `photo_band` menempelkan foto
    sebagai pita di area atas yang memang kosong dari teks (template split), jadi
    teks tidak pernah tertimpa. Kalau komposit gagal, PNG teks tetap dipakai
    supaya ekspor tidak hilang.
    """
    binary = render_binary()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    svg_path = out_path.with_suffix(".svg")
    svg_path.write_text(svg_text, encoding="utf-8")

    def _render_svg(target: Path, *, transparent: bool) -> subprocess.CompletedProcess:
        if Path(binary).name == "magick":
            source = "svg:" + str(svg_path)
        else:
            source = str(svg_path)
        # -background harus mendahului input agar SVG benar-benar transparan.
        if transparent:
            cmd = [binary, "-background", "none", source, "-alpha", "on", str(target)]
        else:
            cmd = [binary, "-background", BG, source, "-alpha", "remove", "-alpha", "off", str(target)]
        return subprocess.run(cmd, capture_output=True, text=True, timeout=180)

    if photo_band and cover is not None:
        band_png = out_path.with_name(out_path.stem + "-pita.png")
        try:
            proc = _render_svg(out_path, transparent=False)
            if proc.returncode != 0 or not out_path.exists():
                raise RuntimeError("render teks gagal")
            band = subprocess.run(
                [
                    binary,
                    str(cover),
                    "-resize",
                    f"{SLIDE_WIDTH}x{PHOTO_BAND_HEIGHT}^",
                    "-gravity",
                    "center",
                    "-extent",
                    f"{SLIDE_WIDTH}x{PHOTO_BAND_HEIGHT}",
                    str(band_png),
                ],
                capture_output=True,
                text=True,
                timeout=180,
            )
            if band.returncode != 0 or not band_png.exists():
                raise RuntimeError("siapkan pita foto gagal")
            paste = subprocess.run(
                [binary, str(out_path), str(band_png), "-gravity", "northwest", "-composite", str(out_path)],
                capture_output=True,
                text=True,
                timeout=180,
            )
            if paste.returncode != 0:
                raise RuntimeError("tempel pita foto gagal")
            # Lelehkan tepi bawah pita ke warna latar supaya tidak terlihat seperti potongan.
            fade = subprocess.run(
                [
                    binary,
                    str(out_path),
                    "(",
                    "-size",
                    f"{SLIDE_WIDTH}x150",
                    "gradient:rgba(17,19,26,0)-rgba(17,19,26,1)",
                    ")",
                    "-gravity",
                    "northwest",
                    "-geometry",
                    f"+0+{PHOTO_BAND_HEIGHT - 150}",
                    "-compose",
                    "over",
                    "-composite",
                    str(out_path),
                ],
                capture_output=True,
                text=True,
                timeout=180,
            )
            if fade.returncode != 0:
                raise RuntimeError("gradien tepi pita gagal")
        except Exception as exc:  # noqa: BLE001 - foto tidak boleh menggagalkan ekspor
            print(f"peringatan: pita foto dilewati ({exc}); memakai render teks.")
        finally:
            band_png.unlink(missing_ok=True)
        return

    if full_bleed and cover is not None:
        overlay_png = out_path.with_name(out_path.stem + "-teks.png")
        base_png = out_path.with_name(out_path.stem + "-foto.png")
        try:
            proc = _render_svg(overlay_png, transparent=True)
            if proc.returncode != 0 or not overlay_png.exists():
                raise RuntimeError("render overlay gagal")
            base = subprocess.run(
                [
                    binary,
                    str(cover),
                    "-resize",
                    f"{SLIDE_WIDTH}x{SLIDE_HEIGHT}^",
                    "-gravity",
                    "center",
                    "-extent",
                    f"{SLIDE_WIDTH}x{SLIDE_HEIGHT}",
                    str(base_png),
                ],
                capture_output=True,
                text=True,
                timeout=180,
            )
            if base.returncode != 0 or not base_png.exists():
                raise RuntimeError("siapkan foto penuh gagal")
            # Scrim gradien: gelap di bawah supaya judul tetap terbaca di atas foto apa pun.
            scrim = subprocess.run(
                [
                    binary,
                    str(base_png),
                    "(",
                    "-size",
                    f"{SLIDE_WIDTH}x{SLIDE_HEIGHT}",
                    "gradient:rgba(7,8,12,0.18)-rgba(7,8,12,0.97)",
                    ")",
                    "-compose",
                    "over",
                    "-composite",
                    str(base_png),
                ],
                capture_output=True,
                text=True,
                timeout=180,
            )
            if scrim.returncode != 0:
                raise RuntimeError("scrim gagal")
            comp = subprocess.run(
                [binary, str(base_png), str(overlay_png), "-gravity", "northwest", "-composite", str(out_path)],
                capture_output=True,
                text=True,
                timeout=180,
            )
            if comp.returncode != 0 or not out_path.exists() or out_path.stat().st_size == 0:
                raise RuntimeError("komposit penuh gagal")
        except Exception as exc:  # noqa: BLE001 - foto eksternal tidak boleh menggagalkan ekspor
            print(f"peringatan: komposit full-bleed dilewati ({exc}); memakai render teks.")
            proc = _render_svg(out_path, transparent=False)
            if proc.returncode != 0 or not out_path.exists() or out_path.stat().st_size == 0:
                detail = (proc.stderr or proc.stdout or "").strip().splitlines()[-3:]
                raise RuntimeError("render PNG gagal: " + " | ".join(detail)[:300])
        finally:
            overlay_png.unlink(missing_ok=True)
            base_png.unlink(missing_ok=True)
        return

    proc = _render_svg(out_path, transparent=False)
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
    photo_mode = TEMPLATE_PHOTO.get(str(document.get("template") or ""), "none")
    cover = (
        fetch_cover(str(document.get("coverImageUrl") or ""), tmp_dir / "cover")
        if photo_mode != "none"
        else None
    )
    for index, slide in enumerate(slides):
        name = slide_filename(index, str(slide.get("kind") or "text"))
        out_path = tmp_dir / name
        svg_text = build_slide_svg(document, index)
        if index == 0 and cover is not None and render is render_png:
            if photo_mode == "full":
                # Foto penuh kanvas, teks SVG transparan digambar di atas scrim.
                render_png(svg_text, out_path, cover=cover, full_bleed=True)
            else:
                # Pita foto di area kosong; seluruh teks berada di bawah pita.
                render_png(svg_text, out_path, cover=cover, photo_band=True)
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
