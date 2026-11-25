#!/usr/bin/env python3
"""Print the next security alert a session can take, and optionally claim it.

prompt.md step 0 asks every scheduled session to read `origin/security-alerts:QUEUE.md`
and take the top alert with no `security-fix/code-scanning-<n>` claim branch. Done by
hand that is a fetch, an `ls-remote`, a diff of two lists and a read of the triage notes,
and it races: on 2026-11-25 three runs reported the cost (run records' doc_friction,
prompt.md): one found every alert already claimed only after the ls-remote, one lost
#1049/#1050 to a session that pushed the claim between its read and its push, and one
re-triaged alerts an earlier run had already written up as false positives.

This does the routine part:

  python3 platform/ci/security_next.py           # print the next workable alert, or "none"
  python3 platform/ci/security_next.py --claim   # also claim it, atomically

Skipped: alerts with a claim branch, and alerts named in the triage notes
(`docs/reports/*security-queue*.md` on main: false positives and ones already fixed,
which only the owner can dismiss). `--claim` pushes the branch with
`--force-with-lease=<ref>:` (an empty expected value means "the ref must not exist"),
so of two sessions claiming the same alert at once exactly one push succeeds; the loser
moves on to the next alert instead of duplicating the fix.

Exit 0 with an alert printed; exit 3 when nothing is workable (go to step 1 of
prompt.md); exit 2 when the queue cannot be read.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
QUEUE_BRANCH = "security-alerts"
BRANCH_PREFIX = "security-fix/code-scanning-"
TRIAGE_GLOB = "docs/reports/*security-queue*.md"
TRIAGE_JSON = "platform/security/codeql-triage.json"  # reviewed false positives (PR 18809/18843)

LINE = re.compile(r"^- \[(?P<sev>\w+)\] #(?P<n>\d+) `(?P<rule>[^`]+)` in `(?P<loc>[^`]+)`")
# "#68–#91", "#1181 to #1203", "#115 to #118", "#7, #42, #43" in the triage notes.
RANGE = re.compile(r"#(\d+)\s*(?:–|-|to)\s*#?(\d+)")
SINGLE = re.compile(r"#(\d+)\b")
MAX_RANGE = 500  # a typo like "#1 to #9999" should not hide the whole queue


def parse_queue(text: str) -> tuple[str, list[dict]]:
    """('ok'|'empty'|'unavailable', alerts in queue order).

    An Unavailable queue still lists the last known alerts; they are not work until the
    cause is fixed. Lines under "## Triaged, awaiting dismissal" (PR 18843) are not work.
    """
    if "Unavailable:" in text:
        return "unavailable", []
    work = text.split("\n## Triaged", 1)[0]
    alerts = [m.groupdict() | {"n": int(m["n"])} for m in map(LINE.match, work.splitlines()) if m]
    return ("ok", alerts) if alerts else ("empty", [])


def triaged_numbers(texts: list[str]) -> set[int]:
    """Alert numbers the triage notes already account for (checked, false or fixed).

    Only lines that read as findings count: table rows and list items. Prose such as
    "the first scan found 977 alerts" never carries a '#'.
    """
    seen: set[int] = set()
    for text in texts:
        for line in text.splitlines():
            s = line.lstrip()
            if not s.startswith(("|", "-", "*")):
                continue
            for a, b in RANGE.findall(s):
                lo, hi = int(a), int(b)
                if lo <= hi <= lo + MAX_RANGE:
                    seen.update(range(lo, hi + 1))
            seen.update(int(n) for n in SINGLE.findall(s))
    return seen


def json_triaged(text: str) -> set[int]:
    try:
        data = json.loads(text)
    except ValueError:
        return set()
    entries = data.get("false_positives") if isinstance(data, dict) else None
    return {e["number"] for e in entries or [] if isinstance(e, dict) and isinstance(e.get("number"), int)}


def claimed_numbers(ls_remote: str) -> set[int]:
    out = set()
    for line in ls_remote.splitlines():
        ref = line.split()[-1] if line.split() else ""
        tail = ref.removeprefix("refs/heads/" + BRANCH_PREFIX)
        if tail != ref and tail.isdigit():
            out.add(int(tail))
    return out


def workable(alerts: list[dict], claimed: set[int], triaged: set[int]) -> list[dict]:
    return [a for a in alerts if a["n"] not in claimed and a["n"] not in triaged]


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=check)


def claim(n: int, base: str) -> bool:
    """Create the claim branch on origin only if it does not exist yet."""
    ref = f"refs/heads/{BRANCH_PREFIX}{n}"
    r = git("push", "-q", f"--force-with-lease={ref}:", "origin", f"{base}:{ref}", check=False)
    return r.returncode == 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--claim", action="store_true",
                    help="push the claim branch for the next workable alert (atomic; tries the next on a lost race)")
    ap.add_argument("--base", default="origin/main", help="commit the claim branch points at")
    args = ap.parse_args(argv)

    fetch = git("fetch", "-q", "--depth=1", "origin", QUEUE_BRANCH, check=False)
    if fetch.returncode != 0:
        print(f"Queue branch {QUEUE_BRANCH} not fetched (missing?): {fetch.stderr.strip()[:200]}")
        print("Nothing to take: go to step 1 of prompt.md.")
        return 3
    queue = git("show", f"origin/{QUEUE_BRANCH}:QUEUE.md", check=False)
    if queue.returncode != 0:
        print(f"Cannot read QUEUE.md: {queue.stderr.strip()[:200]}")
        return 2
    state, alerts = parse_queue(queue.stdout)
    if state == "unavailable":
        print("QUEUE.md says Unavailable: see prompt.md step 0 (check the CodeQL runs on main).")
        return 3
    if state == "empty":
        print("Queue empty: go to step 1 of prompt.md.")
        return 3

    claimed = claimed_numbers(git("ls-remote", "origin", f"refs/heads/{BRANCH_PREFIX}*").stdout)
    triaged = triaged_numbers([p.read_text(encoding="utf-8") for p in sorted(ROOT.glob(TRIAGE_GLOB))])
    if (ROOT / TRIAGE_JSON).is_file():
        triaged |= json_triaged((ROOT / TRIAGE_JSON).read_text(encoding="utf-8"))
    todo = workable(alerts, claimed, triaged)
    print(f"{len(alerts)} listed, {len(claimed & {a['n'] for a in alerts})} claimed, "
          f"{len(triaged & {a['n'] for a in alerts} - claimed)} more in the triage notes "
          f"({TRIAGE_GLOB}), {len(todo)} workable.")
    if not todo:
        print("Nothing to take: go to step 1 of prompt.md.")
        return 3

    for a in todo:
        if args.claim:
            if not claim(a["n"], args.base):
                print(f"#{a['n']}: claim lost (another session pushed it first); trying the next.")
                continue
            print(f"Claimed #{a['n']}: branch {BRANCH_PREFIX}{a['n']} on origin.")
        print(f"Next: [{a['sev']}] #{a['n']} {a['rule']} in {a['loc']}")
        print(f"Read: git show origin/{QUEUE_BRANCH}:alerts/{a['n']}.md   (its step 0 checks the scan is not stale)")
        if args.claim:
            print(f"Work: git checkout -B {BRANCH_PREFIX}{a['n']} {args.base}")
        return 0
    print("Every workable alert was claimed while this ran: go to step 1 of prompt.md.")
    return 3


if __name__ == "__main__":
    sys.exit(main())
