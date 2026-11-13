#!/usr/bin/env python3
"""List the open pull requests any agent may land now, stalest first.

Why this exists
---------------
`.github/prompts/land-your-work.md` ("Other agents' unlanded work is yours
too") makes merging every agent's job: a ready PR whose branch has not moved
in 2+ hours, or a draft whose branch has not moved in 24 hours (an orphan),
is to be verified and merged, or closed with a reason. Nothing listed them.
`owner_held_prs.py` lists the PRs that wait on the owner; the rest, the ones
no gate holds, had no list, so they sat. On 2026-11-13 PR #14596 (the site
build's default origin, a fix two polish runs had asked for) had been a draft
for three days with its branch untouched, while later runs kept reporting the
bug it fixed in their `doc_friction`.

This prints the other half of the queue: each same-repo open PR that changes
no CODEOWNERS path, whose head commit is older than the stall threshold (2 h
for a ready PR, 24 h for a draft), with

  * its age since the last push, and whether it is a draft;
  * its check runs on the head commit (green, red, pending, none);
  * **already on main**: every changed file is the same blob on main, or every
    block of added lines is already in main's copy (owner_held_prs's rule), so
    the PR is probably superseded: run `portfolio/ledger/supersede_check.py`
    and close it;
  * **says wait**: the body names a reason to leave it ("not for merge",
    "parked", "waiting on the owner", "blocked", "do not merge"). Left open on
    purpose is not stalled, so these are listed apart and never as candidates.

It does not merge, close or comment on anything. Read the diff before you act.

    python3 platform/ci/orphan_prs.py               # markdown table
    python3 platform/ci/orphan_prs.py --json        # for scripts
    python3 platform/ci/orphan_prs.py --grep pages  # title or file filter

Network use is owner_held_prs.py's (GITHUB_TOKEN when set; a cloud session's
proxy authenticates it otherwise): one request per PR page, then per stalled
candidate one for its files, one for its head commit and one for its check
runs, sixteen at a time. Fetch origin/main first for the "already on main"
column. Exit 0 with the list, 2 when GitHub cannot be read.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import control_plane_guard as cpg  # noqa: E402
import owner_held_prs as ohp  # noqa: E402

READY_STALL = dt.timedelta(hours=2)
DRAFT_STALL = dt.timedelta(hours=24)
WAIT_RE = re.compile(
    r"not for merge|do not merge|don't merge|parked|waiting (?:on|for) (?:the )?owner|"
    r"owner approval|blocked on|on hold",
    re.I,
)


def parse_time(text: str) -> dt.datetime | None:
    try:
        return dt.datetime.fromisoformat((text or "").replace("Z", "+00:00"))
    except ValueError:
        return None


def checks_summary(runs: list[dict]) -> str:
    """One word for a head commit's check runs: red beats pending beats green."""
    if not runs:
        return "none"
    concl = [r.get("conclusion") for r in runs]
    if any(c in ("failure", "timed_out", "action_required", "startup_failure") for c in concl):
        return "red"
    if any(r.get("status") != "completed" for r in runs):
        return "pending"
    if any(c == "cancelled" for c in concl):
        return "cancelled"
    return "green"


