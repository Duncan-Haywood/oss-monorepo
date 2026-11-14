#!/usr/bin/env python3
"""Keep `platform/privacy/optout-switches.txt` in step with the tree.

That file lists every venture usage module whose in-page "turn usage counting
off" switch `platform/privacy/optout-persistence.test.mjs` must find and
find working. The test fails when the list and the tree disagree.

Until 2026-11-14 the same guard pinned a single number,
`SWITCHES_IN_THE_CATALOGUE = N`, and this script rewrote it. Every new
venture with a usage module had to bump it, so two PRs open at once each
raised it by one against the same base: a merge conflict at best (a merge
commit on 2026-11-13 was "opt-out count 1321"), and at worst a count one
short on `main` ("optout-persistence: +1 for gaussian-process-regression's
usage switch (main was red)", the same day). The file was
edited by 31 commits in three days, ~23 run records of 2026-11-11..14 name it
as a red CI round or a merge chore, and the 1,700-line "+1: X graduated"
changelog above the constant was most of the test file. A sorted list of
names fixes all three: two new ventures add two different lines that merge
cleanly, the failure says which module moved instead of a bare count, and the
history is `git log` of the list.

What this script does:

  - adds every module the guard finds offering a switch that the list lacks
    (a new venture; the guard's own drive is the derivation, never a second
    copy of it);
  - removes a listed module whose file no longer exists (a deleted or renamed
    venture: there is nothing left to protect);
  - NEVER removes a listed module whose file still exists but no longer
    offers a working switch. That is the regression the guard exists to
    catch; it is reported, exit 1, and the module is what needs fixing.

Usage:

    python3 platform/ci/sync_tree_counts.py            # add new, drop deleted
    python3 platform/ci/sync_tree_counts.py --check    # report, exit 1 on any difference

Exit codes: 0 in step (or fixed), 1 a difference under `--check` or a switch
that stopped being one, 2 the derivation could not run or found nothing --
never reported as "in sync", so "no reading taken" never reads as a pass.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LIST = "platform/privacy/optout-switches.txt"


class DerivationError(RuntimeError):
    """The switch set could not be derived. Never the same as an empty set."""


def optout_switches() -> list[str]:
    """Repo-relative paths of venture usage modules that offer an opt-out.

    Calls `checkAll` from `platform/privacy/optout-persistence.mjs` -- the
    behavioural check itself -- with the test's own predicate (`status !==
    "no-switch"`), so a broken switch (`fail`, `undrivable`) still counts as
    offered and the test, not this script, reports it.
    """
    module = REPO / "platform" / "privacy" / "optout-persistence.mjs"
    if not module.exists():
        raise DerivationError(f"{module} is missing; cannot derive the opt-out switches")
    script = (
        "import { checkAll } from %s;\n"
        "const results = await checkAll(%s);\n"
        "const switched = results.filter((r) => r.status !== 'no-switch').map((r) => r.name);\n"
        "console.log(JSON.stringify({ switched }));\n"
    ) % (json.dumps(module.as_posix()), json.dumps((REPO / "ventures").as_posix()))
    proc = subprocess.run(["node", "--input-type=module", "-e", script],
                          capture_output=True, text=True, cwd=REPO)
    if proc.returncode != 0:
        raise DerivationError("could not run the opt-out check through Node "
                              f"(exit {proc.returncode}): {proc.stderr.strip()[:400]}")
    try:
        names = json.loads(proc.stdout.strip().splitlines()[-1])["switched"]
        assert isinstance(names, list) and all(isinstance(n, str) for n in names)
    except Exception as exc:
        raise DerivationError(f"unexpected output from the opt-out check: "
                              f"{proc.stdout.strip()[:200]!r}") from exc
    return sorted(set(names))


def read_list(path: Path) -> tuple[list[str], list[str]]:
    """(header comment lines, listed paths) of the list file."""
    header, names = [], []
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            if not names:
                header.append(line)
            continue
        names.append(s)
    return header, names


def plan(listed: list[str], found: list[str], exists=lambda rel: (REPO / rel).exists()):
    """(added, deleted, stopped): new switches, listed files that are gone,
    and listed files that still exist but no longer offer a switch."""
    have, now = set(listed), set(found)
    added = sorted(now - have)
    gone = sorted(have - now)
    deleted = [n for n in gone if not exists(n)]
    stopped = [n for n in gone if exists(n)]
    return added, deleted, stopped


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true", help="report differences and exit 1; write nothing")
    args = ap.parse_args(argv)

    path = REPO / LIST
    if not path.exists():
        print(f"  {LIST} is missing.")
        return 2
    try:
        found = optout_switches()
    except DerivationError as exc:
        print(f"  COULD NOT DERIVE: {exc}\n  Not reporting anything as in sync on a reading never taken.")
        return 2
    # Over a thousand modules offer a switch; none found means the drive broke.
    if not found:
        print("  REFUSING: derived no opt-out switches at all, which is a broken derivation, "
              "not a tree state. Nothing written.")
        return 2

    header, listed = read_list(path)
    added, deleted, stopped = plan(listed, found)
    unsorted = listed != sorted(set(listed))
    print(f"opt-out switches: {len(found)} found, {len(listed)} listed in {LIST}")
    for n in added:
        print(f"  NEW      {n}")
    for n in deleted:
        print(f"  DELETED  {n}  (file gone)")
    for n in stopped:
        print(f"  STOPPED  {n}  -- still exists but no longer offers a switch the guard can drive")
    if unsorted:
        print("  ORDER    the list is not sorted and unique")

    if stopped:
        print("\n  A STOPPED module is the regression the guard exists to catch: fix its usage "
              "module (or, if the venture deliberately dropped the switch, delete its line by "
              "hand and say why in the commit). This script never removes it.")

    if args.check:
        if added or deleted or unsorted:
            print("  Run without --check to add the new lines and drop the deleted ones.")
        return 1 if (added or deleted or stopped or unsorted) else 0

    if added or deleted or unsorted:
        keep = sorted((set(listed) - set(deleted)) | set(added))
        path.write_text("\n".join(header + keep) + "\n", encoding="utf-8")
        print(f"  Rewrote {LIST}.")
    return 1 if stopped else 0


if __name__ == "__main__":
    sys.exit(main())
