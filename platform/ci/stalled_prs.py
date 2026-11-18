#!/usr/bin/env python3
"""List the open pull requests any agent may land now: stalled, unowned work.

Why this exists
---------------
`land-your-work.md` ("Other agents' unlanded work is yours too") asks every
session to merge a stalled PR it finds: non-draft, green on its current head,
mergeable, branch quiet for 2+ hours, no named blocker; and to finish or close
a draft whose branch has been quiet for 24 hours. Finding them meant opening
every open PR by hand. `owner_held_prs.py` lists the PRs that wait on the
owner; nothing listed the rest. On 2026-11-17, 39 PRs were open; besides the
owner-held ones, about ten touched no owned path and had sat for a day to nine
days (a polish lead, a red-team campaign, three quality censuses, a run record)
with no session looking at them.

This prints those PRs, sorted into the buckets land-your-work.md uses:

  * **ready**: non-draft, green, mergeable, quiet 2+ h: read the diff, merge;
  * **orphan draft**: a draft quiet 24+ h: mark ready, verify, merge, or close
    with a reason;
  * **red** / **conflicted** / **no checks**: quiet 2+ h but needs work first
    (merge main in, fix forward, or verify locally when CI was starved:
    `ci_starvation.py`);
  * **unfinished**: its own run record (`prompts/runs/*.json`) still has
    `outcome: null`, so the session died mid-run: finish the work, or close;
  * **blocked**: its title or body names a blocker ("parked", "do not merge",
    "waiting on the owner", "[in progress]"): left open on purpose.

The unfinished bucket came from the 2026-11-18 sweep
(docs/reports/process-2026-11-18-stalled-pr-sweep.md): #16116 and #16245 were
listed as orphan drafts to "mark ready, merge"; both were quality censuses whose
sessions had died with 5 of 6 audits done and a record whose `outcome` and `pr`
were null. Marked ready, both went red on `promptctl validate` and had to go
back to draft. Merging one means doing the missing work and filling the
record, which is a run's task, not a merge.

PRs still moving (pushed under 2 h ago, or a draft under 24 h) and PRs that
touch a CODEOWNERS path (owner_held_prs.py) are left out. Fork PRs are skipped:
they are never merged here (CLAUDE.md, "Public repository").

    python3 platform/ci/stalled_prs.py          # markdown table
    python3 platform/ci/stalled_prs.py --json

It reads the GitHub REST API the way owner_held_prs.py does (a cloud session's
proxy authenticates it; GITHUB_TOKEN when set). Exit 0 with the list, 2 when
GitHub cannot be read.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import control_plane_guard as cpg  # noqa: E402
import owner_held_prs as ohp  # noqa: E402

QUIET_READY_H = 2      # land-your-work.md: "branch hasn't moved in 2+ hours"
QUIET_DRAFT_H = 24     # land-your-work.md: "a draft whose branch hasn't moved in 24 hours"

BLOCKER = re.compile(
    r"\bparked\b|do not merge|don't merge|not for merge|\bwip\b|\[in progress\]"
    r"|waiting (?:on|for) the owner|blocked (?:on|by)\b|needs the owner",
    re.I)

ORDER = ["ready", "orphan draft", "unfinished", "red", "conflicted", "no checks", "pending", "blocked"]
WHAT = {
    "ready": ("read the diff (scope, disclaimer, usage tracking), then merge; "
              "a head quiet for days: merge main in first so CI runs on today's tree"),
    "orphan draft": "mark ready, merge main in, verify, merge; or close with a reason",
    "unfinished": ("its session died mid-run (run record outcome null): finish what the "
                   "record's track and the last commits name, fill the record, then land; "
                   "marking it ready as-is fails promptctl validate"),
    "red": "classify with ci_starvation.py --run <id>; fix forward or close",
    "conflicted": "merge main in and resolve (a conflict is not a reason to close)",
    "no checks": "CI never ran on this head: verify locally or push a merge of main",
    "pending": "checks still running on a quiet branch: look again later",
    "blocked": "left open on purpose: leave it",
}


def parse_time(s: str) -> dt.datetime:
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


def checks_state(runs: list[dict]) -> str:
    """'green', 'red', 'pending' or 'none' for a head commit's check runs.
    Skipped and neutral runs count as passing; cancelled and timed-out as red."""
    if not runs:
        return "none"
    if any(r.get("status") != "completed" for r in runs):
        return "pending"
    bad = {"failure", "timed_out", "cancelled", "action_required", "startup_failure", "stale"}
    return "red" if any(r.get("conclusion") in bad for r in runs) else "green"


def classify(pr: dict, checks: str, head_time: dt.datetime, now: dt.datetime) -> str | None:
    """The bucket for one unowned same-repo PR, or None while it is still moving.

    `pr` is the single-PR API object (it carries `mergeable`; None means GitHub
    has not computed it yet, which is not a conflict)."""
    text = f"{pr.get('title', '')}\n{pr.get('body') or ''}"
    if BLOCKER.search(text):
        return "blocked"
    quiet_h = (now - head_time).total_seconds() / 3600
    if pr.get("draft"):
        return "orphan draft" if quiet_h >= QUIET_DRAFT_H else None
    if quiet_h < QUIET_READY_H:
        return None
    if pr.get("mergeable") is False:
        return "conflicted"
    return {"green": "ready", "red": "red", "pending": "pending", "none": "no checks"}[checks]


RUN_RECORD = re.compile(r"^prompts/runs/[^/]+\.json$")


def unfinished_record(files: list[dict], sha: str, record_of) -> str | None:
    """The first run record this PR adds or changes whose `outcome` is still
    null (its session never got to step 3), or None. A record that cannot be
    read or parsed is skipped: the bucket it would have had stands."""
    for f in files:
        name = f.get("filename", "")
        if not RUN_RECORD.match(name) or f.get("status") == "removed":
            continue
        try:
            rec = record_of(name, sha)
        except Exception:
            continue
        if isinstance(rec, dict) and rec.get("outcome") is None:
            return name
    return None


def stalled(prs: list[dict], files_of, detail_of, checks_of, head_time_of, rules,
            now: dt.datetime, record_of=None) -> list[dict]:
    """Rows for the same-repo open PRs that touch no owned path and are not
    moving, in ORDER then oldest first. `record_of(path, sha)` returns a run
    record's JSON at that commit; without it no PR is marked unfinished."""
    same = [pr for pr in prs if not ohp.is_fork(pr)]
    with ThreadPoolExecutor(max_workers=16) as pool:
        listed = list(pool.map(lambda pr: files_of(pr["number"]), same))
    unowned = [(pr, files) for pr, files in zip(same, listed)
               if not any(cpg.owners_for(f["filename"], rules) for f in files)]

    def one(item):
        pr, files = item
        sha = pr["head"]["sha"]
        head_time = head_time_of(sha)
        quiet_h = (now - head_time).total_seconds() / 3600
        if pr.get("draft"):  # a draft's bucket needs neither checks nor mergeability
            bucket = classify(pr, "none", head_time, now)
        elif quiet_h < QUIET_READY_H:
            return None  # still moving: skip the costlier calls
        else:
            bucket = classify(detail_of(pr["number"]), checks_state(checks_of(sha)), head_time, now)
        if bucket is None:
            return None
        record = None
        if bucket != "blocked" and record_of is not None:
            record = unfinished_record(files, sha, record_of)
            if record:
                bucket = "unfinished"
        return {"number": pr["number"], "title": pr.get("title", ""), "bucket": bucket,
                "draft": bool(pr.get("draft")), "created_at": pr.get("created_at", ""),
                "quiet_hours": round(quiet_h, 1), "branch": pr["head"].get("ref", ""),
                **({"record": record} if record else {})}

    with ThreadPoolExecutor(max_workers=16) as pool:
        rows = [r for r in pool.map(one, unowned) if r]
    rows.sort(key=lambda r: (ORDER.index(r["bucket"]), r["created_at"], r["number"]))
    return rows