def classify(prs: list[dict], info_of, rules, now: dt.datetime, main=ohp.NoMain()) -> list[dict]:
    """Rows for the same-repo open PRs that touch no owned path and whose head
    is older than its stall threshold, stalest first.

    `info_of(pr)` returns {"files": [...], "pushed_at": iso, "checks": [...]}
    for one PR (files as the API lists them; check runs on the head commit)."""
    same = [pr for pr in prs if not ohp.is_fork(pr)]
    # updated_at moves on every push, comment and label, so a PR updated within
    # the threshold cannot be stale; skip its three requests.
    def maybe(pr):
        updated = parse_time(pr.get("updated_at", ""))
        limit = DRAFT_STALL if pr.get("draft") else READY_STALL
        return updated is None or now - updated >= limit
    candidates = [pr for pr in same if maybe(pr)]
    with ThreadPoolExecutor(max_workers=16) as pool:
        infos = list(pool.map(info_of, candidates))
    rows = []
    for pr, info in zip(candidates, infos):
        files = info["files"]
        if any(cpg.owners_for(f["filename"], rules) for f in files):
            continue  # owner_held_prs.py's list
        pushed = parse_time(info.get("pushed_at", "")) or parse_time(pr.get("updated_at", ""))
        if pushed is None:
            continue
        idle = now - pushed
        draft = bool(pr.get("draft"))
        if idle < (DRAFT_STALL if draft else READY_STALL):
            continue
        wait = WAIT_RE.search(pr.get("body") or "")
        rows.append({
            "number": pr["number"],
            "title": pr.get("title", ""),
            "draft": draft,
            "idle_hours": round(idle.total_seconds() / 3600, 1),
            "checks": checks_summary(info.get("checks") or []),
            "files": len(files),
            "on_main": bool(files) and all(ohp.change_on_main(f, main) for f in files),
            "says_wait": wait.group(0) if wait else "",
            "branch": (pr.get("head") or {}).get("ref", ""),
        })
    rows.sort(key=lambda r: (-r["idle_hours"], r["number"]))
    return rows


def fmt_idle(hours: float) -> str:
    return f"{hours / 24:.1f}d" if hours >= 48 else f"{hours:.0f}h"


def render(rows: list[dict]) -> str:
    live = [r for r in rows if not r["says_wait"]]
    waiting = [r for r in rows if r["says_wait"]]
    if not rows:
        return ("No stalled same-repo PR outside the owner gate: nothing for another agent to land "
                "(owner_held_prs.py lists the gated ones).\n")
    out = [f"{len(live)} stalled PR(s) any agent may land or close (no CODEOWNERS path; ready and idle 2h+, "
           "or draft and idle 24h+), stalest first. Read the diff, verify on today's main, then merge or close "
           "with a reason (.github/prompts/land-your-work.md).", ""]
    if live:
        out += ["| PR | idle | checks | files | title | note |", "|---|---|---|---|---|---|"]
        for r in live:
            title = r["title"].replace("|", "/")
            if r["draft"]:
                title = "(draft) " + title
            note = "already on main: supersede_check.py, then close" if r["on_main"] else ""
            out.append(f"| #{r['number']} | {fmt_idle(r['idle_hours'])} | {r['checks']} | {r['files']} | {title} | {note} |")
    if waiting:
        out += ["", "Left open on purpose (the body says so; not candidates): "
                + ", ".join(f"#{r['number']} ({r['says_wait']})" for r in waiting)]
    return "\n".join(out) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--json", action="store_true", help="print rows as JSON")
    ap.add_argument("--grep", help="keep PRs whose title or branch contains this text")
    args = ap.parse_args(argv)
    rules = cpg.parse_codeowners(cpg.CODEOWNERS.read_text())
    repo = ohp.REPO

    def info_of(pr):
        sha = pr["head"]["sha"]
        commit = ohp.get(f"/repos/{repo}/commits/{sha}")
        checks = ohp.get(f"/repos/{repo}/commits/{sha}/check-runs?per_page=100").get("check_runs", [])
        return {
            "files": ohp.pages(f"/repos/{repo}/pulls/{pr['number']}/files", limit=30),
            "pushed_at": ((commit.get("commit") or {}).get("committer") or {}).get("date", ""),
            "checks": checks,
        }

    try:
        prs = ohp.pages(f"/repos/{repo}/pulls?state=open")
        rows = classify(prs, info_of, rules, dt.datetime.now(dt.timezone.utc), ohp.GitMain())
    except Exception as e:  # network, proxy, rate limit
        print(f"orphan_prs: could not read GitHub ({e}); list open PRs by hand", file=sys.stderr)
        return 2
    if args.grep:
        g = args.grep.lower()
        rows = [r for r in rows if g in r["title"].lower() or g in r["branch"].lower()]
    print(json.dumps(rows, indent=2) if args.json else render(rows), end="\n" if args.json else "")
    return 0


if __name__ == "__main__":
    sys.exit(main())
