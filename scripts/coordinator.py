#!/usr/bin/env python3
"""
Playdesign coordinator — satu buku kerja untuk semua pipeline.

Tugasnya bukan menggantikan runner, tapi mengawasi mereka: membaca keadaan
nyata dari D1/API, memutuskan mana yang perlu ditindak, menjalankan tindakan
yang aman (idempoten), lalu melapor hanya kalau ada yang perlu diketahui
manusia.

Pipeline yang diawasi
---------------------
video   : video_jobs      (antre -> render -> upload -> selesai)
scrape  : scrape_requests (pending -> running -> done)
agent   : runs            (queued -> running -> owner_review)

Perintah
--------
status   tampilkan keadaan sekarang (tanpa tindakan)
sweep    deteksi + bertindak + catat alert; senyap kalau semua sehat
report   ringkasan lengkap untuk digest harian
json     keluaran mentah untuk debugging

Ambang waktu dan jumlah percobaan ada di DEFAULT_THRESHOLDS / MAX_ATTEMPTS.
Semua keputusan di `analyze()` murni (tanpa jaringan) supaya bisa diuji.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

WORKSPACE = "playdesign"
D1_NAME = "office-crm"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERMES_SCRIPTS = os.path.expanduser("~/.hermes/scripts")

DEFAULT_THRESHOLDS = {
    "video_queued_min": 10,
    "video_active_min": 25,
    "scrape_pending_min": 15,
    "scrape_running_min": 20,
    "run_queued_min": 30,
}

MAX_ATTEMPTS = 2

# Kegagalan yang tidak layak diulang otomatis: masalah akses butuh manusia,
# dan job yang sudah lama mati biasanya brief-nya sudah tidak relevan.
AUTH_MARKERS = ("401", "403", "unauthorized", "forbidden", "invalid token")
RETRY_WINDOW_MIN = 180

# Batas job video per jam di Worker; koordinator memperingatkan sebelum kena 429.
QUOTA_PER_HOUR = 10
QUOTA_WARN_AT = 8

SEVERITY_RANK = {"critical": 0, "warn": 1, "info": 2}
SEVERITY_MARK = {"critical": "🔴", "warn": "🟠", "info": "🔵"}

ACTION_HINT = {
    "run_video_runner": "runner render dinyalakan",
    "requeue_video": "dikembalikan ke antrean",
    "fail_stalled": "ditandai gagal",
    "run_scrape_runner": "runner scrape dinyalakan",
    "fail_scrape": "ditandai gagal",
    "run_executor": "executor dinyalakan",
}

SPAWN_JOBS = {
    "run_video_runner": ("video_render_runner.py", "video_render_runner.py"),
    "run_scrape_runner": ("scrape_queue_runner.py", "scrape_queue_runner.py"),
    "run_executor": ("run_executor.py", "hermes_run_executor.py"),
}


# --------------------------------------------------------------------------
# waktu
# --------------------------------------------------------------------------
def parse_ts(value):
    """Terima `YYYY-MM-DD HH:MM:SS` (D1) maupun ISO-8601; anggap UTC."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    text = text.replace("Z", "+00:00")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S.%f"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def age_minutes(value, now):
    stamp = parse_ts(value)
    if stamp is None:
        return None
    return max(0.0, (now - stamp).total_seconds() / 60.0)


# --------------------------------------------------------------------------
# temuan
# --------------------------------------------------------------------------
@dataclass(frozen=True)
class Finding:
    pipeline: str
    ref: str
    kind: str
    severity: str
    message: str
    action: str | None = None

    @property
    def key(self):
        return f"{self.kind}:{self.ref}"


