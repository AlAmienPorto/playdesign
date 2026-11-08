#!/usr/bin/env python3
"""Evaluate Content Radar candidates, generate auto-drafts, and produce digests."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.parse
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Mapping, Protocol

from content_radar_common import ApiClient, ApiError, ConfigError, FileLock, load_config

WIB = dt.timezone(dt.timedelta(hours=7))
UTC = dt.timezone.utc

DEFAULT_SELECTOR_LOCK_PATH = Path.home() / ".cache" / "playdesign" / "content-radar-selector.lock"
DASHBOARD_URL = "https://kantor.playdesign.my.id/#/marketing/content-radar"

AUTO_DRAFT_DAILY_CAP = 3
AUTO_DRAFT_CRYPTO_CAP = 1
MIN_AUTO_DRAFT_SCORE = 75
MIN_SLIDES = 4
MAX_SLIDES = 8

RELEVANCE_VALUES = (0, 8, 13, 18, 21, 25)
POTENTIAL_VALUES = (0, 3, 5, 8, 10)

VALID_RISK_FLAGS = {
    "context_required",
    "disclaimer_required",
    "rumor",
    "defamation",
    "license_conflict",
    "health_claim",
    "financial_claim",
    "investment_solicitation",
    "price_prediction",
    "token_shilling",
    "referral_affiliate",
}

CONTEXTUAL_RISKS = {"context_required", "disclaimer_required"}

BLOCKING_RISK_FLAGS = {
    "rumor",
    "defamation",
    "license_conflict",
    "health_claim",
    "financial_claim",
    "investment_solicitation",
    "price_prediction",
    "token_shilling",
    "referral_affiliate",
}

CREDIBILITY_TABLE: dict[str, int] = {
    "A": 30,
    "B": 26,
    "C": 20,
    "D": 10,
    "unverified": 5,
}

INDONESIAN_LOCAL_KEYWORDS = {
    "indonesia",
    "umkm",
    "desainer",
    "kreatif",
    "bisnis",
    "pengguna digital",
    "pelaku digital",
    "lokal",
    "industri",
}

CRYPTO_DISCLAIMER_KEYWORDS = {
    "bukan nasihat investasi",
    "bukan anjuran investasi",
    "bukan saran investasi",
    "bukan saran finansial",
    "bukan nasihat finansial",
    "bukan rekomendasi finansial",
    "edukasi teknologi",
}

TRACKING_KEYS = {
    "fbclid",
    "gclid",
    "dclid",
    "msclkid",
    "mc_cid",
    "mc_eid",
    "igshid",
    "ref",
    "ref_src",
}


def utc_now() -> dt.datetime:
    return dt.datetime.now(UTC)


class DraftValidationError(ValueError):
    pass


@dataclass(frozen=True)
class Evaluation:
    relevance: int
    carousel_potential: int
    reason: str
    risk_flags: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class RadarScoreResult:
    rubric_version: str
    total: int
    components: dict[str, int]
    input_snapshot: dict[str, Any]


def validate_discrete_evaluation(
    relevance: int,
    carousel_potential: int,
    reason: str,
    risk_flags: list[str] | None = None,
) -> None:
    if relevance not in RELEVANCE_VALUES:
        raise ValueError(
            f"Invalid relevance score {relevance}; must be one of {RELEVANCE_VALUES}"
        )
    if carousel_potential not in POTENTIAL_VALUES:
        raise ValueError(
            f"Invalid carousel potential score {carousel_potential}; must be one of {POTENTIAL_VALUES}"
        )
    if not isinstance(reason, str) or not reason.strip():
        raise ValueError("Evaluation reason must be a non-empty string")
    if len(reason) > 500:
        raise ValueError("Evaluation reason must not exceed 500 characters")
    if risk_flags is not None:
        if not isinstance(risk_flags, list):
            raise ValueError("Evaluation risk flags must be a list")
        for flag in risk_flags:
            if not isinstance(flag, str) or flag not in VALID_RISK_FLAGS:
                raise ValueError(f"Invalid risk flag: {flag}")


def canonicalize_url(url: str) -> str:
    if not isinstance(url, str):
        raise TypeError("URL must be a string")
    parsed = urllib.parse.urlsplit(url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError(f"Invalid HTTP/HTTPS URL: {url}")
    query_tuples = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    filtered = [
        (k, v)
        for k, v in query_tuples
        if not k.lower().startswith("utm_") and k.lower() not in TRACKING_KEYS
    ]
    filtered.sort(key=lambda item: (item[0], item[1]))
    clean_query = urllib.parse.urlencode(filtered)
    clean_path = re.sub(r"/+", "/", parsed.path).rstrip("/")
    if not clean_path:
        clean_path = "/"
    hostname = parsed.hostname.lower()
    port_part = f":{parsed.port}" if parsed.port and parsed.port not in (80, 443) else ""
    netloc = f"{hostname}{port_part}"
    result = urllib.parse.urlunsplit((parsed.scheme, netloc, clean_path, clean_query, ""))
    if clean_path == "/" and not clean_query:
        return result.rstrip("/")
    return result


def _parse_iso_to_utc(iso_str: str) -> dt.datetime:
    clean = iso_str.strip().replace("Z", "+00:00")
    parsed = dt.datetime.fromisoformat(clean)
    return parsed.astimezone(UTC)


def compute_radar_score(snapshot: dict[str, Any]) -> RadarScoreResult:
    relevance = snapshot.get("relevance", 0)
    carousel_potential = snapshot.get("carouselPotential", 0)
    source_tier = str(snapshot.get("sourceTier", "unverified"))
    source_is_primary = bool(snapshot.get("sourceIsPrimary", False))
    raw_flags = snapshot.get("riskFlags", [])
    risk_flags = sorted(set(raw_flags)) if isinstance(raw_flags, list) else []
    cross_checks = snapshot.get("independentCrossChecks", [])
    if not isinstance(cross_checks, list):
        cross_checks = []

    # Credibility
    credibility = CREDIBILITY_TABLE.get(source_tier, 5)

    # Freshness
    default_now = utc_now().strftime("%Y-%m-%dT%H:%M:%SZ")
    as_of = _parse_iso_to_utc(str(snapshot.get("asOf") or default_now))
    published_at_str = snapshot.get("publishedAt")
    discovered_at_str = str(snapshot.get("discoveredAt") or default_now)
    effective_str = published_at_str if published_at_str is not None else discovered_at_str
    effective_dt = _parse_iso_to_utc(effective_str)
    age_hours = (as_of - effective_dt).total_seconds() / 3600.0

    if age_hours < 0 or age_hours > 24:
        freshness = 0
    elif age_hours <= 6:
        freshness = 15
    elif age_hours <= 12:
        freshness = 11
    else:
        freshness = 7

    # Evidence
    # deduplicate cross-checks by domain
    seen_domains: set[str] = set()
    deduped_checks: list[dict[str, str]] = []
    for check in cross_checks:
        if isinstance(check, dict) and check.get("domain"):
            d = str(check["domain"]).strip().lower()
            if d and d not in seen_domains:
                seen_domains.add(d)
                deduped_checks.append({"domain": d, "tier": str(check.get("tier", "unverified"))})

    trusted_count = len([c for c in deduped_checks if c["tier"] in ("B", "C")])
    if source_is_primary and len(deduped_checks) >= 1:
        evidence = 15
    elif source_is_primary or trusted_count >= 2:
        evidence = 11
    elif trusted_count == 1 or source_tier in ("B", "C"):
        evidence = 6
    else:
        evidence = 2

    # Safety
    if not risk_flags:
        safety = 5
    elif all(f in CONTEXTUAL_RISKS for f in risk_flags):
        safety = 3
    else:
        safety = 0

    components = {
        "credibility": credibility,
        "relevance": relevance,
        "freshness": freshness,
        "evidence": evidence,
        "carouselPotential": carousel_potential,
        "safety": safety,
    }
    total = sum(components.values())

    clean_snapshot = dict(snapshot)
    clean_snapshot["rubricVersion"] = "v1"
    clean_snapshot["effectiveTimestamp"] = effective_dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    clean_snapshot["timestampFallback"] = published_at_str is None
    clean_snapshot["timestampValid"] = age_hours >= 0
    clean_snapshot["ageHours"] = age_hours if age_hours >= 0 else None
    clean_snapshot["independentCrossChecks"] = deduped_checks
    clean_snapshot["riskFlags"] = risk_flags

    return RadarScoreResult(
        rubric_version="v1",
        total=total,
        components=components,
        input_snapshot=clean_snapshot,
    )


def is_auto_draft_eligible(candidate: dict[str, Any]) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    score_obj = candidate.get("score") or {}
    snapshot = score_obj.get("inputSnapshot") or candidate.get("score_input_snapshot") or {}
    recomputed = compute_radar_score(snapshot)

    if recomputed.total < MIN_AUTO_DRAFT_SCORE:
        reasons.append("score_below_75")

    canonical_url = candidate.get("canonicalUrl") or candidate.get("canonical_url", "")
    try:
        canonicalize_url(str(canonical_url))
    except (ValueError, TypeError):
        reasons.append("invalid_canonical_url")

    snap = recomputed.input_snapshot
    if not snap.get("timestampValid"):
        reasons.append("future_timestamp")
    elif snap.get("ageHours") is None or snap.get("ageHours", 999) > 24:
        reasons.append("outside_24h_window")

    # Trust route check: source is primary OR at least 2 independent B/C crosschecks
    source_is_primary = snap.get("sourceIsPrimary", False)
    checks = snap.get("independentCrossChecks", [])
    trusted_checks = [c for c in checks if isinstance(c, dict) and c.get("tier") in ("B", "C")]
    if not (source_is_primary or len(trusted_checks) >= 2):
        reasons.append("insufficient_crosscheck")

    if recomputed.components.get("safety", 0) == 0:
        reasons.append("blocking_risk")

    if candidate.get("draftId") or candidate.get("status") == "drafted":
        reasons.append("already_drafted")

    if candidate.get("status") in ("rejected", "archived"):
        reasons.append("candidate_inactive")

    return (len(reasons) == 0, reasons)


def validate_radar_draft(document: dict[str, Any], niche: str) -> None:
    if not isinstance(document, dict):
        raise DraftValidationError("Document must be an object")

    slides = document.get("slides")
    if not isinstance(slides, list) or len(slides) < MIN_SLIDES or len(slides) > MAX_SLIDES:
        raise DraftValidationError(
            f"document.slides must contain {MIN_SLIDES} to {MAX_SLIDES} slides, got {len(slides) if isinstance(slides, list) else 'invalid'}"
        )

    for idx, slide in enumerate(slides):
        if not isinstance(slide, dict):
            raise DraftValidationError(f"Slide {idx} must be an object")
        kind = slide.get("kind", "cover" if idx == 0 else "text")
        if idx == 0 and kind != "cover":
            raise DraftValidationError("First slide must have kind 'cover'")
        title = str(slide.get("title", "")).strip()
        if not title or len(title) > 200:
            raise DraftValidationError(f"Slide {idx} title must be between 1 and 200 characters")
        body = str(slide.get("body", ""))
        if len(body) > 1200:
            raise DraftValidationError(f"Slide {idx} body must not exceed 1200 characters")

    source_url = document.get("sourceUrl")
    if not isinstance(source_url, str):
        raise DraftValidationError("document.sourceUrl must be a string")
    try:
        canonicalize_url(source_url)
    except Exception as exc:
        raise DraftValidationError(f"document.sourceUrl must be a valid HTTP(S) URL: {exc}") from exc

    cover_image_url = document.get("coverImageUrl", "")
    if cover_image_url:
        parsed_img = urllib.parse.urlsplit(cover_image_url)
        # Final media must not use external third-party media assets
        hostname = (parsed_img.hostname or "").lower()
        if not (hostname.endswith("playdesign.my.id") or hostname == "localhost"):
            raise DraftValidationError("Third-party media must not be included as final media")

    caption = str(document.get("caption", "")).strip()
    if not caption:
        raise DraftValidationError("document.caption must not be empty")

    all_bodies = " ".join(str(s.get("body", "")) for s in slides).strip()
    if all_bodies and caption == all_bodies:
        raise DraftValidationError("Caption must not be a repetitive copy of slide text")

    combined_text = (
        caption
        + " "
        + document.get("headline", "")
        + " "
        + " ".join(f"{s.get('title', '')} {s.get('body', '')}" for s in slides)
    ).lower()

    # Must explain local impact for Indonesian creative business/designers/SMEs/digital users in Bahasa Indonesia
    has_local_impact = any(keyword in combined_text for keyword in INDONESIAN_LOCAL_KEYWORDS)
    if not has_local_impact:
        raise DraftValidationError(
            "Draft must explain local impact for Indonesian creative business/designers/SMEs/digital users in Bahasa Indonesia"
        )

    # Crypto disclaimer required
    if niche.lower() == "crypto":
        has_crypto_disclaimer = any(keyword in combined_text for keyword in CRYPTO_DISCLAIMER_KEYWORDS)
        if not has_crypto_disclaimer:
            raise DraftValidationError(
                "Crypto drafts must include an investment disclaimer (e.g. bukan nasihat investasi)"
            )


def generate_draft(
    candidate: dict[str, Any],
    sources: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    niche = str(candidate.get("niche", "technology")).lower()
    title = str(candidate.get("title", "")).strip()
    summary = str(candidate.get("summary", "")).strip() or title
    source_domain = str(candidate.get("sourceDomain", "")).strip()
    source_url = str(candidate.get("canonicalUrl", "")).strip()

    slides = [
        {
            "id": "slide-1",
            "kind": "cover",
            "title": title[:200],
            "body": "Peluang, risiko, dan implikasi strategis bagi ekosistem digital dan bisnis di Indonesia.",
        },
        {
            "id": "slide-2",
            "kind": "text",
            "title": "Apa yang Terjadi?",
            "body": summary[:1200],
        },
        {
            "id": "slide-3",
            "kind": "text",
            "title": "Fakta & Poin Penting",
            "body": f"Berdasarkan informasi terkonfirmasi dari {source_domain}, perkembangan ini menandai perubahan signifikan yang perlu diantisipasi oleh para praktisi.",
        },
        {
            "id": "slide-4",
            "kind": "text",
            "title": "Dampak bagi Bisnis & Desainer Indonesia",
            "body": "Inovasi ini membawa peluang efisiensi nyata bagi pelaku bisnis kreatif, desainer, dan UMKM di Indonesia, sekaligus menuntut kesiapan adaptasi alur kerja digital yang lebih tangguh.",
        },
        {
            "id": "slide-5",
            "kind": "text",
            "title": "Takeaway & Langkah Aksi",
            "body": "1. Pelajari alur adopsi dan integrasikan ke alur kerja tim.\n2. Tinjau kembali standar keamanan dan privasi data.\n3. Uji coba dampak langsung pada produktivitas proyek lokal.",
        },
    ]

    crypto_disclaimer = (
        "\n\nCatatan: Konten ini bertujuan memberikan konteks teknologi dan pasar terkini, bukan nasihat investasi atau saran finansial."
        if niche == "crypto"
        else ""
    )

    caption = (
        f"{title}\n\n"
        "Perubahan teknologi dan tren digital ini memiliki relevansi kuat terhadap arah strategi bisnis kreatif, desainer, dan UMKM di Indonesia. "
        "Simak ringkasan dampak dan langkah aksinya untuk memperkuat daya saing alur kerja Anda."
        f"{crypto_disclaimer}\n\n"
        f"Sumber terverifikasi: {source_url}"
    )

    return {
        "kicker": niche.upper(),
        "template": "split-brand",
        "headline": title[:300],
        "highlight": "Analisis Radar PlayDesign",
        "sourceName": source_domain or "Sumber Primer",
        "sourceUrl": source_url,
        "coverImageUrl": "",
        "slides": slides,
        "caption": caption[:2000],
        "hashtags": [
            "#PlayDesign",
            f"#{niche.capitalize()}",
            "#BisnisKreatif",
            "#UMKMIndonesia",
            "#DesainDigital",
        ],
    }


@dataclass
class SelectorResult:
    run_id: str
    run_time: dt.datetime
    evaluated_count: int
    qualified_count: int
    rejected_count: int
    duplicate_count: int
    crypto_skipped_count: int
    existing_drafts_today: int
    drafts_created: list[dict[str, Any]] = field(default_factory=list)
    errors: list[dict[str, str]] = field(default_factory=list)

    def digest(self) -> str:
        return format_digest(self)


def format_digest(result: SelectorResult) -> str:
    run_time_wib = result.run_time.astimezone(WIB).strftime("%Y-%m-%d %H:%M WIB")
    draft_count = len(result.drafts_created)

    lines: list[str] = [
        "📡 *Content Radar — Daily Selector*",
        f"⏰ Waktu Run: {run_time_wib}",
        f"🎯 Kandidat Memenuhi Syarat (≥75): {result.qualified_count}",
        f"📝 Draft Dibuat: {draft_count} / {AUTO_DRAFT_DAILY_CAP}",
        "",
    ]

    if draft_count == 0:
        lines.append(
            "Tidak ada draft otomatis yang memenuhi syarat hari ini (skor ≥ 75 dan verifikasi sumber)."
        )
    else:
        lines.append("*Draft Terpilih:*")
        for idx, draft in enumerate(result.drafts_created, start=1):
            doc = draft.get("document") or {}
            niche = (doc.get("kicker") or draft.get("niche") or "TECH").upper()
            title = draft.get("title") or doc.get("headline") or "Tanpa Judul"
            score = draft.get("score")
            if score is None:
                score = draft.get("scoreSnapshot") or draft.get("score_snapshot")
            score_val = score if isinstance(score, (int, float)) else (score.get("total") if isinstance(score, dict) else "?")
            source_url = draft.get("sourceUrl") or doc.get("sourceUrl") or draft.get("canonicalUrl") or ""
            lines.append(f"{idx}. *[{niche}]* {title}")
            lines.append(f"   • Skor: {score_val}/100")
            if source_url:
                lines.append(f"   • Sumber: {source_url}")
            lines.append("")

    lines.append("")
    reject_dup = f"🚫 Ditolak / Duplikat: {result.rejected_count} ditolak, {result.duplicate_count} duplikat cluster"
    if result.crypto_skipped_count > 0:
        reject_dup += f", {result.crypto_skipped_count} crypto lewati batas kuota"
    lines.append(reject_dup)
    lines.append(f"🔗 Dashboard: {DASHBOARD_URL}")

    return "\n".join(lines).strip()


class SelectorApi(Protocol):
    def create_run(self, kind: str, meta: dict[str, object] | None = None) -> dict[str, object]: ...
    def update_run(self, run_id: str, **fields: object) -> dict[str, object]: ...
    def list_candidates(
        self,
        *,
        window: int = 24,
        min_score: int = 0,
        status: str | None = None,
        niche: str | None = None,
        tier: str | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> list[dict[str, Any]]: ...
    def get_candidate(self, candidate_id: str) -> dict[str, Any]: ...
    def score_candidate(
        self,
        candidate_id: str,
        relevance: int,
        carousel_potential: int,
        reason: str,
        risk_flags: list[str] | None = None,
    ) -> dict[str, Any]: ...
    def create_draft(self, candidate_id: str, document: dict[str, Any]) -> dict[str, Any]: ...
    def list_drafts(self, *, unimported: bool | None = None) -> list[dict[str, Any]]: ...


class SelectorApiClient(ApiClient):
    def list_candidates(
        self,
        *,
        window: int = 24,
        min_score: int = 0,
        status: str | None = None,
        niche: str | None = None,
        tier: str | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []
        current_offset = offset
        while True:
            params: dict[str, Any] = {
                "workspace": self.workspace_id,
                "window": window,
                "minScore": min_score,
                "limit": limit,
                "offset": current_offset,
            }
            if status is not None:
                params["status"] = status
            if niche is not None:
                params["niche"] = niche
            if tier is not None:
                params["tier"] = tier
            query = urllib.parse.urlencode(params)
            response = self._request("GET", f"/api/content-radar/candidates?{query}")
            page = response.get("candidates")
            pagination = response.get("pagination")
            if not isinstance(page, list):
                raise ApiError("GET", "/api/content-radar/candidates", None, "invalid candidate page")
            candidates.extend(page)
            if not isinstance(pagination, dict) or not pagination.get("hasMore"):
                return candidates
            current_offset += len(page)
            if not page:
                break
        return candidates

    def get_candidate(self, candidate_id: str) -> dict[str, Any]:
        path = f"/api/content-radar/candidates/{urllib.parse.quote(candidate_id, safe='')}?workspace={urllib.parse.quote(self.workspace_id, safe='')}"
        return self._request("GET", path)

    def score_candidate(
        self,
        candidate_id: str,
        relevance: int,
        carousel_potential: int,
        reason: str,
        risk_flags: list[str] | None = None,
    ) -> dict[str, Any]:
        path = f"/api/content-radar/candidates/{urllib.parse.quote(candidate_id, safe='')}/score"
        body = {
            "workspaceId": self.workspace_id,
            "relevance": relevance,
            "carouselPotential": carousel_potential,
            "reason": reason,
            "riskFlags": risk_flags or [],
        }
        return self._request("POST", path, body)

    def create_draft(self, candidate_id: str, document: dict[str, Any]) -> dict[str, Any]:
        path = f"/api/content-radar/candidates/{urllib.parse.quote(candidate_id, safe='')}/draft"
        body = {
            "workspaceId": self.workspace_id,
            "document": document,
        }
        return self._request("POST", path, body)

    def list_drafts(self, *, unimported: bool | None = None) -> list[dict[str, Any]]:
        drafts: list[dict[str, Any]] = []
        current_offset = 0
        limit = 200
        while True:
            params: dict[str, Any] = {
                "workspace": self.workspace_id,
                "limit": limit,
                "offset": current_offset,
            }
            if unimported is not None:
                params["unimported"] = "true" if unimported else "false"
            query = urllib.parse.urlencode(params)
            response = self._request("GET", f"/api/content-radar/drafts?{query}")
            page = response.get("drafts")
            pagination = response.get("pagination")
            if not isinstance(page, list):
                raise ApiError("GET", "/api/content-radar/drafts", None, "invalid draft page")
            drafts.extend(page)
            if not isinstance(pagination, dict) or not pagination.get("hasMore"):
                return drafts
            current_offset += len(page)
            if not page:
                break
        return drafts


def default_evaluator(candidate: dict[str, Any]) -> Evaluation:
    """Heuristic default discrete evaluation if no external evaluator is provided."""
    score = candidate.get("score") or {}
    snapshot = score.get("inputSnapshot") or {}
    rel = snapshot.get("relevance", 21)
    if rel not in RELEVANCE_VALUES:
        rel = 21
    pot = snapshot.get("carouselPotential", 8)
    if pot not in POTENTIAL_VALUES:
        pot = 8
    flags = snapshot.get("riskFlags", [])
    if not isinstance(flags, list):
        flags = []
    clean_flags = [f for f in flags if f in VALID_RISK_FLAGS]
    reason = candidate.get("score_reason") or f"Relevan untuk topik {candidate.get('niche', 'teknologi')} dan audiens PlayDesign"
    return Evaluation(
        relevance=rel,
        carousel_potential=pot,
        reason=str(reason)[:500],
        risk_flags=clean_flags,
    )


class Selector:
    def __init__(
        self,
        api: SelectorApi | ApiClient,
        *,
        now: Callable[[], dt.datetime] = utc_now,
        evaluator: Callable[[dict[str, Any]], Evaluation] | None = None,
        draft_generator: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
        dry_run: bool = False,
    ) -> None:
        if isinstance(api, ApiClient) and not hasattr(api, "list_candidates"):
            self.api: SelectorApi = SelectorApiClient(
                api.base_url,
                getattr(api, "_token"),
                api.workspace_id,
                timeout=api.timeout,
                max_bytes=api.max_bytes,
            )
        else:
            self.api = api  # type: ignore[assignment]
        self.now = now
        self.evaluator = evaluator or default_evaluator
        self.draft_generator = draft_generator or generate_draft
        self.dry_run = dry_run

    def run(self) -> SelectorResult:
        run_record = self.api.create_run("selector", {"windowHours": 24})
        run_id = str(run_record.get("id"))
        result = SelectorResult(
            run_id=run_id,
            run_time=self.now(),
            evaluated_count=0,
            qualified_count=0,
            rejected_count=0,
            duplicate_count=0,
            crypto_skipped_count=0,
            existing_drafts_today=0,
        )

        try:
            self.api.update_run(run_id, status="running")
            now_dt = self.now()
            wib_date = now_dt.astimezone(WIB).strftime("%Y-%m-%d")

            # Check existing automatic drafts today
            existing_drafts = self.api.list_drafts()
            today_auto_drafts: list[dict[str, Any]] = []
            seen_clusters: set[str] = set()

            for d in existing_drafts:
                if d.get("autoDateWib") == wib_date and d.get("creationKind") == "automatic":
                    today_auto_drafts.append(d)
                    if d.get("clusterKey"):
                        seen_clusters.add(str(d["clusterKey"]))

            result.existing_drafts_today = len(today_auto_drafts)
            remaining_daily_quota = max(0, AUTO_DRAFT_DAILY_CAP - len(today_auto_drafts))

            existing_crypto_count = sum(
                1
                for d in today_auto_drafts
                if (
                    str(d.get("niche", "")).lower() == "crypto"
                    or str((d.get("document") or {}).get("kicker", "")).lower() == "crypto"
                )
            )
            remaining_crypto_quota = max(0, AUTO_DRAFT_CRYPTO_CAP - existing_crypto_count)

            # Fetch candidates from the last 24 hours
            candidates = self.api.list_candidates(window=24, min_score=0)
            result.evaluated_count = len(candidates)

            scored_candidates: list[dict[str, Any]] = []

            for cand in candidates:
                cand_id = str(cand["id"])
                # Evaluate using discrete values
                eval_res = self.evaluator(cand)
                validate_discrete_evaluation(
                    eval_res.relevance,
                    eval_res.carousel_potential,
                    eval_res.reason,
                    eval_res.risk_flags,
                )

                score_resp = self.api.score_candidate(
                    cand_id,
                    relevance=eval_res.relevance,
                    carousel_potential=eval_res.carousel_potential,
                    reason=eval_res.reason,
                    risk_flags=eval_res.risk_flags,
                )
                updated_cand = score_resp.get("candidate") or cand
                if score_resp.get("score"):
                    updated_cand["score"] = score_resp["score"]
                    if isinstance(score_resp["score"], dict) and "total" in score_resp["score"]:
                        updated_cand["score_total"] = score_resp["score"]["total"]
                scored_candidates.append(updated_cand)

            # Separate into qualified vs rejected
            qualified_candidates: list[dict[str, Any]] = []
            for cand in scored_candidates:
                eligible, reasons = is_auto_draft_eligible(cand)
                if eligible:
                    qualified_candidates.append(cand)
                else:
                    result.rejected_count += 1

            result.qualified_count = len(qualified_candidates)

            # Sort qualified candidates:
            # 1. Total score DESC
            # 2. Effective timestamp DESC
            # 3. ID ASC
            def sort_key(c: dict[str, Any]) -> tuple[int, float, str]:
                score_obj = c.get("score") or {}
                total = int(score_obj.get("total", c.get("score_total", 0)))
                snap = score_obj.get("inputSnapshot") or {}
                eff_time = str(snap.get("effectiveTimestamp") or c.get("publishedAt") or c.get("discoveredAt") or "")
                cid = str(c.get("id", ""))
                eff_ts = 0.0
                if eff_time:
                    try:
                        eff_ts = _parse_iso_to_utc(eff_time).timestamp()
                    except Exception:
                        eff_ts = 0.0
                return (-total, -eff_ts, cid)

            qualified_candidates.sort(key=sort_key)

            # Select drafts according to quota and clustering rules
            selected_candidates: list[dict[str, Any]] = []
            for cand in qualified_candidates:
                cluster_key = str(cand.get("clusterKey") or cand.get("cluster_key") or cand["id"])
                if cluster_key in seen_clusters:
                    result.duplicate_count += 1
                    continue

                is_crypto = str(cand.get("niche", "")).lower() == "crypto"
                if is_crypto and remaining_crypto_quota <= 0:
                    result.crypto_skipped_count += 1
                    continue

                if len(selected_candidates) >= remaining_daily_quota:
                    break

                selected_candidates.append(cand)
                seen_clusters.add(cluster_key)
                if is_crypto:
                    remaining_crypto_quota -= 1

            # Generate and POST drafts
            for cand in selected_candidates:
                cand_id = str(cand["id"])
                doc = self.draft_generator(cand)
                validate_radar_draft(doc, str(cand.get("niche", "technology")))
                if self.dry_run:
                    draft_data = {
                        "candidateId": cand_id,
                        "title": doc.get("headline", cand.get("title")),
                        "niche": cand.get("niche"),
                        "score": cand.get("score", {}).get("total", cand.get("score_total")),
                        "document": doc,
                        "sourceUrl": cand.get("canonicalUrl") or cand.get("sourceUrl") or doc.get("sourceUrl"),
                    }
                else:
                    draft_resp = self.api.create_draft(cand_id, doc)
                    raw_draft = draft_resp.get("draft")
                    if isinstance(raw_draft, dict):
                        draft_data = dict(raw_draft)
                    else:
                        draft_data = {
                            "candidateId": cand_id,
                            "title": doc.get("headline", cand.get("title")),
                            "document": doc,
                        }
                    if "niche" not in draft_data or not draft_data["niche"]:
                        draft_data["niche"] = cand.get("niche")
                    if "title" not in draft_data or not draft_data["title"]:
                        draft_data["title"] = doc.get("headline", cand.get("title"))
                    if "sourceUrl" not in draft_data or not draft_data["sourceUrl"]:
                        draft_data["sourceUrl"] = cand.get("canonicalUrl") or cand.get("sourceUrl") or doc.get("sourceUrl")
                    if "score" not in draft_data or draft_data["score"] is None:
                        if "scoreSnapshot" in draft_data and isinstance(draft_data["scoreSnapshot"], dict):
                            draft_data["score"] = draft_data["scoreSnapshot"].get("total")
                        elif "score_snapshot" in draft_data and isinstance(draft_data["score_snapshot"], dict):
                            draft_data["score"] = draft_data["score_snapshot"].get("total")
                        elif isinstance(cand.get("score"), dict):
                            draft_data["score"] = cand["score"].get("total", cand.get("score_total"))
                        else:
                            draft_data["score"] = cand.get("score_total")
                result.drafts_created.append(draft_data)

            self.api.update_run(
                run_id,
                status="succeeded",
                meta={
                    "evaluated": result.evaluated_count,
                    "qualified": result.qualified_count,
                    "drafted": len(result.drafts_created),
                    "rejected": result.rejected_count,
                    "duplicates": result.duplicate_count,
                    "cryptoSkipped": result.crypto_skipped_count,
                    "existingDraftsToday": result.existing_drafts_today,
                },
            )
            return result

        except Exception as error:
            try:
                self.api.update_run(
                    run_id,
                    status="failed",
                    error=str(error)[:2000],
                    meta={
                        "evaluated": result.evaluated_count,
                        "drafted": len(result.drafts_created),
                    },
                )
            except Exception:
                pass
            raise


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Content Radar Daily Selector & Draft Generator")
    parser.add_argument("--lock", type=Path, default=DEFAULT_SELECTOR_LOCK_PATH)
    parser.add_argument("--evaluations", type=Path, default=None, help="JSON file with discrete evaluations")
    parser.add_argument("--dry-run", action="store_true", help="Evaluate and print digest without creating drafts")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        config = load_config()
        api = SelectorApiClient(config.api_base_url, config.api_token, config.workspace_id)
        evaluations_map: dict[str, Evaluation] = {}
        if args.evaluations and args.evaluations.exists():
            loaded = json.loads(args.evaluations.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                for k, v in loaded.items():
                    if isinstance(v, dict):
                        evaluations_map[k] = Evaluation(
                            relevance=int(v.get("relevance", 21)),
                            carousel_potential=int(v.get("carouselPotential", 8)),
                            reason=str(v.get("reason", "Evaluasi otomatis")),
                            risk_flags=list(v.get("riskFlags", [])),
                        )

        def custom_evaluator(cand: dict[str, Any]) -> Evaluation:
            cid = str(cand.get("id"))
            if cid in evaluations_map:
                return evaluations_map[cid]
            return default_evaluator(cand)

        with FileLock(args.lock):
            selector = Selector(api, evaluator=custom_evaluator, dry_run=args.dry_run)
            result = selector.run()
    except BlockingIOError:
        return 0
    except (ConfigError, Exception) as error:
        print(
            json.dumps({"status": "failed", "error": str(error)[:500]}, separators=(",", ":")),
            file=sys.stderr,
        )
        return 1

    digest_text = result.digest()
    print(digest_text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
