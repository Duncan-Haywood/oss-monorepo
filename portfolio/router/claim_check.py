#!/usr/bin/env python3
"""Who holds a claim when two sessions open a PR for the same item?

    python3 portfolio/router/claim_check.py <keyword> [--item "<words>"] [--pr N] [--hours 24]

Run it right after you open your draft PR (title naming the slug, milestone
or target), and again before you merge. Open that PR before exploring, not
after the first real commit: an empty commit is enough (`claim_recipe`). It lists the open same-repo PRs whose
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

--item names the piece of the flagship you are taking ("deferred revenue
module"). A large flagship (300 hours of work, many open items) has room for two
sessions at once, but a slug-only check made every later one yield the whole
product: four runs on 2026-11-13 and 14 overrode YIELD because the older PR
worked another item (#15407, #15484, #15717, #15977; their run records'
`deviations`), and all eight PRs merged (#15411, #15486, #15718, #15979 beside
them). #15717 was a bare "claim (WIP)" later retitled to another product, so
that yield guarded nothing. With --item, an older
PR whose title names a *different* item is listed as SHARE, not a blocker; one
that shares a word of your item, or names no item at all (a bare "x: claim"),
still blocks. Without --item the check is slug-only, as before. The words
are matched literally, so read the SHARE titles: a judgment the tool cannot
make (overlapping files under different names) is yours.

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


# Words a claim title carries whatever its item is; they never tell two items apart.
GENERIC = frozenset("""claim claims wip draft post posts and the for with from into onto
    over under via its new add adds fix fixes item items slice next more first round page
    pages critique process ventures venture research polish perf quality redteam creative
    explore review""".split())


def item_words(text: str, keyword: str = "") -> set[str]:
    """The words of `text` that could name an item: three letters or more, not
    generic claim vocabulary, and not part of the slug itself."""
    slug = set(re.findall(r"[a-z0-9]+", keyword.lower()))
    return {w for w in re.findall(r"[a-z0-9]+", text.lower())
            if len(w) >= 3 and w not in GENERIC and w not in slug}


def overlap(title: str, keyword: str, item: str) -> str:
    """How an older PR's title relates to my item: "same" (a shared word),
    "bare" (it names no item, so it claims the whole slug) or "other"."""
    theirs = item_words(title, keyword)
    if not theirs:
        return "bare"
    return "same" if theirs & item_words(item, keyword) else "other"


def decide(prs: list[dict], keyword: str, mine: Optional[int] = None,
           branch: Optional[str] = None, repo: str = REPO,
           now: Optional[datetime] = None, hours: float = FRESH_HOURS,
           item: Optional[str] = None) -> dict:
    """The verdict for `keyword` given open PRs as returned by the REST pulls list.

    Returns {"verdict": "HOLD"|"YIELD", "mine": pr|None, "older": [...],
    "newer": [...], "sharing": [...]}, each pr a dict with number, title,
    created, branch. With `item`, older PRs on a different item go to
    "sharing" and do not make the verdict YIELD."""
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
    sharing = []
    if item and item_words(item, keyword):
        sharing = [r for r in older if overlap(r["title"], keyword, item) == "other"]
        older = [r for r in older if r not in sharing]
    return {"verdict": "YIELD" if older else "HOLD", "mine": me, "older": older,
            "newer": newer, "sharing": sharing}


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


def claim_recipe(keyword: str, item: Optional[str] = None) -> str:
    """How to open a claim PR before there is anything to commit.

    A PR needs a commit, so sessions explored for 20 to 40 minutes before
    their claim became visible, and two sessions sent to the same flagship
    both built it: four ventures runs on 2026-11-13 alone lost 10 to 40
    minutes each that way (doc_friction on allocate.py: einvoice-preflight,
    chant-forge, league-schedule-generator, quick-pick-survey), and quality
    runs committed placeholder posts to claim a seed. An empty commit is
    enough to open the PR, and the squash merge drops it."""
    it = item or "<item>"
    return (f"No diff yet? Claim now: `git commit --allow-empty -m \"{keyword}: {it} (claim)\"`, "
            f"push, and open a draft PR titled '{keyword}: {it}' (name the item, so a second "
            f"session on another item can share the flagship; the squash merge drops the "
            f"empty commit), then `python3 portfolio/router/claim_check.py {keyword} --item \"{it}\"`.")


def report(result: dict, keyword: str, now: datetime, hours: float,
           item: Optional[str] = None) -> list[str]:
    me, older, newer = result["mine"], result["older"], result["newer"]
    sharing = result.get("sharing") or []
    lines = []
    if me is None:
        lines.append(f"Your PR: none found (pass --pr N, or open your draft PR naming '{keyword}' first).")
        lines.append(claim_recipe(keyword, item))
    else:
        lines.append("Your PR: " + _line(me, now))
    if older:
        what = f"'{keyword}' for your item or names no item" if item else f"'{keyword}'"
        lines.append(f"YIELD: an older open PR claims {what} (opened first wins):")
        lines += ["  " + _line(r, now) for r in older]
        if not item:
            lines.append(f"  Working a different item of a large flagship? Rerun with --item \"<your item>\": "
                         f"an older PR on another item then shares instead of blocking.")
        lines.append("Pick a different item, or help land that PR; if you already have work, "
                     "close yours as superseded after `portfolio/ledger/supersede_check.py`.")
    else:
        lines.append(f"HOLD: no older open PR in the last {hours:g} h names '{keyword}'"
                     + (f" for '{item}'." if item else "."))
    if sharing:
        lines.append(f"SHARE: older PRs on '{keyword}' that name a different item (read the titles; "
                     f"keep out of their files):")
        lines += ["  " + _line(r, now) for r in sharing]
    if newer:
        lines.append("Newer PRs on it (they should yield to yours):")
        lines += ["  " + _line(r, now) for r in newer]
    return lines


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("keyword", help="slug, milestone or target your PR title names")
    ap.add_argument("--item", help="the flagship item you are taking; older PRs on other items then share")
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
                    branch=None if args.pr else current_branch(), now=now, hours=args.hours,
                    item=args.item)
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print("\n".join(report(result, args.keyword, now, args.hours, args.item)))
    return 1 if result["verdict"] == "YIELD" else 0


if __name__ == "__main__":
    sys.exit(main())