def _video_findings(row, now, th):
    status = str(row.get("status") or "").lower()
    job_id = str(row.get("id") or "?")
    attempts = int(row.get("attempts") or 0)
    error = str(row.get("error") or "").strip()

    if status == "queued":
        age = age_minutes(row.get("createdAt") or row.get("created_at"), now)
        if age is not None and age >= th["video_queued_min"]:
            return [
                Finding(
                    "video",
                    job_id,
                    "video_queued",
                    "warn",
                    f"{job_id} menunggu {age:.0f} menit di antrean render",
                    "run_video_runner",
                )
            ]
        return []

    if status in ("rendering", "uploading"):
        age = age_minutes(
            row.get("startedAt") or row.get("started_at") or row.get("createdAt"), now
        )
        if age is not None and age >= th["video_active_min"]:
            return [
                Finding(
                    "video",
                    job_id,
                    "video_stalled",
                    "critical",
                    f"{job_id} macet: {status} {age:.0f} menit tanpa progres",
                    "fail_stalled",
                )
            ]
        return []

    if status == "failed":
        short = error[:80] or "tanpa pesan"
        if any(marker in error.lower() for marker in AUTH_MARKERS):
            return [
                Finding(
                    "video",
                    job_id,
                    "video_auth",
                    "critical",
                    f"{job_id} gagal karena akses: {short} — periksa token, tidak diulang otomatis",
                    None,
                )
            ]
        if "429" in error or "rate_limited" in error or "quota" in error.lower():
            return [
                Finding(
                    "video",
                    job_id,
                    "video_quota",
                    "warn",
                    f"{job_id} gagal karena kuota (429) — sengaja tidak diulang otomatis",
                    None,
                )
            ]
        if attempts >= MAX_ATTEMPTS:
            return [
                Finding(
                    "video",
                    job_id,
                    "video_failed",
                    "critical",
                    f"{job_id} gagal {attempts}× — perlu keputusan: {short}",
                    None,
                )
            ]
        age = age_minutes(
            row.get("finishedAt") or row.get("startedAt") or row.get("createdAt"), now
        )
        if age is not None and age > RETRY_WINDOW_MIN:
            return [
                Finding(
                    "video",
                    job_id,
                    "video_stale",
                    "critical",
                    f"{job_id} gagal {age / 60:.0f} jam lalu ({short}) — brief basi, tidak diulang otomatis",
                    None,
                )
            ]
        return [
            Finding(
                "video",
                job_id,
                "video_failed",
                "warn",
                f"{job_id} gagal (percobaan {attempts + 1}/{MAX_ATTEMPTS}): {short}",
                "requeue_video",
            )
        ]

    return []


def _scrape_findings(row, now, th):
    status = str(row.get("status") or "").lower()
    req_id = str(row.get("id") or "?")
    label = f"{row.get('city') or '?'} / {row.get('keyword') or '?'}"

    if status == "pending":
        age = age_minutes(row.get("requestedAt") or row.get("requested_at"), now)
        if age is not None and age >= th["scrape_pending_min"]:
            return [
                Finding(
                    "scrape",
                    req_id,
                    "scrape_pending",
                    "warn",
                    f"Scrape {label} menunggu {age:.0f} menit",
                    "run_scrape_runner",
                )
            ]
    if status == "running":
        age = age_minutes(row.get("startedAt") or row.get("started_at"), now)
        if age is not None and age >= th["scrape_running_min"]:
            return [
                Finding(
                    "scrape",
                    req_id,
                    "scrape_stalled",
                    "critical",
                    f"Scrape {label} macet {age:.0f} menit",
                    "fail_scrape",
                )
            ]
    return []


def _run_findings(row, now, th):
    state = str(row.get("state") or row.get("status") or "").lower()
    run_id = str(row.get("id") or "?")
    if state == "queued":
        age = age_minutes(row.get("startedAt") or row.get("started_at") or row.get("createdAt"), now)
        if age is not None and age >= th["run_queued_min"]:
            return [
                Finding(
                    "agent",
                    run_id,
                    "run_queued",
                    "warn",
                    f"Run agent {run_id} menunggu {age:.0f} menit",
                    "run_executor",
                )
            ]
    return []


