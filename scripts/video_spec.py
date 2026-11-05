"""Normalisasi VideoSpec v1 untuk runner.

Cermin dari `src/lib/video-spec.ts`. Dua tempat ini harus sepakat soal batas
nilai; kalau salah satu berubah, ubah keduanya. Fungsi di sini sengaja tidak
mengimpor apa pun dari proyek web supaya runner tetap bisa jalan sendiri.
"""

from __future__ import annotations

import re
from typing import Any

SCENE_LIMIT = 24
SCENE_KINDS = {"title", "statement", "list", "quote", "cta", "image", "video"}
TRANSITIONS = {"cut", "fade", "slide", "wipe"}
PRESETS = {"cinematic", "realistic", "anime", "documentary", "commercial", "custom"}
CAMERAS = {"static", "push-in", "pull-out", "pan-left", "pan-right", "handheld"}
LIGHTING = {"soft", "hard", "backlit", "natural"}
GRADES = {"neutral", "warm", "cool", "mono"}
PACING = {"slow", "medium", "fast"}
ROLES = {"style", "motion", "subject", "music", "sfx"}
ASPECTS = {
    "9:16": (1080, 1920),
    "16:9": (1920, 1080),
    "1:1": (1080, 1080),
}

PRESET_STYLE: dict[str, dict[str, Any]] = {
    "cinematic": dict(bg="#0b1020", accent="#22d3ee", ink="#f8fafc", grade="cool", camera="push-in",
                      lighting="backlit", transition="fade", pacing="slow", type_scale=1.06),
    "realistic": dict(bg="#f6f3ef", accent="#b4532a", ink="#1c1917", grade="neutral", camera="static",
                      lighting="natural", transition="cut", pacing="medium", type_scale=1.0),
    "anime": dict(bg="#1b1035", accent="#f472b6", ink="#fdf4ff", grade="warm", camera="pan-right",
                  lighting="hard", transition="slide", pacing="fast", type_scale=1.12),
    "documentary": dict(bg="#141414", accent="#eab308", ink="#fafafa", grade="mono", camera="handheld",
                        lighting="natural", transition="cut", pacing="slow", type_scale=1.02),
    "commercial": dict(bg="#111827", accent="#f97316", ink="#ffffff", grade="warm", camera="push-in",
                       lighting="hard", transition="wipe", pacing="fast", type_scale=1.1),
    "custom": dict(bg="#0b1020", accent="#22d3ee", ink="#f8fafc", grade="neutral", camera="static",
                   lighting="soft", transition="fade", pacing="medium", type_scale=1.0),
}


def _num(raw: Any, fallback: float) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return fallback
    return value if value == value else fallback  # NaN


def _clamp(value: float, low: float, high: float) -> float:
    return min(max(value, low), high)


def _text(raw: Any, fallback: str = "") -> str:
    return raw if isinstance(raw, str) else fallback


def _pick(raw: Any, allowed: set[str], fallback: str) -> str:
    return raw if isinstance(raw, str) and raw in allowed else fallback


def _new_id(prefix: str = "sc") -> str:
    import secrets

    return f"{prefix}-{secrets.token_hex(3)}"


