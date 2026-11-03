#!/usr/bin/env python3
"""Say which repository guards did not run, and name the command that fixes each.

    python3 platform/ci/guard_state.py
    python3 platform/ci/guard_state.py --json
    python3 platform/ci/guard_state.py --require-runnable  # exits 1 on a fixable skip

## Why this exists

CLAUDE.md's starvation checklist ends every pytest line with a count, and a
session reads that count to decide whether the tree is sound. On 2026-09-10 the
`gitops/tests` line in a web session read:

    533 passed, 25 skipped

which is what a clean run looks like. Seventeen of those 25 were
`test_front_door_serving.py` -- the only check in the tree that boots a real
nginx over the front door's own built ConfigMaps and asks it for a tool page.
Its own docstring says why that matters: both ways the gz-only mirror can go
dark are *textually clean*, so every other check on the apex passes while the
entire product surface 404s. It skipped because the image has no nginx. Six
more were `test_load_ssh_key.py`, which guards the loader for the one
credential every route to the Hetzner boxes is blocked on; it skipped because
the image has no `ssh-keygen`.

Both were installable in this environment in one `apt-get` line each, and both
then passed -- 19 and 11. Nothing was broken. That is the point: the session
could not have known that, and neither could the four before it, because a
skip inside a passing suite is indistinguishable at a glance from a test that
ran.

This is the same defect this repository has now paid for five times, and the
fifth is the one this file is modelled on. `browser_checks.py` sat correct and
unrun for the whole life of the catalogue while 48 critical axe `label`
violations shipped to live products, because every session wrote "no Playwright
in this environment" and moved on -- until CLAUDE.md recorded the one
`npm install` line that was the entire barrier. `run_workflow_locally.py` had
the same hole at the *step* level and closed it by reporting `UNRUN` rather
than `FAILED`, on the stated grounds that a red meaning "nothing ran" wearing
the costume of a red meaning "your code is broken" trains a reader to ignore
the result.

A skip is the same costume worn the other way round: it is a *green* that means
nothing ran. `browser_state.py` already refuses to record one as a pass. This
tool is that principle applied to the pytest suites, which is where the
checklist actually sends a session.

## What it does, and what it refuses to do

It **runs the suites and reads what actually skipped**, rather than scanning
the sources for skip predicates. That is deliberate, and it is the same
preference `run_workflow_locally.py` states for reading the workflow files over
a hand-copied list: a reading taken from something present cannot go stale, and
a static scan would miss every guard whose skip condition is computed (
`test_front_door_serving.py` resolves its nginx from a candidate list, not a
literal) while inventing guards from `shutil.which` calls that skip nothing.

Each distinct skip reason is then classified into exactly three buckets:

  - **FIXABLE** -- the reason names a tool this environment can install, and
    the install command is printed. These are the ones that were never a
    verdict about the repository at all.
  - **ENVIRONMENTAL** -- the guard is genuinely inapplicable here (it wants a
    GitHub-hosted runner, or a full clone this shallow checkout does not
    have). Reported, never counted against the tree.
  - **UNCLASSIFIED** -- a reason this tool's table does not recognise. These
    are printed loudest of the three, because an unrecognised reason is how
    the table goes quietly stale, and a tool that dropped them would recreate
    the exact silence it exists to break.

`--require-runnable` exits 1 while any FIXABLE skip stands, so "this guard did
not run" stops being something a session has to remember to look for. Bare
invocation reports and exits 0: that answers "what is the state of the tree?",
which is a different question, and folding the two together would make a green
run mean two things.

It never installs anything itself. Installing is a side effect a check should
not have -- the same line `pages_state.py` holds, which reports a stale
snapshot and makes you run the publish yourself.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent

# The suites CLAUDE.md's starvation checklist actually sends a session to run
# with pytest. Listed literally rather than discovered by glob, for the reason
# that file gives about its own checklist: a glob would silently absorb a new
# directory, and the point of `checklist_coverage.py` is that a new test
# directory should be *noticed*, not auto-adopted. If you add a suite to the
# checklist, add it here in the same commit.
SUITES = (
    "portfolio/ledger",
    "portfolio/scoring",
    "portfolio/router",
    "portfolio/usage",
    "portfolio/pipeline",
)

# reason-substring -> (what is missing, the one command that supplies it)
#
# Matched as a substring of the skip reason pytest printed, lowercased. Keep
# these keyed on the *reason text* rather than on a binary name: the reason is
# what a session actually sees, and several guards skip for a missing tool
# without ever naming it in a `which()` call this tool could read.
#
# Every apt line is `apt-get update && apt-get install`, and the first half is
# not decoration. Measured 2026-09-10 in a web session: the bare `apt-get
# install` these lines used to print failed with
#
#   Failed to fetch .../nginx-light_1.24.0-2ubuntu7.6_all.deb  404  Not Found
#
# because the image ships a package index pinned to versions the mirror has
# already superseded (7.6 -> 7.17), and apt asks for the version it was told
# about rather than the one that exists. With `apt-get update` first, the same
# install succeeds and all 24 assertions run. So a session that did exactly what
# this tool told it to still could not clear a FIXABLE skip, and the next honest
# move from there is to report the tree green with 24 guards unrun -- which is
# the precise failure `--require-runnable` exists to prevent. A fix line that
# does not work is worse than no fix line: it spends the session's trust too.
FIXABLE = {
    "nginx is not installed": (
        "nginx",
        "apt-get update && apt-get install -y --no-install-recommends nginx-light",
    ),
    "nginx mime.types": (
        "nginx",
        "apt-get update && apt-get install -y --no-install-recommends nginx-light",
    ),
    "built without": (
        "an nginx with gzip_static/gunzip",
        "apt-get update && apt-get install -y --no-install-recommends nginx-light",
    ),
    "ssh-keygen unavailable": (
        "ssh-keygen",
        "apt-get update && apt-get install -y --no-install-recommends openssh-client",
    ),
    "no module named pytest": (
        "pytest",
        "pip install pytest",
    ),
}

# Reasons that are true statements about where this is running, not about the
# tree. A guard that wants a GitHub-hosted runner is not "unrun" in any sense a
# session can act on.
ENVIRONMENTAL = (
    "only meaningful on a github-hosted runner",
    "requires root",
    "geteuid",
    "clone is shallow",
    "shallow clone",
    "unshallow",
)

SKIP_LINE = re.compile(r"^SKIPPED \[(\d+)\]\s*(\S+?):(\d+):\s*(.*)$")


def _classify(reason: str) -> tuple[str, str | None, str | None]:
    """Return (bucket, what_is_missing, install_command)."""
    low = reason.lower()
    for needle, (missing, command) in FIXABLE.items():
        if needle in low:
            return "fixable", missing, command
    for needle in ENVIRONMENTAL:
        if needle in low:
            return "environmental", None, None
    return "unclassified", None, None


def _run_suite(suite: str) -> tuple[list[dict], str | None]:
    """Run one suite and return (skips, fatal). `fatal` is set when the suite
    could not run at all -- which is itself the `UNRUN` case, not a pass."""
    path = REPO / suite
    if not path.exists():
        return [], f"{suite}: not present in this checkout"
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", suite, "-q", "-rs", "--no-header"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    out = proc.stdout + proc.stderr
    if "No module named pytest" in out:
        return [], f"{suite}: pytest itself is missing -- `pip install pytest`"
    skips = []
    for line in out.splitlines():
        m = SKIP_LINE.match(line.strip())
        if not m:
            continue
        count, file_, lineno, reason = m.groups()
        bucket, missing, command = _classify(reason)
        skips.append(
            {
                "suite": suite,
                "file": file_,
                "line": int(lineno),
                "count": int(count),
                "reason": reason,
                "bucket": bucket,
                "missing": missing,
                "command": command,
            }
        )
    return skips, None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--json", action="store_true", help="machine-readable report")
    ap.add_argument(
        "--require-runnable",
        action="store_true",
        help="exit 1 while any guard is skipping for a reason this host can fix",
    )
    ap.add_argument(
        "--suite",
        action="append",
        help="check only this suite (repeatable); default is the checklist set",
    )
    args = ap.parse_args()

    suites = args.suite or list(SUITES)
    all_skips: list[dict] = []
    fatals: list[str] = []
    for suite in suites:
        skips, fatal = _run_suite(suite)
        all_skips.extend(skips)
        if fatal:
            fatals.append(fatal)

    fixable = [s for s in all_skips if s["bucket"] == "fixable"]
    unclassified = [s for s in all_skips if s["bucket"] == "unclassified"]
    environmental = [s for s in all_skips if s["bucket"] == "environmental"]

    if args.json:
        print(
            json.dumps(
                {
                    "suites": suites,
                    "fatal": fatals,
                    "fixable": fixable,
                    "unclassified": unclassified,
                    "environmental": environmental,
                },
                indent=2,
            )
        )
        return 1 if (args.require_runnable and (fixable or fatals)) else 0

    print("Guard state — which checks did not run, and why\n")

    for f in fatals:
        print(f"  COULD NOT RUN  {f}")
    if fatals:
        print()

    if fixable:
        # Group by the command that fixes them, because that is the unit of
        # action: one apt line usually unblocks a whole file's worth of guards.
        by_command: dict[str, list[dict]] = {}
        for s in fixable:
            by_command.setdefault(s["command"], []).append(s)
        total = sum(s["count"] for s in fixable)
        print(f"  FIXABLE — {total} assertion(s) across {len(fixable)} guard(s) did not run")
        print("  These are not a verdict about this tree. Nothing has been checked here.\n")
        for command, group in sorted(by_command.items()):
            files = sorted({s["file"] for s in group})
            missing = group[0]["missing"]
            print(f"    missing: {missing}")
            for file_ in files:
                n = sum(s["count"] for s in group if s["file"] == file_)
                print(f"      {file_}  ({n} skipped)")
            print(f"      fix:  {command}\n")

    if unclassified:
        print(f"  UNCLASSIFIED — {len(unclassified)} skip reason(s) this tool does not recognise")
        print("  Read each one. If it names a missing tool, add it to FIXABLE in")
        print("  this file; if it is a statement about the host, add it to")
        print("  ENVIRONMENTAL. An unrecognised reason is how this table goes stale.\n")
        for s in unclassified:
            print(f"    {s['file']}:{s['line']}  {s['reason']}")
        print()

    if environmental:
        print(f"  ENVIRONMENTAL — {len(environmental)} guard(s) genuinely do not apply here")
        for s in environmental:
            print(f"    {s['file']}:{s['line']}  {s['reason']}")
        print()

    if not all_skips and not fatals:
        print("  Every guard in the checklist suites ran. No skips at all.")
        return 0

    if fixable or fatals:
        print("  Install what is named above and re-run the suite before you")
        print("  report the tree as green. A skip is a green that means nothing ran.")
        if args.require_runnable:
            return 1
    elif not unclassified:
        print("  No fixable skips: every guard that can run here did run.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