def expected_minutes(job):
    """Perkiraan jarak antar-jadwal sebuah cron job, dalam menit."""
    schedule = job.get("schedule") or {}
    kind = schedule.get("kind")
    if kind == "interval":
        minutes = schedule.get("minutes")
        return int(minutes) if minutes else None
    if kind == "cron":
        parts = str(schedule.get("expr") or "").split()
        if len(parts) >= 2:
            minute, hour = parts[0], parts[1]
            if minute.startswith("*/") and minute[2:].isdigit():
                return int(minute[2:])
            if minute.isdigit() and hour.isdigit():
                return 1440
    return None


def _cron_findings(job, now):
    """Cron yang berhenti memanggil skripnya adalah kegagalan senyap."""
    if not job.get("enabled", True) or job.get("state") != "scheduled":
        return []
    expected = expected_minutes(job)
    if not expected:
        return []
    age = age_minutes(job.get("last_run_at"), now)
    if age is None:
        return []  # belum pernah jalan; bukan urusan koordinator
    limit = max(expected * 3, 15)
    if age <= limit:
        return []
    name = job.get("name") or job.get("id") or "?"
    return [
        Finding(
            "cron",
            str(job.get("id") or name),
            "cron_stale",
            "critical",
            f"cron '{name}' tidak jalan {age:.0f} menit (jadwal {expected} menit)",
            None,
        )
    ]


def analyze(state, now=None, thresholds=None):
    """Kembalikan daftar Finding terurut: critical dulu, lalu warn."""
    now = now or datetime.now(timezone.utc)
    th = {**DEFAULT_THRESHOLDS, **(thresholds or {})}

    findings = []
    for row in state.get("video") or []:
        findings.extend(_video_findings(row, now, th))
    for row in state.get("scrape") or []:
        findings.extend(_scrape_findings(row, now, th))
    for row in state.get("runs") or []:
        findings.extend(_run_findings(row, now, th))
    for job in state.get("cron") or []:
        findings.extend(_cron_findings(job, now))

    recent = [
        row
        for row in state.get("video") or []
        if (age_minutes(row.get("createdAt") or row.get("created_at"), now) or 1e9) <= 60
    ]
    if len(recent) >= QUOTA_WARN_AT:
        severity = "warn" if len(recent) >= QUOTA_PER_HOUR else "info"
        findings.append(
            Finding(
                "video",
                "quota-1h",
                "video_quota_budget",
                severity,
                f"kuota video {len(recent)}/{QUOTA_PER_HOUR} terpakai dalam 1 jam terakhir",
                None,
            )
        )

    seen = set()
    unique = []
    for finding in findings:
        if finding.key in seen:
            continue
        seen.add(finding.key)
        unique.append(finding)

    unique.sort(key=lambda f: (SEVERITY_RANK.get(f.severity, 9), f.pipeline, f.ref))
    return unique


# --------------------------------------------------------------------------
# format
# --------------------------------------------------------------------------
def format_finding(finding):
    mark = SEVERITY_MARK.get(finding.severity, "•")
    hint = ACTION_HINT.get(finding.action or "")
    return f"{mark} {finding.message}" + (f" → {hint}" if hint else "")


def format_alert(findings):
    return "\n".join(format_finding(f) for f in findings)


def _count(rows, statuses):
    return sum(1 for row in rows if str(row.get("status") or row.get("state") or "").lower() in statuses)


