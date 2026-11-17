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
  exit 1  LANDED a PR merged since your clone of main names your --item:
                 read it before building (it may already be on main)
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

A PR that already **merged** is no open claim, yet three of four misses
reported on 2026-11-16 were exactly that: #16639 opened two minutes after
#16627 merged the same chant-forge fix, #16579 one minute after #16574 merged
the edge-time fit, and the session behind #16550 built what #16548 then
landed (their run records' doc_friction). A session whose clone predates the
merge reads the item as open on main and free in the PR list. So the check
also reads PRs merged after your clone's origin/main commit (merges your clone
already holds are on main for you to read, so they are skipped; a busy
flagship lands a dozen slices a day and a 24 h list was noise): with --item,
one whose title shares two words of your item (one, if the item has one) is
LANDED (exit 1: read its diff, then take the next item or say why yours
differs); the rest are listed so you can read their titles.

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


def shares_item(title: str, keyword: str, item: str) -> bool:
    """A merged title names my item: it shares two of the item's words, or its
    only word. One shared word was too loose for merges: a flagship's slices
    reuse its vocabulary ("fit", "drop") all day."""
    mine = item_words(item, keyword)
    return bool(mine) and len(item_words(title, keyword) & mine) >= min(2, len(mine))


def main_commit_time() -> Optional[datetime]:
    """When the clone's origin/main tip was committed (HEAD's if no origin/main):
    every merge up to then is already in the clone, for the session to read."""
    for ref in ("origin/main", "HEAD"):
        try:
            out = subprocess.run(["git", "log", "-1", "--format=%cI", ref], cwd=REPO_ROOT,
                                 capture_output=True, text=True, timeout=5).stdout.strip()
            if out:
                return datetime.fromisoformat(out).astimezone(timezone.utc)
        except (OSError, subprocess.SubprocessError, ValueError):
            pass
    return None


def decide(prs: list[dict], keyword: str, mine: Optional[int] = None,
           branch: Optional[str] = None, repo: str = REPO,
           now: Optional[datetime] = None, hours: float = FRESH_HOURS,
           item: Optional[str] = None, merged: Optional[list[dict]] = None,
           main_at: Optional[datetime] = None) -> dict:
    """The verdict for `keyword` given open PRs as returned by the REST pulls list.

    Returns {"verdict": "HOLD"|"YIELD"|"LANDED", "mine": pr|None, "older": [...],
    "newer": [...], "sharing": [...], "landed": [...], "merged": [...]}, each pr
    a dict with number, title, created, branch (merged ones also `merged`).
    With `item`, older PRs on a different item go to "sharing" and do not make
    the verdict YIELD. `merged` is closed PRs from the REST list: those merged
    after `main_at` (the clone's origin/main commit time; else the last
    `hours`) that name `keyword` go to "landed" when their title shares
    enough words of `item` (`shares_item`; verdict LANDED unless an open PR
    already makes it YIELD), else to "merged" (listed, never blocking).
    Without `item` a merge never blocks."""
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
    landed, others = [], []
    for p in merged or []:
        head = p.get("head") or {}
        if ((head.get("repo") or {}).get("full_name") or "").lower() != repo.lower():
            continue
        if not p.get("merged_at") or _when(p["merged_at"]) <= max(since, main_at or since):
            continue
        if int(p["number"]) in {mine, me and me["number"]} or (branch and head.get("ref") == branch):
            continue  # my own PR, merged already, is not a rival
        title = str(p.get("title", ""))
        if not names(title, keyword):
            continue
        row = {"number": int(p["number"]), "title": title, "created": str(p.get("created_at", "")),
               "merged": p["merged_at"], "branch": head.get("ref")}
        same = bool(item) and shares_item(title, keyword, item)
        (landed if same else others).append(row)
    newest = lambda r: _when(r["merged"])
    landed.sort(key=newest, reverse=True)
    others.sort(key=newest, reverse=True)
    verdict = "YIELD" if older else ("LANDED" if landed else "HOLD")
    return {"verdict": verdict, "mine": me, "older": older, "newer": newer,
            "sharing": sharing, "landed": landed, "merged": others}


def recently_closed(repo: str = REPO, timeout: int = 15, pages: int = 2) -> Optional[list[dict]]:
    """The most recently updated closed PRs (merged or not), newest first, or None.
    Two pages of 100 cover well over a day at this repository's merge rate."""
    out: list[dict] = []
    try:
        for page in range(1, pages + 1):
            url = (f"https://api.github.com/repos/{repo}/pulls?state=closed&sort=updated"
                   f"&direction=desc&per_page=100&page={page}")
            req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                batch = json.load(r)
            out += batch
            if len(batch) < 100:
                break
    except Exception:
        return None
    return out


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
    stamp = r.get("merged") or r["created"]
    age = (now - _when(stamp)).total_seconds() / 60
    age_s = f"{age:.0f} min" if age < 120 else f"{age / 60:.1f} h"
    verb = "merged" if r.get("merged") else "opened"
    return f"#{r['number']} ({verb} {stamp}, {age_s} ago): {r['title']}"


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
    elif result.get("landed"):
        lines.append(f"LANDED: a PR merged since your clone of main names '{keyword}' and shares words "
                     f"of '{item}' (not an open claim, but this may be your item, already on main):")
        lines += ["  " + _line(r, now) for r in result["landed"]]
        lines.append("Read its diff (`git fetch --depth=1 origin main`, then the flagship row): if it "
                     "covers your item, take the next one; if yours is a different slice, go on and "
                     "say why in the run record.")
    else:
        lines.append(f"HOLD (the item is yours): no older open PR in the last {hours:g} h names '{keyword}'"
                     + (f" for '{item}'." if item else "."))
    if result.get("merged"):
        lines.append(f"Merged since your clone of main on '{keyword}' (other items; skim the titles):")
        lines += ["  " + _line(r, now) for r in result["merged"][:5]]
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
    closed = recently_closed()
    now = datetime.now(timezone.utc)
    result = decide(prs, args.keyword, mine=args.pr,
                    branch=None if args.pr else current_branch(), now=now, hours=args.hours,
                    item=args.item, merged=closed, main_at=main_commit_time())
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print("\n".join(report(result, args.keyword, now, args.hours, args.item)))
        if closed is None:
            print("(Recently merged PRs could not be read: check `git log origin/main` for the slug by hand.)")
    return 0 if result["verdict"] == "HOLD" else 1


if __name__ == "__main__":
    sys.exit(main())
