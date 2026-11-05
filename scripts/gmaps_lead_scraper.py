#!/usr/bin/env python3
"""
Playdesign GMaps WhatsApp Lead Scraper - Jawa Tengah

Automated scanner for MSME/UMKM contacts in Central Java without websites,
extracting verified WhatsApp numbers and pushing them to Cloudflare D1 / API.

Exposed functions
-----------------
scrape_one(city, keyword, max_leads)  -> list[dict]   (single city + keyword)
sync_leads(leads)                     -> dict         (POST /api/leads/sync)
run_scraper(max_leads)                -> list[dict]   (daily full sweep)

The API token is read from the API_TOKEN env var, or from .dev.vars next to
this repo. It is never hardcoded in source.
"""

import json
import os
import re
import subprocess
import sys
import time

import requests

AGENT_REACH_BIN = os.path.expanduser("~/.local/bin/agent-reach")

CITIES = [
    "Semarang", "Surakarta Solo", "Tegal", "Magelang", "Pekalongan",
    "Klaten", "Boyolali", "Cilacap", "Pati", "Kudus", "Rembang",
]

KEYWORDS = [
    "katering harian", "konveksi kaos", "pengrajin batik", "bengkel motor",
    "pabrik kerupuk", "toko kelontong", "mebel kayu", "percetakan sablon",
    "laundry kiloan", "jasa las", "distributor sembako", "toko pakan ternak",
]


def _load_token() -> str:
    """Resolve the office API token without hardcoding it."""
    token = os.environ.get("API_TOKEN", "").strip()
    if token:
        return token

    candidates = [
        os.environ.get("PLAYDESIGN_DEV_VARS", ""),
        os.path.expanduser("~/work/playdesign/.dev.vars"),
        os.path.expanduser("~/.hermes/playdesign.dev.vars"),
    ]
    for path in candidates:
        if not path or not os.path.isfile(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as handle:
                for line in handle:
                    line = line.strip()
                    if line.startswith("API_TOKEN="):
                        return line.split("=", 1)[1].strip().strip('"').strip("'")
        except OSError:
            continue
    return ""


API_TOKEN = _load_token()
BASE_URL = os.environ.get("BASE_URL", "https://kantor.playdesign.my.id")


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {API_TOKEN}",
        "Content-Type": "application/json",
        "x-actor-id": "ja",
        # Cloudflare menolak User-Agent default Python (error 1010) — pakai UA eksplisit.
        "User-Agent": "playdesign-runner/1.0",
    }


def search_leads_web(query: str, limit: int = 5):
    """Search for UMKM entries via agent-reach (web/exa search)."""
    if os.path.isfile(AGENT_REACH_BIN):
        try:
            cmd = [AGENT_REACH_BIN, "web", "search", query, "--limit", str(limit)]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
            if res.returncode == 0:
                data = json.loads(res.stdout)
                if data.get("ok") and data.get("items"):
                    return data["items"]
        except Exception as exc:  # noqa: BLE001
            print(f"[WARN] agent-reach error: {exc}", file=sys.stderr)
    return []