def format_status(state, findings, now=None):
    now = now or datetime.now(timezone.utc)
    video = state.get("video") or []
    scrape = state.get("scrape") or []
    runs = state.get("runs") or []

    lines = [f"📋 Koordinator Playdesign — {now.strftime('%d %b %Y %H:%M')} UTC", ""]
    lines.append(
        "Video  : "
        f"{_count(video, {'queued'})} antre · "
        f"{_count(video, {'rendering', 'uploading'})} jalan · "
        f"{_count(video, {'failed'})} gagal · "
        f"{_count(video, {'done'})} selesai"
    )
    lines.append(
        "Scrape : "
        f"{_count(scrape, {'pending'})} menunggu · "
        f"{_count(scrape, {'running'})} jalan · "
        f"{_count(scrape, {'done'})} selesai · "
        f"{_count(scrape, {'failed'})} gagal"
    )
    lines.append(
        "Agent  : "
        f"{_count(runs, {'queued'})} antre · "
        f"{_count(runs, {'running'})} jalan · "
        f"{_count(runs, {'owner_review', 'done', 'completed'})} menunggu review"
    )
    cron_jobs = state.get("cron") or []
    active = [
        job for job in cron_jobs if job.get("enabled", True) and job.get("state") == "scheduled"
    ]
    late = sum(1 for finding in findings if finding.pipeline == "cron")
    lines.append(f"Cron   : {len(active)} aktif" + (f" · {late} terlambat" if late else ""))

    lines.append("")
    if findings:
        lines.append("Perlu perhatian:")
        lines.extend(format_finding(f) for f in findings)
    else:
        lines.append("Semua bersih — tidak ada yang menunggu keputusan.")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# akses API
# --------------------------------------------------------------------------
def _api():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from gmaps_lead_scraper import BASE_URL, _headers  # noqa: PLC0415

    return BASE_URL, _headers()


def api_get(path, params=None):
    import requests  # noqa: PLC0415

    base, headers = _api()
    res = requests.get(f"{base}{path}", headers=headers, params=params, timeout=30)
    res.raise_for_status()
    return res.json()


def api_patch(path, payload):
    import requests  # noqa: PLC0415

    base, headers = _api()
    res = requests.patch(f"{base}{path}", headers=headers, json=payload, timeout=30)
    if not res.ok:
        raise RuntimeError(f"HTTP {res.status_code}: {res.text[:160]}")
    return res.json()


def fetch_state():
    video = api_get("/api/video/jobs", {"workspace": WORKSPACE, "limit": 100}).get("jobs", [])
    scrape = api_get("/api/scrape/requests", {"workspace": WORKSPACE}).get("requests", [])
    runs = api_get("/api/runs", {"workspace": WORKSPACE}).get("runs", [])
    return {"video": video, "scrape": scrape, "runs": runs, "cron": read_cron_jobs()}


def read_cron_jobs():
    """Baca daftar cron Hermes dari disk; kosong kalau tidak terbaca."""
    path = os.path.expanduser("~/.hermes/cron/jobs.json")
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return []
    jobs = data if isinstance(data, list) else data.get("jobs", [])
    return [job for job in jobs if isinstance(job, dict)]


# --------------------------------------------------------------------------
# tindakan
# --------------------------------------------------------------------------
def _script_path(name, fallback):
    for candidate in (os.path.join(HERMES_SCRIPTS, name), os.path.join(REPO_ROOT, "scripts", fallback)):
        if os.path.exists(candidate):
            return candidate
    return None


def _already_running(name):
    try:
        res = subprocess.run(["pgrep", "-f", name], capture_output=True, text=True, timeout=10)
        return res.returncode == 0 and bool(res.stdout.strip())
    except Exception:  # pragma: no cover - pgrep selalu ada di Linux
        return False


def _spawn(name, fallback):
    path = _script_path(name, fallback)
    if not path:
        return f"skrip {name} tidak ditemukan"
    if _already_running(name):
        return "sudah berjalan"
    subprocess.Popen(
        [sys.executable, path],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
        cwd=REPO_ROOT,
    )
    return "dinyalakan"