def render(rows: list[dict]) -> str:
    if not rows:
        return "No stalled unowned PRs: nothing for another session to land.\n"
    out = [f"{len(rows)} open PR(s) touch no owned path and have stopped moving "
           "(land-your-work.md, \"Other agents' unlanded work is yours too\").", ""]
    for bucket in ORDER:
        group = [r for r in rows if r["bucket"] == bucket]
        if not group:
            continue
        out += [f"## {bucket} ({len(group)}): {WHAT[bucket]}", "",
                "| PR | quiet | title |", "|---|---|---|"]
        for r in group:
            q = r["quiet_hours"]
            quiet = f"{q:.0f} h" if q < 48 else f"{q / 24:.0f} d"
            out.append(f"| #{r['number']} | {quiet} | {r['title'].replace('|', '/')} |")
        out.append("")
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--json", action="store_true", help="print rows as JSON")
    args = ap.parse_args(argv)
    rules = cpg.parse_codeowners(cpg.CODEOWNERS.read_text())
    repo = ohp.REPO
    try:
        prs = ohp.pages(f"/repos/{repo}/pulls?state=open")
        rows = stalled(
            prs,
            files_of=lambda n: ohp.pages(f"/repos/{repo}/pulls/{n}/files", limit=30),
            detail_of=lambda n: ohp.get(f"/repos/{repo}/pulls/{n}"),
            checks_of=lambda sha: ohp.get(
                f"/repos/{repo}/commits/{sha}/check-runs?per_page=100").get("check_runs", []),
            head_time_of=lambda sha: parse_time(
                ohp.get(f"/repos/{repo}/commits/{sha}")["commit"]["committer"]["date"]),
            rules=rules,
            now=dt.datetime.now(dt.timezone.utc),
            record_of=lambda path, sha: json.loads(base64.b64decode(
                ohp.get(f"/repos/{repo}/contents/{path}?ref={sha}")["content"])),
        )
    except Exception as e:  # network, proxy, rate limit
        print(f"stalled_prs: could not read GitHub ({e}); list open PRs by hand", file=sys.stderr)
        return 2
    print(json.dumps(rows, indent=2) if args.json else render(rows), end="\n" if args.json else "")
    return 0


if __name__ == "__main__":
    sys.exit(main())
