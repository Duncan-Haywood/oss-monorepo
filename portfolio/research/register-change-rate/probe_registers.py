#!/usr/bin/env python3
"""Measure how often git-mirrored public registers actually change.

Answers step 1 of `public-record-watch`'s first experiment
(`portfolio/pipeline/candidates/public-record-watch.md`) — *"poll one register
for a month of history; measure how often anything actually changes"* — without
polling for a month, by reading the commit history of registers that publish a
git mirror.

House rules (`portfolio/research/README.md`): read-only, standard library only,
no credentials, publishes nothing, registers nothing, cannot spend money. Every
network call is an anonymous `git clone`/`git ls-remote` against a public
repository.

Usage:
    python3 probe_registers.py --json results-YYYY-MM-DD.json
    python3 probe_registers.py --recompute-from results-YYYY-MM-DD.json

`--recompute-from` re-derives every summary table from the saved per-commit
records with no network access at all, which is how a reviewer checks a claim
without re-running the probe.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import shutil
import signal
import statistics
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Targets
# ---------------------------------------------------------------------------
# `vertical` uses the three verticals public-record-watch names, plus
# `software-security` for the registers that are not on its list at all, and
# `control` for mirrors included to test a failure mode rather than a market.

TARGETS = [
    {
        "repo": "cisagov/kev-data",
        "register": "CISA Known Exploited Vulnerabilities catalog",
        "vertical": "software-security",
        "official": True,
        "note": "Published by the issuing agency itself.",
    },
    {
        "repo": "github/advisory-database",
        "register": "GitHub Security Advisories",
        "vertical": "software-security",
        "official": True,
        "note": "Register and mirror are the same organisation.",
    },
    {
        "repo": "ossf/malicious-packages",
        "register": "OpenSSF malicious package reports",
        "vertical": "software-security",
        "official": True,
        "note": "Report intake, not a government register.",
    },
    {
        "repo": "rubysec/ruby-advisory-db",
        "register": "RubySec advisory database",
        "vertical": "software-security",
        "official": False,
        "note": "Community mirror of upstream advisories.",
    },
    {
        "repo": "unitedstates/congress-legislators",
        "register": "US federal officeholder record",
        "vertical": "public-office",
        "official": False,
        "note": "Volunteer-maintained; the register itself is not git-published.",
    },
    {
        "repo": "openstates/people",
        "register": "US state legislator record",
        "vertical": "public-office",
        "official": False,
        "note": "Volunteer/scraper-maintained mirror of 50 state registers.",
    },
    {
        "repo": "opensanctions/opensanctions",
        "register": "Sanctions and PEP screening data",
        "vertical": "sanctions",
        "official": False,
        "note": "Control: repository holds the crawlers, not the register.",
    },
    {
        "repo": "FDA/openfda",
        "register": "FDA recalls / device safety notices",
        "vertical": "device-safety",
        "official": True,
        "note": "Control: agency publishes tooling to git, register to an API.",
    },
    {
        "repo": "datasets/covid-19",
        "register": "COVID-19 case counts",
        "vertical": "control",
        "official": False,
        "note": "Control: a mirror that stopped. Tests silent-death detection.",
    },
]

WINDOW_DAYS = 180
# A per-repo budget, not a per-run one. Some register mirrors carry six figures
# of small files and a blobless clone still walks every tree; capping the wait
# and recording `clone_timeout` keeps one slow mirror from costing the run, and
# a timeout is itself a fact worth reporting rather than an error to retry into.
CLONE_TIMEOUT_S = 240

# A commit is attributed to automation when its author identity carries one of
# these markers. Deliberately conservative: a human-authored commit misread as a
# bot would overstate the automation share, which is the direction that matters
# for the defensibility reading in README.md.
BOT_MARKERS = (
    "[bot]",
    "actions@github.com",
    "noreply@github.com",
    "github-actions",
    "dependabot",
    "-bot@",
    "bot@",
    # `cisagov/kev-data` commits as `kev-sync-bot <actions@users.noreply.github.com>`
    # — an identity none of the markers above match, which scored a mirror that
    # is *entirely* machine-written at 0% automation on the first run.
    "-bot ",
    "-bot<",
)


def is_bot(name: str, email: str) -> bool:
    blob = f"{name} <{email}>".lower()
    if any(marker in blob for marker in BOT_MARKERS):
        return True
    # A trailing `-bot` in the name, which is how most sync accounts are named.
    # Matched on the name only, and only as a suffix, so a human surname that
    # merely contains the letters (Bothell, Botha) is not swept in.
    return name.strip().lower().endswith("-bot")


# ---------------------------------------------------------------------------
# Collection
# ---------------------------------------------------------------------------


# The record separator leads each header rather than trailing it. With
# `--name-only` git emits `<header>\n\n<paths…>` per commit, so a trailing
# separator puts the *next* commit's header at the end of the previous commit's
# chunk — which parses as one commit for the whole log. Leading it keeps each
# chunk's header first and its own paths after.
GIT_LOG_FORMAT = "--format=%x1e%H%x1f%at%x1f%an%x1f%ae"


def parse_log(out: str) -> list[dict]:
    """Turn `git log GIT_LOG_FORMAT --name-only` output into per-commit records.

    Pure: no network, no filesystem. This is the half of collection that can be
    tested, and the half that was wrong first time.
    """
    commits = []
    for record in out.split("\x1e"):
        if not record.strip():
            continue
        header, _, body = record.strip("\n").partition("\n")
        parts = header.split("\x1f")
        if len(parts) != 4:
            continue
        sha, ts, author, email = parts
        if not ts.strip().isdigit():
            continue
        files = [line for line in body.split("\n") if line.strip()]
        top_dirs = sorted({f.split("/")[0] for f in files})
        commits.append(
            {
                "sha": sha[:12],
                "ts": int(ts),
                # Both the identity and the verdict are saved. The verdict is
                # what the run concluded; the identity is what lets a later pass
                # re-classify offline when the marker list turns out to have
                # missed something — which it did, on the first run.
                "author": f"{author} <{email}>"[:120],
                "bot": is_bot(author, email),
                "files": len(files),
                # Top-level directories only: enough to tell a data change from
                # a tooling change, without saving a path list per commit.
                "top_dirs": top_dirs[:8],
            }
        )
    return commits


def run(cmd: list[str], cwd: Path | None = None, timeout: int = 120) -> tuple[int, str, str]:
    """Run a command with a timeout that actually fires.

    `subprocess.run(timeout=…)` kills only the direct child. `git clone` forks a
    `git remote-https` helper that inherits the pipes, so killing git leaves the
    helper holding stdout open and the timeout path blocks forever in the
    follow-up `communicate()` — the clone budget silently becomes unbounded.
    Running the child in its own session and killing the whole group closes the
    pipes with it.
    """
    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    try:
        out, err = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        with contextlib.suppress(ProcessLookupError):
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        proc.communicate()
        raise
    return proc.returncode, out, err


def collect_repo(repo: str, since: datetime, workdir: Path) -> dict:
    """Clone one repo's recent history and return its per-commit records.

    Uses `--filter=blob:none` so file *contents* are never fetched: the change
    rate is a question about trees and timestamps, and skipping blobs keeps a
    register like cvelistV5 from costing hundreds of megabytes.
    """
    url = f"https://github.com/{repo}.git"
    dest = workdir / repo.replace("/", "__")
    since_arg = since.strftime("%Y-%m-%d")

    reachable_rc, _, ls_err = run(["git", "ls-remote", "--heads", url], timeout=120)
    if reachable_rc != 0:
        return {
            "repo": repo,
            "status": "unreachable",
            "error": ls_err.strip()[:500],
            "commits": [],
        }

    try:
        rc, _, err = run(
            [
                "git",
                "clone",
                "--quiet",
                "--filter=blob:none",
                "--no-checkout",
                f"--shallow-since={since_arg}",
                url,
                str(dest),
            ],
            timeout=CLONE_TIMEOUT_S,
        )
    except subprocess.TimeoutExpired:
        shutil.rmtree(dest, ignore_errors=True)
        return {
            "repo": repo,
            "status": "clone_timeout",
            "error": f"blobless shallow clone exceeded {CLONE_TIMEOUT_S}s",
            "commits": [],
        }
    status = "ok"
    if rc != 0:
        # A repo with no commits inside the window fails the shallow-since
        # clone outright ("no commits selected for shallow request"). That is
        # itself a finding — a dormant mirror — so fall back to a depth clone
        # and let the window filter below report zero.
        shutil.rmtree(dest, ignore_errors=True)
        try:
            rc2, _, err2 = run(
                ["git", "clone", "--quiet", "--filter=blob:none", "--no-checkout", "--depth=200", url, str(dest)],
                timeout=CLONE_TIMEOUT_S,
            )
        except subprocess.TimeoutExpired:
            rc2, err2 = 1, f"depth fallback exceeded {CLONE_TIMEOUT_S}s"
        if rc2 != 0:
            return {
                "repo": repo,
                "status": "clone_failed",
                "error": (err.strip() + " || " + err2.strip())[:500],
                "commits": [],
            }
        status = "ok_depth_fallback"

    # `--no-renames` is not cosmetic. Rename detection compares file *contents*,
    # so on a `--filter=blob:none` clone it makes git lazily fetch every blob it
    # skipped — turning a two-minute history read of a large register into an
    # unbounded download of the thing the filter existed to avoid. Change rate is
    # a question about which paths moved, not about which path used to be which.
    try:
        rc, out, err = run(
            ["git", "log", "--no-merges", "--no-renames", GIT_LOG_FORMAT, "--name-only"],
            cwd=dest,
            timeout=600,
        )
    except subprocess.TimeoutExpired:
        shutil.rmtree(dest, ignore_errors=True)
        return {"repo": repo, "status": "log_failed", "error": "git log exceeded 600s", "commits": []}
    if rc != 0:
        return {"repo": repo, "status": "log_failed", "error": err.strip()[:500], "commits": []}

    commits = parse_log(out)
    shutil.rmtree(dest, ignore_errors=True)
    return {"repo": repo, "status": status, "error": None, "commits": commits}


# ---------------------------------------------------------------------------
# Derivation — everything below runs offline from saved records
# ---------------------------------------------------------------------------


def _bot_verdict(commit: dict) -> bool:
    identity = commit.get("author")
    if not identity:
        return bool(commit.get("bot"))
    name, _, email = identity.partition(" <")
    return is_bot(name, email.rstrip(">"))


def summarise(entry: dict, since_ts: int, until_ts: int) -> dict:
    meta = {t["repo"]: t for t in TARGETS}.get(entry["repo"], {})
    commits = [c for c in entry["commits"] if since_ts <= c["ts"] <= until_ts]
    window_days = max(1, round((until_ts - since_ts) / 86400))

    days = sorted({datetime.fromtimestamp(c["ts"], timezone.utc).date() for c in commits})
    weeks = {d.isocalendar()[:2] for d in days}
    # The denominator is the ISO weeks the window actually touches, counted the
    # same way the numerator is. Dividing by `window_days / 7` instead treats a
    # 180-day window as 25.71 weeks when it overlaps 27 of them, and reports a
    # register that changed in every one of them as changing in 105% of them.
    weeks_in_window = len(
        {
            (datetime.fromtimestamp(since_ts, timezone.utc).date() + timedelta(days=n)).isocalendar()[:2]
            for n in range(window_days + 1)
        }
    )

    gaps = [(days[i + 1] - days[i]).days for i in range(len(days) - 1)] if len(days) > 1 else []
    # A change on the last day of the window still leaves a trailing silence
    # before "now"; count it, because a monitor's worst case is the gap it is
    # currently sitting in.
    trailing = (datetime.fromtimestamp(until_ts, timezone.utc).date() - days[-1]).days if days else window_days

    # Re-classify from the saved identity where one exists, so a corrected
    # marker list applies to old results without re-cloning anything. Records
    # saved before identities were kept fall back to the verdict of the run that
    # collected them, and README.md flags those as a lower bound.
    bot_commits = sum(1 for c in commits if _bot_verdict(c))
    files_touched = [c["files"] for c in commits]

    return {
        "repo": entry["repo"],
        "register": meta.get("register", ""),
        "vertical": meta.get("vertical", ""),
        "official": meta.get("official"),
        "note": meta.get("note", ""),
        "status": entry["status"],
        "error": entry.get("error"),
        "window_days": window_days,
        "commits": len(commits),
        "change_days": len(days),
        "change_day_share": round(len(days) / window_days, 4),
        "change_weeks": len(weeks),
        "weeks_in_window": weeks_in_window,
        "week_share": round(len(weeks) / weeks_in_window, 4),
        "median_gap_days": statistics.median(gaps) if gaps else None,
        "max_gap_days": max(gaps) if gaps else None,
        "trailing_silence_days": trailing,
        "bot_share": round(bot_commits / len(commits), 4) if commits else None,
        "median_files_per_commit": statistics.median(files_touched) if files_touched else None,
        "total_file_touches": sum(files_touched),
        "last_change": (
            datetime.fromtimestamp(max(c["ts"] for c in commits), timezone.utc).date().isoformat()
            if commits
            else None
        ),
    }


def derive(payload: dict) -> dict:
    since_ts = payload["window"]["since_ts"]
    until_ts = payload["window"]["until_ts"]
    rows = [summarise(entry, since_ts, until_ts) for entry in payload["repos"]]

    live = [r for r in rows if r["commits"] > 0]
    weekly_or_better = [r for r in live if r["week_share"] >= 0.5]

    return {
        "rows": rows,
        "totals": {
            "targets": len(rows),
            "clonable": sum(1 for r in rows if r["status"].startswith("ok")),
            "unreachable": sum(1 for r in rows if r["status"] == "unreachable"),
            "live_in_window": len(live),
            "dormant_in_window": len(rows) - len(live),
            "changed_in_at_least_half_the_weeks": len(weekly_or_better),
            "fully_bot_maintained": sum(1 for r in live if (r["bot_share"] or 0) >= 0.99),
        },
    }


def render(derived: dict) -> str:
    lines = []
    header = f"{'repo':<36} {'vert':<18} {'cmts':>5} {'chg-d':>6} {'wk%':>6} {'maxgap':>7} {'bot%':>6}"
    lines.append(header)
    lines.append("-" * len(header))
    for r in sorted(derived["rows"], key=lambda x: -x["commits"]):
        max_gap = "-" if r["max_gap_days"] is None else str(r["max_gap_days"])
        bot = "-" if r["bot_share"] is None else f"{r['bot_share'] * 100:.0f}%"
        lines.append(
            f"{r['repo']:<36} {r['vertical']:<18} {r['commits']:>5} {r['change_days']:>6} "
            f"{r['week_share'] * 100:>5.0f}% {max_gap:>7} {bot:>6}"
        )
    lines.append("")
    for k, v in derived["totals"].items():
        lines.append(f"  {k.replace('_', ' '):<38} {v}")
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", help="write raw per-commit records here")
    ap.add_argument("--recompute-from", help="re-derive every table from saved records, no network")
    ap.add_argument("--as-of", help="window end date, YYYY-MM-DD (default: today, UTC)")
    ap.add_argument("--window-days", type=int, default=WINDOW_DAYS)
    args = ap.parse_args(argv)

    if args.recompute_from:
        payload = json.loads(Path(args.recompute_from).read_text())
        print(render(derive(payload)))
        return 0

    until = (
        datetime.strptime(args.as_of, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        if args.as_of
        else datetime.now(timezone.utc)
    )
    since = until - timedelta(days=args.window_days)
    # Clone a little wider than the window so a gap that starts before it is
    # still measurable from inside the saved records.
    clone_since = since - timedelta(days=30)

    payload = {
        "measured_at": until.isoformat(),
        "window": {
            "days": args.window_days,
            "since": since.date().isoformat(),
            "since_ts": int(since.timestamp()),
            "until_ts": int(until.timestamp()),
        },
        "repos": [],
    }

    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        for target in TARGETS:
            print(f"… {target['repo']}", file=sys.stderr, flush=True)
            payload["repos"].append(collect_repo(target["repo"], clone_since, workdir))
            # Written after every repo, not at the end: a run that dies on the
            # tenth mirror should still leave the first nine measured.
            if args.json:
                Path(args.json).write_text(json.dumps(payload, indent=2) + "\n")

    if args.json:
        Path(args.json).write_text(json.dumps(payload, indent=2) + "\n")
    print(render(derive(payload)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