def apply_action(finding, dry_run=False):
    action = finding.action
    if not action:
        return "tidak ada tindakan"

    if dry_run:
        return f"[dry-run] {ACTION_HINT.get(action, action)}"

    try:
        if action in SPAWN_JOBS:
            name, fallback = SPAWN_JOBS[action]
            return _spawn(name, fallback)
        if action == "requeue_video":
            api_patch(f"/api/video/jobs/{finding.ref}", {"status": "queued"})
            return ACTION_HINT[action]
        if action == "fail_stalled":
            api_patch(
                f"/api/video/jobs/{finding.ref}",
                {"status": "failed", "error": "koordinator: macet, tidak ada progres >25 menit"},
            )
            return ACTION_HINT[action]
        if action == "fail_scrape":
            api_patch(
                f"/api/scrape/requests/{finding.ref}",
                {"status": "failed", "error": "koordinator: macet >20 menit"},
            )
            return ACTION_HINT[action]
    except Exception as exc:  # noqa: BLE001
        return f"gagal: {exc}"
    return "tidak dikenal"


# --------------------------------------------------------------------------
# buku kerja (D1)
# --------------------------------------------------------------------------
def d1(sql):
    """Jalankan SQL ke D1 remote lewat wrangler; kembalikan baris hasil."""
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        D1_NAME,
        "--remote",
        "--json",
        "--command",
        sql,
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO_ROOT, timeout=120)
    if res.returncode != 0:
        raise RuntimeError((res.stderr or res.stdout)[:400])
    start = res.stdout.find("[")
    if start < 0:
        return []
    payload = json.loads(res.stdout[start:])
    if isinstance(payload, list) and payload:
        return payload[0].get("results", [])
    return []


def _sql_text(value):
    return "'" + str(value).replace("'", "''") + "'"


def open_alerts():
    rows = d1(
        "SELECT id, kind, ref, severity, message, first_seen, last_seen, count "
        "FROM coordinator_alerts WHERE resolved_at IS NULL"
    )
    return {row["id"]: row for row in rows}


def sync_alerts(findings, now):
    """Catat temuan baru, perbarui yang berulang, tutup yang sudah hilang."""
    stamp = now.strftime("%Y-%m-%d %H:%M:%S")
    current = {f.key: f for f in findings}
    existing = open_alerts()

    statements = []
    for key, finding in current.items():
        if key in existing:
            statements.append(
                "UPDATE coordinator_alerts SET last_seen = {stamp}, count = count + 1, "
                "severity = {sev}, message = {msg} WHERE id = {id};".format(
                    stamp=_sql_text(stamp),
                    sev=_sql_text(finding.severity),
                    msg=_sql_text(finding.message),
                    id=_sql_text(key),
                )
            )
        else:
            statements.append(
                "INSERT INTO coordinator_alerts (id, kind, ref, severity, message, first_seen, last_seen, count) "
                "VALUES ({id}, {kind}, {ref}, {sev}, {msg}, {stamp}, {stamp}, 1) "
                "ON CONFLICT(id) DO UPDATE SET resolved_at = NULL, last_seen = {stamp}, "
                "count = coordinator_alerts.count + 1, severity = {sev}, message = {msg};".format(
                    id=_sql_text(key),
                    kind=_sql_text(finding.kind),
                    ref=_sql_text(finding.ref),
                    sev=_sql_text(finding.severity),
                    msg=_sql_text(finding.message),
                    stamp=_sql_text(stamp),
                )
            )

    for key in existing:
        if key not in current:
            statements.append(
                "UPDATE coordinator_alerts SET resolved_at = {stamp} WHERE id = {id};".format(
                    stamp=_sql_text(stamp), id=_sql_text(key)
                )
            )

    if statements:
        d1(" ".join(statements))
    return sorted(set(current) - set(existing))


def log_actions(entries, now):
    if not entries:
        return
    stamp = now.strftime("%Y-%m-%d %H:%M:%S")
    statements = []
    for finding, note in entries:
        statements.append(
            "INSERT INTO coordinator_actions (id, at, action, ref, note) VALUES "
            "({id}, {at}, {act}, {ref}, {note});".format(
                id=_sql_text(uuid.uuid4().hex[:16]),
                at=_sql_text(stamp),
                act=_sql_text(finding.action or "none"),
                ref=_sql_text(finding.ref),
                note=_sql_text(note),
            )
        )
    d1(" ".join(statements))


