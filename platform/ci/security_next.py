#!/usr/bin/env python3
"""Print the next security alert a run can take, or say there is none (prompt.md, step 0).

Step 0 used to be four manual steps: fetch `security-alerts`, read QUEUE.md, list the
`security-fix/code-scanning-*` claim branches with `git ls-remote`, and cross off what the
triage notes on main already called false or fixed. Runs did it by hand and got it wrong:
on 2026-11-25 nine run records reported the same step (`friction_rank.py --live --days 3`,
prompt.md: "every alert already had a claim branch", "the top unclaimed alerts were already
triaged", "another session claimed #1049 between my read and my push"). This does all of it
in one call and, with --claim, takes the alert with a push that fails if the branch exists,
so two runs cannot both win the same alert.

Usage:
    python3 platform/ci/security_next.py            # what to take next, or "go to step 1"
    python3 platform/ci/security_next.py --claim    # also push its claim branch, and its batch's
    python3 platform/ci/security_next.py --all      # every workable alert, not just the top

Exit codes: 0 an alert is workable (printed first), 3 none is (queue empty, all claimed or
triaged: go to step 1), 2 the queue is unavailable or git failed.

Batch: each alert file says to fix every queued alert in the same file (and the same rule
in sibling files) in one PR, claiming each one's branch too, but --claim used to take only
the top alert, so the rest were claimed by hand or not at all (2026-11-27 friction: "there
is no flag to claim a list"). --claim now also claims the top alert's batch (`batch_of`)
and names each number won or lost; `--claim --no-batch` takes the top one alone.

The parsing (`parse_queue`, `triaged_numbers`, `pick`, `batch_of`) touches no network and is unit-tested
in test_security_next.py.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import subprocess
import sys

QUEUE_BRANCH = "security-alerts"
BRANCH_PREFIX = "security-fix/code-scanning-"  # same as security_alerts.BRANCH_PREFIX
TRIAGE_GLOB = "docs/reports/*security-queue*.md"  # same as security_alerts.TRIAGE_NOTES
# The reviewed false-positive list (PR #18843); once it is on main the queue lists its
# alerts under "## Triaged, awaiting dismissal", which is not work either.
TRIAGE_JSON = "platform/security/codeql-triage.json"

LINE = re.compile(r"^- \[(?P<sev>[a-z]+)\] #(?P<n>\d+) `(?P<rule>[^`]+)` in `(?P<where>[^`]+)`")
# "#68–#91", "#68-#91", "#115 to #118": a range; any other "#123" is one alert.
RANGE = re.compile(r"#(\d+)\s*(?:–|-|to)\s*#(\d+)")
SINGLE = re.compile(r"#(\d+)\b")
# A triage note also lists what it did *not* check; those numbers are not triaged.
UNCHECKED = re.compile(r"not checked|unchecked|onward|nobody has read", re.I)


def parse_queue(text: str) -> tuple[list[dict], str | None]:
    """The queue's alert lines in order, and its Unavailable: line if it has one."""
    for line in text.splitlines():
        if line.startswith("Unavailable:"):
            return [], line
    alerts = []
    for line in text.split("\n## Triaged", 1)[0].splitlines():
        m = LINE.match(line)
        if m:
            alerts.append({"number": int(m["n"]), "severity": m["sev"], "rule": m["rule"],
                           "where": m["where"], "line": line})
    return alerts, None


def triaged_numbers(text: str) -> set[int]:
    """Alert numbers a triage note lists as false or already fixed.

    Numbers under a heading or on a line that says they were not checked are left out.
    """
    out: set[int] = set()
    skip_section = False
    for line in text.splitlines():
        if re.match(r"^#{1,6} ", line):
            skip_section = bool(UNCHECKED.search(line))
            continue
        if skip_section or UNCHECKED.search(line):
            continue
        for a, b in RANGE.findall(line):
            lo, hi = int(a), int(b)
            if 0 < hi - lo <= 500:
                out.update(range(lo, hi + 1))
        for n in SINGLE.findall(RANGE.sub("", line)):
            out.add(int(n))
    return out


def json_triaged(text: str) -> set[int]:
    """Alert numbers in codeql-triage.json; a missing or unreadable file means none."""
    try:
        data = json.loads(text)
    except ValueError:
        return set()
    entries = data.get("false_positives") if isinstance(data, dict) else None
    return {e["number"] for e in entries or []
            if isinstance(e, dict) and isinstance(e.get("number"), int)}


def claimed_numbers(ls_remote: str) -> set[int]:
    out = set()
    for line in ls_remote.splitlines():
        ref = line.split()[-1] if line.split() else ""
        tail = ref.rsplit(BRANCH_PREFIX, 1)
        if len(tail) == 2 and tail[1].isdigit():
            out.add(int(tail[1]))
    return out


def pick(alerts: list[dict], claimed: set[int], triaged: set[int]) -> list[dict]:
    return [a for a in alerts if a["number"] not in claimed and a["number"] not in triaged]


def _file(alert: dict) -> str:
    return alert["where"].rsplit(":", 1)[0]


def batch_of(top: dict, todo: list[dict]) -> list[dict]:
    """The other workable alerts the alert files say to fix with `top` in one PR: every
    one in the same file, and the same rule in a sibling file (same directory)."""
    path = _file(top)
    folder = path.rsplit("/", 1)[0] if "/" in path else ""

    def sibling(a: dict) -> bool:
        p = _file(a)
        return (p.rsplit("/", 1)[0] if "/" in p else "") == folder

    return [a for a in todo if a["number"] != top["number"]
            and (_file(a) == path or (a["rule"] == top["rule"] and sibling(a)))]


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], capture_output=True, text=True, check=check)