def normalize(raw: Any) -> dict[str, Any] | None:
    """Kembalikan spec yang sudah dinormalisasi, atau None kalau bukan objek."""
    if not isinstance(raw, dict) or not raw:
        return None

    def _obj(container: Any, key: str) -> dict[str, Any]:
        value = container.get(key) if isinstance(container, dict) else None
        return value if isinstance(value, dict) else {}

    style_raw: dict[str, Any] = _obj(raw, "style")
    render_raw: dict[str, Any] = _obj(raw, "render")
    audio_raw: dict[str, Any] = _obj(raw, "audio")
    voice_raw: dict[str, Any] = _obj(audio_raw, "voice")
    music_raw: dict[str, Any] = _obj(audio_raw, "music")
    sub_raw: dict[str, Any] = _obj(raw, "subtitle")

    preset = _pick(style_raw.get("preset"), PRESETS, "cinematic")
    base = PRESET_STYLE[preset]

    aspect = _pick(render_raw.get("aspect"), set(ASPECTS), "9:16")
    default_w, default_h = ASPECTS[aspect]

    scenes_raw = raw.get("scenes") if isinstance(raw.get("scenes"), list) else []
    scenes: list[dict[str, Any]] = []
    for item in scenes_raw[:SCENE_LIMIT]:
        if not isinstance(item, dict):
            continue
        scenes.append(
            {
                "id": _text(item.get("id")) or _new_id(),
                "kind": _pick(item.get("kind"), SCENE_KINDS, "statement"),
                "durationSec": _clamp(_num(item.get("durationSec"), 4), 0.5, 30),
                "title": _text(item.get("title")),
                "body": _text(item.get("body")),
                "items": [str(x) for x in (item.get("items") or [])][:8] if isinstance(item.get("items"), list) else [],
                "media": item.get("media") if isinstance(item.get("media"), dict) else None,
                "transitionIn": _pick(item.get("transitionIn"), TRANSITIONS, base["transition"]),
            }
        )

    refs_raw = raw.get("references") if isinstance(raw.get("references"), list) else []
    references = []
    for ref in refs_raw[:8]:
        if not isinstance(ref, dict):
            continue
        references.append(
            {
                "id": _text(ref.get("id")) or _new_id("ref"),
                "kind": _pick(ref.get("kind"), {"image", "video", "audio"}, "image"),
                "name": _text(ref.get("name"), "referensi"),
                "role": _pick(ref.get("role"), ROLES, "style"),
                "strength": None if ref.get("strength") is None else _clamp(_num(ref.get("strength"), 0.6), 0, 1),
                "url": _text(ref.get("url")) or None,
                "driveFileId": _text(ref.get("driveFileId")) or None,
                "note": _text(ref.get("note")) or None,
            }
        )

    scene_total = sum(scene["durationSec"] for scene in scenes)
    duration = _clamp(scene_total or _num(render_raw.get("durationSec"), 15), 3, 120)

    sfx_raw = audio_raw.get("sfx") if isinstance(audio_raw.get("sfx"), list) else []
    sfx = [
        {
            "refId": _text(item.get("refId")),
            "atSec": _clamp(_num(item.get("atSec"), 0), 0, 120),
            "volume": _clamp(_num(item.get("volume"), 60), 0, 100),
        }
        for item in sfx_raw[:12]
        if isinstance(item, dict)
    ]

    return {
        "version": 1,
        "prompt": _text(raw.get("prompt"))[:2000],
        "negativePrompt": _text(raw.get("negativePrompt"))[:800],
        "style": {
            "preset": preset,
            "bg": _text(style_raw.get("bg"), base["bg"]),
            "accent": _text(style_raw.get("accent"), base["accent"]),
            "ink": _text(style_raw.get("ink"), base["ink"]),
            "grade": _pick(style_raw.get("grade"), GRADES, base["grade"]),
            "camera": _pick(style_raw.get("camera"), CAMERAS, base["camera"]),
            "lighting": _pick(style_raw.get("lighting"), LIGHTING, base["lighting"]),
            "transition": _pick(style_raw.get("transition"), TRANSITIONS, base["transition"]),
            "pacing": _pick(style_raw.get("pacing"), PACING, base["pacing"]),
            "typeScale": _clamp(_num(style_raw.get("typeScale"), base["type_scale"]), 0.8, 1.4),
            "fontFamily": _text(style_raw.get("fontFamily"), "Inter, system-ui, sans-serif"),
        },
        "scenes": scenes,
        "references": references,
        "audio": {
            "voice": {
                "enabled": voice_raw.get("enabled") is not False,
                "provider": "edge",
                "voiceId": _text(voice_raw.get("voiceId"), "id-ID-GadisNeural"),
                "lang": _text(voice_raw.get("lang"), "id-ID"),
                "rate": _clamp(_num(voice_raw.get("rate"), 0), -50, 50),
                "pitch": _clamp(_num(voice_raw.get("pitch"), 0), -50, 50),
            },
            "script": _text(audio_raw.get("script"))[:4000],
            "music": {
                "enabled": music_raw.get("enabled") is True,
                "refId": _text(music_raw.get("refId")) or None,
                "volume": _clamp(_num(music_raw.get("volume"), 22), 0, 100),
                "fadeOutSec": _clamp(_num(music_raw.get("fadeOutSec"), 1.5), 0, 10),
            },
            "sfx": sfx,
            "ducking": audio_raw.get("ducking") is not False,
        },
        "subtitle": {
            "enabled": sub_raw.get("enabled") is not False,
            "source": _pick(sub_raw.get("source"), {"tts", "script"}, "tts"),
            "fontSizePct": _clamp(_num(sub_raw.get("fontSizePct"), 4.2), 2, 9),
            "position": _pick(sub_raw.get("position"), {"bottom", "center", "top"}, "bottom"),
            "boxed": sub_raw.get("boxed") is not False,
        },
        "render": {
            "aspect": aspect,
            "width": int(_clamp(_num(render_raw.get("width"), default_w), 320, 2160)),
            "height": int(_clamp(_num(render_raw.get("height"), default_h), 320, 2160)),
            "fps": int(round(_clamp(_num(render_raw.get("fps"), 30), 24, 60))),
            "durationSec": duration,
            "upload": render_raw.get("upload") is not False,
            "compositionId": _text(render_raw.get("compositionId"), "Story"),
        },
    }


def narration(spec: dict[str, Any]) -> str:
    """Teks yang dibacakan: script kalau ada, kalau tidak gabungan isi scene."""
    script = (spec.get("audio") or {}).get("script") or ""
    if script.strip():
        return script.strip()
    parts: list[str] = []
    for scene in spec.get("scenes") or []:
        chunk = " ".join(
            [x for x in [scene.get("title"), scene.get("body"), *scene.get("items", [])] if x]
        ).strip()
        if chunk:
            parts.append(chunk if chunk.endswith((".", "!", "?")) else chunk + ".")
    return " ".join(parts).strip()


def total_seconds(spec: dict[str, Any]) -> float:
    return sum(float(scene.get("durationSec") or 0) for scene in spec.get("scenes") or [])


_SRT_TIME = re.compile(r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})")


def _srt_ms(stamp: str) -> int:
    match = _SRT_TIME.search(stamp)
    if not match:
        return 0
    hours, minutes, seconds, millis = (int(part) for part in match.groups())
    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis


def parse_srt(raw: str) -> list[dict[str, Any]]:
    """SRT -> cue untuk komposisi Remotion."""
    cues: list[dict[str, Any]] = []
    for block in re.split(r"\n\s*\n", raw.strip()):
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if len(lines) < 2:
            continue
        timing = next((line for line in lines if "-->" in line), None)
        if not timing:
            continue
        start_raw, end_raw = timing.split("-->")
        text = " ".join(line for line in lines if "-->" not in line and not line.isdigit())
        if not text:
            continue
        cues.append({"startMs": _srt_ms(start_raw), "endMs": _srt_ms(end_raw), "text": text})
    return cues
