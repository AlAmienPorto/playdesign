#!/usr/bin/env python3
"""
Playdesign scrape-queue runner.

Polls D1 for pending on-demand scrape requests (created from the CRM UI),
executes the real Google Maps / web UMKM scraper for each one, pushes the
leads to /api/leads/sync, then marks the request done (or failed).

Run every few minutes from a Hermes cron job. Exits quietly when the queue
is empty so it costs nothing on idle ticks.

Usage:
    python3 scrape_queue_runner.py [--max-requests N]
"""

import argparse
import os
import sys
import traceback

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gmaps_lead_scraper import BASE_URL, _headers, scrape_one, sync_leads  # noqa: E402


def list_pending():
    res = requests.get(
        f"{BASE_URL}/api/scrape/requests",
        headers=_headers(),
        params={"workspace": "playdesign"},
        timeout=30,
    )
    res.raise_for_status()
    rows = res.json().get("requests", [])
    return [row for row in rows if row.get("status") == "pending"]


def mark(request_id, status, inserted=None, error=None):
    payload = {"status": status}
    if inserted is not None:
        payload["inserted"] = int(inserted)
    if error:
        payload["error"] = str(error)[:500]
    res = requests.patch(
        f"{BASE_URL}/api/scrape/requests/{request_id}",
        headers=_headers(),
        json=payload,
        timeout=30,
    )
    if not res.ok:
        print(f"[warn] gagal update {request_id}: HTTP {res.status_code} {res.text[:160]}")


def process(request_row):
    request_id = request_row["id"]
    city = request_row.get("city") or ""
    keyword = request_row.get("keyword") or ""
    max_leads = int(request_row.get("max_leads") or 10)

    print(f"\n=== {request_id} | {keyword} @ {city} | target {max_leads} ===")
    mark(request_id, "running")

    try:
        leads = scrape_one(city, keyword, max_leads)
        if not leads:
            mark(request_id, "done", inserted=0, error="Tidak ada kontak baru ditemukan.")
            print(f"[done] {request_id}: 0 lead")
            return 0

        result = sync_leads(leads)
        inserted = int(result.get("inserted") or 0)
        mark(request_id, "done", inserted=inserted)
        print(f"[done] {request_id}: {inserted} lead masuk D1")
        return inserted
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        mark(request_id, "failed", inserted=0, error=f"{type(exc).__name__}: {exc}")
        print(f"[failed] {request_id}: {exc}")
        return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-requests", type=int, default=3)
    args = parser.parse_args()

    pending = list_pending()
    if not pending:
        # Stay silent on idle ticks: no_agent cron delivers stdout verbatim,
        # so printing here would ping the user every 5 minutes.
        return 0

    print(f"[queue] {len(pending)} permintaan menunggu")
    total = 0
    for row in pending[: args.max_requests]:
        total += process(row)
    print(f"[queue] selesai, total {total} lead baru")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