def triage_text() -> str:
    names = git("ls-tree", "--name-only", "origin/main", "docs/reports/", check=False).stdout.split()
    pat = re.compile("^" + re.escape(TRIAGE_GLOB).replace(r"\*", ".*") + "$")
    return "\n".join(git("show", f"origin/main:{n}", check=False).stdout
                     for n in names if pat.match(n))


def triaged_on_main() -> set[int]:
    return (triaged_numbers(triage_text())
            | json_triaged(git("show", f"origin/main:{TRIAGE_JSON}", check=False).stdout))


def claim(n: int) -> str | None:
    """Push the claim branch, create-only; the claim commit's sha on success, else None.

    An empty --force-with-lease value fails if the branch exists, but only when git has
    something to push: if two runs both pushed `origin/main` itself, the loser's push of
    the same sha is "Everything up-to-date", exit 0, and both would think they won
    (test_security_next.ClaimRaceTest caught this). So each claim pushes its own empty
    commit on top of origin/main, whose sha no other run can have.
    """
    ref = f"refs/heads/{BRANCH_PREFIX}{n}"
    env = {"GIT_AUTHOR_NAME": "security-next", "GIT_AUTHOR_EMAIL": "security-next@invalid",
           "GIT_COMMITTER_NAME": "security-next", "GIT_COMMITTER_EMAIL": "security-next@invalid"}
    made = subprocess.run(
        ["git", "commit-tree", "origin/main^{tree}", "-p", "origin/main",
         "-m", f"claim code-scanning alert #{n} ({secrets.token_hex(8)})"],
        capture_output=True, text=True, env={**os.environ, **env})
    if made.returncode != 0:
        return None
    sha = made.stdout.strip()
    r = git("push", f"--force-with-lease={ref}:", "origin", f"{sha}:{ref}", check=False)
    return sha if r.returncode == 0 else None


def claim_batch(top: dict, todo: list[dict]) -> list[int]:
    """Claim `top`'s batch; print and return the numbers won. A lost one is another run's."""
    batch = batch_of(top, todo)
    if not batch:
        return []
    won = [a["number"] for a in batch if claim(a["number"])]
    lost = [a["number"] for a in batch if a["number"] not in won]
    if won:
        print("Batch (same file, or same rule beside it): also claimed "
              + ", ".join(f"#{n}" for n in won)
              + f". Fix them in the same PR, on the #{top['number']} branch; their own claim "
              "branches only hold the claim, so leave them for branch_cleanup.py.")
        for a in batch:
            if a["number"] in won:
                print("  " + a["line"])
    if lost:
        print("Another run holds " + ", ".join(f"#{n}" for n in lost)
              + ": leave those to it.")
    return won


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--claim", action="store_true", help="push the claim branch of the alert taken")
    ap.add_argument("--all", action="store_true", help="list every workable alert")
    ap.add_argument("--no-batch", action="store_true",
                    help="with --claim, take the top alert alone, not its same-file batch")
    args = ap.parse_args(argv)

    try:
        git("fetch", "-q", "--depth=1", "origin", QUEUE_BRANCH, "main")
    except subprocess.CalledProcessError as e:
        print(f"could not fetch {QUEUE_BRANCH}/main: {e.stderr.strip()}\n"
              "If the branch does not exist yet, the queue is empty: go to step 1.")
        return 2
    queue = git("show", f"origin/{QUEUE_BRANCH}:QUEUE.md", check=False).stdout
    alerts, unavailable = parse_queue(queue)
    if unavailable:
        print(unavailable)
        print("Check the last CodeQL and Security alert queue runs on main (prompt.md, step 0).")
        return 2
    claimed = claimed_numbers(git("ls-remote", "origin", f"refs/heads/{BRANCH_PREFIX}*").stdout)
    triaged = triaged_on_main()
    scanned = re.search(r"Scanned commit: `([0-9a-f]+)`", queue)
    todo = pick(alerts, claimed, triaged)
    listed = {a["number"] for a in alerts}
    print(f"{len(alerts)} alert(s) queued; {len(listed & claimed)} claimed, "
          f"{len((listed - claimed) & triaged)} more triaged ({TRIAGE_JSON}, {TRIAGE_GLOB}); "
          f"{len(todo)} workable.")
    if not todo:
        if args.claim:
            # The usual way here: a plain read listed an alert, another run claimed it
            # before this --claim. Say so plainly so nobody starts on an alert they lost.
            print("Nothing claimed by this run: any alert an earlier read listed now belongs "
                  "to another run's claim branch, so do not start on it.")
        print("None to take: go to step 1 (route).")
        return 3
    if scanned:
        print(f"Scanned commit {scanned[1]}: check the file changed since with "
              f"`git diff --stat {scanned[1]} origin/main -- <path>` before fixing.")
    for a in todo if args.all else todo[:1]:
        print(a["line"])
    if args.claim:
        for a in todo:
            sha = claim(a["number"])
            if sha:
                print(f"Claimed: pushed {BRANCH_PREFIX}{a['number']}. "
                      f"Read `git show origin/{QUEUE_BRANCH}:alerts/{a['number']}.md`; "
                      f"work on it with `git checkout -B {BRANCH_PREFIX}{a['number']} {sha[:12]}` "
                      "(the branch holds one empty claim commit, so start from it, not origin/main).")
                if not args.no_batch:
                    claim_batch(a, todo)
                return 0
            print(f"#{a['number']} was claimed by another run first; trying the next.")
        print("Every workable alert was claimed while this ran: go to step 1.")
        return 3
    top = todo[0]["number"]
    print(f"Next: `git show origin/{QUEUE_BRANCH}:alerts/{top}.md`; claim it with --claim.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
