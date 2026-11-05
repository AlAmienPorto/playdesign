#!/usr/bin/env python3
"""
Playdesign daily follow-up digest.

Reads leads + outreach status from the Worker API and prints a short
Indonesian summary of who needs a WhatsApp nudge (contacted 2+ days ago,
no reply yet). Prints nothing when there is nothing to report, so the
Hermes cron job stays silent on quiet days.

Usage:
    python3 followup_digest.py [--days 2]
"""

import argparse
import os
import sys
from datetime import datetime, timezone

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gmaps_lead_scraper import BASE_URL, _headers  # noqa: E402

REPLIED_STATES = {"replied", "interested", "deal"}
LABEL = {
    "contacted": "sudah dihubungi",
    "replied": "dibalas",
    "interested": "tertarik",
    "not_interested": "tidak tertarik",
    "deal": "deal",
}


def get(path, params=None):
    res = requests.get(f"{BASE_URL}{path}", headers=_headers(), params=params, timeout=30)
    res.raise_for_status()
    return res.json()


def parse_db_date(value):
    """D1 stores datetime('now') as UTC without a zone marker."""
    if not value:
        return None
    text = value if "T" in value else value.replace(" ", "T") + "Z"
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=2)
    args = parser.parse_args()

    outreach = get("/api/outreach", {"workspace": "playdesign"}).get("outreach", [])
    if not outreach:
        return 0

    now = datetime.now(timezone.utc)
    stale = []
    for row in outreach:
        if row.get("status") != "contacted":
            continue
        contacted = parse_db_date(row.get("contactedAt"))
        if not contacted:
            continue
        age = (now - contacted).days
        if age >= args.days:
            stale.append((age, row))

    counts = {}
    for row in outreach:
        counts[row.get("status", "contacted")] = counts.get(row.get("status", "contacted"), 0) + 1

    if not stale:
        return 0

    stale.sort(key=lambda item: -item[0])
    lines = [f"Follow up WhatsApp — {len(stale)} lead belum dibalas"]
    for age, row in stale[:10]:
        parts = [row.get("company") or row.get("leadName") or "Tanpa nama"]
        meta = [row.get("category"), row.get("city")]
        meta = [m for m in meta if m]
        if meta:
            parts.append(f"({', '.join(meta)})")
        parts.append(f"— {age} hari")
        lines.append("• " + " ".join(parts))
    if len(stale) > 10:
        lines.append(f"… dan {len(stale) - 10} lead lain.")

    summary = ", ".join(f"{LABEL.get(k, k)}: {v}" for k, v in sorted(counts.items()))
    lines.append("")
    lines.append(f"Total tercatat: {len(outreach)} lead ({summary}).")
    lines.append("Buka CRM → Lead Scraper untuk kirim pesan dan update status.")

    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