def recent_actions(hours=24):
    rows = d1(
        "SELECT at, action, ref, note FROM coordinator_actions "
        f"WHERE at >= datetime('now', '-{int(hours)} hours') ORDER BY at DESC LIMIT 20"
    )
    return rows


# --------------------------------------------------------------------------
# perintah
# --------------------------------------------------------------------------
def cmd_status(args):
    now = datetime.now(timezone.utc)
    state = fetch_state()
    findings = analyze(state, now)
    print(format_status(state, findings, now))
    return 0


def cmd_sweep(args):
    now = datetime.now(timezone.utc)
    state = fetch_state()
    findings = analyze(state, now)

    performed = []
    for finding in findings:
        if not finding.action:
            continue
        note = apply_action(finding, dry_run=args.dry_run)
        performed.append((finding, note))

    new_keys = []
    if not args.dry_run:
        try:
            new_keys = sync_alerts(findings, now)
            log_actions(performed, now)
        except Exception as exc:  # noqa: BLE001 - buku kerja gagal != koordinator mati
            print(f"[warn] buku kerja D1: {exc}", file=sys.stderr)

    if not findings:
        return 0  # senyap: cron tidak mengirim apa pun
    if not args.dry_run and not new_keys and not performed:
        return 0  # masalah lama yang sudah pernah dilaporkan; digest harian yang mengingatkan

    lines = []
    if new_keys:
        lines.append(f"⚠️ {len(new_keys)} masalah baru terdeteksi")
    lines.append(format_alert(findings))
    if performed:
        lines.append("")
        lines.append("Tindakan:")
        for finding, note in performed:
            lines.append(f"• {finding.ref}: {note}")
    print("\n".join(lines))
    return 0


def cmd_report(args):
    now = datetime.now(timezone.utc)
    state = fetch_state()
    findings = analyze(state, now)
    print(format_status(state, findings, now))
    try:
        rows = recent_actions(hours=args.hours)
    except Exception:  # noqa: BLE001
        rows = []
    if rows:
        print("")
        print(f"Tindakan otomatis {args.hours} jam terakhir:")
        for row in rows:
            print(f"• {row.get('at')} {row.get('action')} {row.get('ref')} — {row.get('note')}")
    return 0


def cmd_json(args):
    now = datetime.now(timezone.utc)
    state = fetch_state()
    findings = analyze(state, now)
    print(
        json.dumps(
            {
                "state": state,
                "findings": [f.__dict__ for f in findings],
                "status": format_status(state, findings, now),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="Koordinator pipeline Playdesign")
    sub = parser.add_subparsers(dest="command")

    def add_flags(target):
        target.add_argument("--dry-run", action="store_true", help="hanya laporkan, jangan bertindak")
        target.add_argument("--hours", type=int, default=24, help="jendela tindakan untuk report")

    add_flags(sub.add_parser("status", help="keadaan sekarang, tanpa tindakan"))
    add_flags(sub.add_parser("sweep", help="deteksi + bertindak + catat (default)"))
    add_flags(sub.add_parser("report", help="ringkasan lengkap"))
    add_flags(sub.add_parser("json", help="keluaran mentah"))

    args = parser.parse_args(argv)
    # Tanpa argumen = sweep, supaya cron cukup memanggil `coordinator.py`.
    handler = {
        None: cmd_sweep,
        "status": cmd_status,
        "sweep": cmd_sweep,
        "report": cmd_report,
        "json": cmd_json,
    }[args.command]
    if not hasattr(args, "dry_run"):
        args.dry_run = False
    if not hasattr(args, "hours"):
        args.hours = 24
    return handler(args)


if __name__ == "__main__":
    sys.exit(main())
