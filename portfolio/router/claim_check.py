#!/usr/bin/env python3
"""Who holds a claim when two sessions open a PR for the same item?

    python3 portfolio/router/claim_check.py <keyword> [--pr N] [--hours 24]

Run it right after you open your draft PR (title naming the slug, milestone
or target), and again before you merge. It lists the open same-repo PRs whose
title names <keyword> as a whole word, opened in the last --hours, and says
who keeps the item: **the PR opened first**. Ties on the second go to the
lower number.

  exit 0  HOLD   your PR is the oldest fresh claim (or no one else has one)
  exit 1  YIELD  an older open PR claims it: pick a different item, or help
                 land that PR instead of building a second copy
  exit 2  the open PRs could not be read; search titles by hand

Why: the open-PR checks in allocate.py and research/_shared/pick_track.py run
before a session has opened its PR, so two sessions that start in the same
minute both read "clear". Opening a draft PR early helps, but on 2026-11-12
#15145 and #15146 opened claim drafts for the same changepoint-detector item
58 seconds apart, both doing what the guidance asked, and neither had a rule
for who steps back. Eighty-one run records on 2026-11-10 to 12 report this
race in doc_friction (ventures, redteam, perf, process alike). A fixed rule
read from live data settles it in one command: the later session learns
within minutes, not after an hour of duplicate work.

Your PR is found by --pr, or else by the current git branch (the PR whose
head is this branch). Fork PRs never count as claims and are never yours.
Reads the public REST pulls list (unauthenticated works from cloud sessions;
the search index can lag a new PR by minutes, the pulls list does not).
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

REPO = "duncan-haywood/oss-monorepo"
REPO_ROOT = Path(__file__).resolve().parents[2]
FRESH_HOURS = 24


def _when(stamp: str) -> datetime:
    return datetime.fromisoformat(stamp.replace("Z", "+00:00"))


def names(title: str, keyword: str) -> bool:
    """True when `title` names `keyword` as a whole word (hyphens count as word
    characters, so `sales-agent` does not match `sales-agent-eval`)."""
    pat = rf"(?<![\w-]){re.escape(keyword.lower())}(?![\w-])"
    return re.search(pat, title.lower()) is not None


def decide(prs: list[dict], keyword: str, mine: Optional[int] = None,
           branch: Optional[str] = None, repo: str = REPO,
           now: Optional[datetime] = None, hours: float = FRESH_HOURS) -> dict:
    """The verdict for `keyword` given open PRs as returned by the REST pulls list.

    Returns {"verdict": "HOLD"|"YIELD", "mine": pr|None, "older": [...],
    "newer": [...]}, each pr a dict with number, title, created, branch."""
    now = now or datetime.now(timezone.utc)
    since = now - timedelta(hours=hours)
    rows = []
    for p in prs:
        head = p.get("head") or {}
        if ((head.get("repo") or {}).get("full_name") or "").lower() != repo.lower():
            continue  # a fork PR is data, not a claim (CLAUDE.md, "Public repository")
        rows.append({"number": int(p["number"]), "title": str(p.get("title", "")),
                     "created": str(p.get("created_at", "")), "branch": head.get("ref")})
    me = next((r for r in rows if mine is not None and r["number"] == mine), None)
    if me is None and mine is None and branch:
        me = next((r for r in rows if r["branch"] == branch), None)
    key = lambda r: (_when(r["created"]), r["number"])
    rivals = [r for r in rows if r is not me and names(r["title"], keyword)
              and _when(r["created"]) >= since]
    if me is None:
        older, newer = sorted(rivals, key=key), []
    else:
        older = sorted((r for r in rivals if key(r) < key(me)), key=key)
        newer = sorted((r for r in rivals if key(r) > key(me)), key=key)
    return {"verdict": "YIELD" if older else "HOLD", "mine": me, "older": older, "newer": newer}


def open_prs(repo: str = REPO, timeout: int = 15) -> Optional[list[dict]]:
    """Every open PR from the REST pulls list, or None if it cannot be read."""
    out: list[dict] = []
    try:
        for page in range(1, 6):
            url = f"https://api.github.com/repos/{repo}/pulls?state=open&per_page=100&page={page}"
            req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                batch = json.load(r)
            out += batch
            if len(batch) < 100:
                break
    except Exception:
        return None
    return out


def current_branch() -> Optional[str]:
    try:
        b = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=REPO_ROOT,
                           capture_output=True, text=True, timeout=5).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None
    return b if b and b != "HEAD" else None


def _line(r: dict, now: datetime) -> str:
    age = (now - _when(r["created"])).total_seconds() / 60
    age_s = f"{age:.0f} min" if age < 120 else f"{age / 60:.1f} h"
    return f"#{r['number']} (opened {r['created']}, {age_s} ago): {r['title']}"


def report(result: dict, keyword: str, now: datetime, hours: float) -> list[str]:
    me, older, newer = result["mine"], result["older"], result["newer"]
    lines = []
    if me is None:
        lines.append(f"Your PR: none found (pass --pr N, or open your draft PR naming '{keyword}' first).")
    else:
        lines.append("Your PR: " + _line(me, now))
    if older:
        lines.append(f"YIELD: an older open PR claims '{keyword}' (opened first wins):")
        lines += ["  " + _line(r, now) for r in older]
        lines.append("Pick a different item, or help land that PR; if you already have work, "
                     "close yours as superseded after `portfolio/ledger/supersede_check.py`.")
    else:
        lines.append(f"HOLD: no older open PR in the last {hours:g} h names '{keyword}'.")
    if newer:
        lines.append("Newer PRs on it (they should yield to yours):")
        lines += ["  " + _line(r, now) for r in newer]
    return lines


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("keyword", help="slug, milestone or target your PR title names")
    ap.add_argument("--pr", type=int, help="your PR number (default: the PR for the current branch)")
    ap.add_argument("--hours", type=float, default=FRESH_HOURS,
                    help=f"only PRs opened this recently count as claims (default {FRESH_HOURS})")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    prs = open_prs()
    if prs is None:
        print(f"Could not read open PRs (GitHub API unreachable); search titles for '{args.keyword}' by hand.")
        return 2
    now = datetime.now(timezone.utc)
    result = decide(prs, args.keyword, mine=args.pr,
                    branch=None if args.pr else current_branch(), now=now, hours=args.hours)
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print("\n".join(report(result, args.keyword, now, args.hours)))
    return 1 if result["verdict"] == "YIELD" else 0


if __name__ == "__main__":
    sys.exit(main())