def extract_phone_and_wa(text: str):
    """Find an Indonesian phone number in free text."""
    patterns = [
        r"(?:\+62|62|0)8[1-9][0-9]{7,11}",
        r"08[0-9]{2}[-\s]?[0-9]{4}[-\s]?[0-9]{3,4}",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            clean = re.sub(r"\D", "", match.group(0))
            if clean.startswith("08"):
                clean = "62" + clean[1:]
            elif clean.startswith("8"):
                clean = "62" + clean
            if 10 <= len(clean) <= 15:
                return clean
    return None


IG_RESERVED = {"p", "reel", "reels", "explore", "accounts", "stories", "tv", "share"}


def extract_instagram(*texts: str):
    """Pull an Instagram handle out of a URL or snippet. Returns '@handle' or None."""
    pattern = re.compile(r"(?:https?://)?(?:www\.)?instagram\.com/([A-Za-z0-9_.]{2,30})", re.I)
    for text in texts:
        if not text:
            continue
        match = pattern.search(text)
        if match:
            handle = match.group(1).strip(".").lower()
            if handle not in IG_RESERVED and len(handle) > 1:
                return f"@{handle}"
    return None


def classify_source(url: str) -> str:
    """Which kind of page did this lead come from? Drives the badge in the UI."""
    low = (url or "").lower()
    if any(
        token in low
        for token in (
            "maps.google",
            "google.com/maps",
            "google.co.id/maps",
            "goo.gl/maps",
            "maps.app.goo.gl",
        )
    ):
        return "gmaps"
    if "instagram.com" in low:
        return "instagram"
    return "website"



GENERIC_TOKENS = {
    "catering", "konveksi", "kaos", "batik", "laundry", "bengkel", "toko", "jasa",
    "pabrik", "distributor", "umkm", "indonesia", "jawa", "tengah", "harian",
    "murah", "terdekat", "sablon", "percetakan", "mebel", "kerupuk", "sembako",
    "kelontong", "pakan", "ternak", "las", "motor", "resmi", "official", "online",
    "semarang", "surakarta", "solo", "tegal", "magelang", "pekalongan", "klaten",
    "boyolali", "cilacap", "pati", "kudus", "rembang",
}


def _tokens(text: str):
    return {t for t in re.split(r"[^a-z0-9]+", (text or "").lower()) if len(t) >= 4}


def find_instagram(company: str, city: str):
    """Look for an IG profile whose name shares a distinctive word with the company.

    Conservative on purpose: attaching the wrong Instagram account would make the
    lead less trustworthy, not more. Needs a non-generic word to match.
    """
    distinctive = _tokens(company) - GENERIC_TOKENS
    if not distinctive:
        return None
    items = search_leads_web(f'"{company}" {city} instagram', limit=4)
    for item in items:
        url = item.get("url") or ""
        if "instagram.com" not in url:
            continue
        handle = extract_instagram(url)
        if not handle:
            continue
        haystack = _tokens(f"{item.get('title', '')} {handle}") - GENERIC_TOKENS
        if haystack & distinctive:
            return handle
    return None


def scrape_one(city: str, keyword: str, max_leads: int = 10):
    """Scrape a single (city, keyword) pair. Returns deduplicated lead dicts."""
    city = (city or "").strip()
    keyword = (keyword or "").strip()
    if not city or not keyword:
        return []

    query = f"{keyword} {city} nomor whatsapp kontak telepon tanpa website"
    print(f"[scrape] '{keyword}' in {city} (target {max_leads})")
    items = search_leads_web(query, limit=max(4, max_leads * 2))

    found = []
    for item in items:
        title = item.get("title", "") or ""
        snippet = item.get("text", "") or ""
        url = item.get("url", "") or ""

        # Skip corporate domains that clearly already own a website.
        if any(ext in url for ext in [".co.id", ".com/about", ".com/company"]):
            continue

        # A lead without a source page cannot be verified, so it is not a lead.
        if not url.startswith("http"):
            continue

        phone = extract_phone_and_wa(f"{title} {snippet}")
        if not phone:
            continue

        company_name = title.split("-")[0].split("|")[0].strip() or f"UMKM {city}"
        if len(company_name) > 40:
            company_name = company_name[:40]

        if any(lead["phone"] == phone for lead in found):
            continue

        source_type = classify_source(url)
        instagram = extract_instagram(url, snippet)

        found.append(
            {
                "name": company_name,
                "company": company_name,
                "location": f"{city}, Jawa Tengah",
                "category": keyword,
                "fullAddress": f"{city}, Jawa Tengah, Indonesia",
                "phone": phone,
                "sourceUrl": url,
                "sourceType": source_type,
                "googleMapsUrl": url if source_type == "gmaps" else None,
                "instagram": instagram,
            }
        )
        print(f"  + {company_name} (WA +{phone}) <- {source_type}: {url[:70]}")
        if len(found) >= max_leads:
            break

    # Best-effort Instagram profile for the first few leads (verification aid).
    for lead in found[:3]:
        if lead.get("instagram"):
            continue
        handle = find_instagram(lead["company"], city)
        if handle:
            lead["instagram"] = handle
            print(f"  ~ IG {handle} untuk {lead['company']}")

    return found


def sync_leads(leads):
    """Push leads to the Worker. Returns the parsed response."""
    if not leads:
        return {"ok": True, "inserted": 0, "errors": []}
    if not API_TOKEN:
        raise RuntimeError("API_TOKEN tidak ditemukan (env atau .dev.vars).")

    res = requests.post(
        f"{BASE_URL}/api/leads/sync",
        headers=_headers(),
        json={"leads": leads},
        timeout=60,
    )
    print(f"[sync] HTTP {res.status_code}")
    try:
        payload = res.json()
    except ValueError:
        payload = {"ok": False, "error": res.text[:200]}
    print(f"[sync] {json.dumps(payload, ensure_ascii=False)}")
    return payload


def run_scraper(max_leads: int = 15):
    """Daily full sweep across all cities and the top keywords."""
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Daily Jawa Tengah sweep...")
    scraped = []

    for city in CITIES:
        if len(scraped) >= max_leads:
            break
        for keyword in KEYWORDS[:3]:
            remaining = max_leads - len(scraped)
            if remaining <= 0:
                break
            batch = scrape_one(city, keyword, remaining)
            for lead in batch:
                if not any(existing["phone"] == lead["phone"] for existing in scraped):
                    scraped.append(lead)
            time.sleep(1)

    print(f"[daily] total {len(scraped)} leads")
    sync_leads(scraped)
    return scraped


if __name__ == "__main__":
    count = 10
    if len(sys.argv) > 1:
        try:
            count = int(sys.argv[1])
        except ValueError:
            pass
    run_scraper(max_leads=count)
