#!/usr/bin/env python3
"""Fail a change that only restates the direction brief and ships nothing.

Why this exists as a script rather than more prose: the rule already existed
as prose, twice. `portfolio/DIRECTION.md`'s "Before rewriting this brief
again" section (added 2026-09-07) says a session should check
`git log -5 -- portfolio/DIRECTION.md AGENTS.md` before writing another
paragraph, because three direction-only PRs had just landed in three hours
restating the same north star (viable businesses, donations-only revenue,
happy customers, legal exposure as the hard stop, new ventures ranked first)
without shipping a venture, fixing a defect, or moving a usage number. That
warning did not close the loop: `git log` against `origin/main` on
2026-09-08 shows well over a dozen direction-only commits to those same two
files across 2026-09-06 and 2026-09-07, several landing *after* the warning
was already in the file being rewritten. A prose reminder a session can only
see after opening the file is exactly the shape `check_ledger_only.py`
already proved doesn't hold on its own — that check exists because
`AGENTS.md` said "do not open ledger-only PRs" for weeks while 34.6% of
merges did anyway.

What counts as direction-only here: a change touching `portfolio/DIRECTION.md`
and/or `AGENTS.md` and nothing else. Those are the two files the "Before
rewriting this brief again" section names by exact path, and the two files a
scheduled "set direction" brief is asked to update. A change that also ships
or fixes something else — a venture, a tool, a test, `PRODUCT_PLAYBOOK.md`,
the pipeline — rides through clean, same as `check_ledger_only.py` waves
through a ledger entry that travels with the work it describes. A genuine,
small, targeted correction to one of the two files (a wrong number, a broken
pointer, a rule the file doesn't yet cover) is still meant to happen in the
same PR as real work, per the file's own guidance — this check is what makes
that guidance land on a diff instead of on a session's judgment alone.

Usage:
    python3 portfolio/ledger/check_direction_only.py              # branch vs origin/main
    python3 portfolio/ledger/check_direction_only.py --staged     # what you are about to commit
    python3 portfolio/ledger/check_direction_only.py --commit SHA # one commit

Exit 0 = the change carries something besides the two direction files. Exit 1
= it does not, and the message points at what to do instead.
"""

from __future__ import annotations

import argparse
import subprocess
import sys

DIRECTION_FILES = {"portfolio/DIRECTION.md", "AGENTS.md"}


def _git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, check=True
    ).stdout


def changed_files(mode: str, ref: str) -> list[str]:
    if mode == "staged":
        out = _git("diff", "--cached", "--name-only")
    elif mode == "commit":
        out = _git("show", "--name-only", "--format=", ref)
    else:
        # Merge base, so a stale branch is judged on its own commits rather
        # than on everything main has moved on to since.
        base = _git("merge-base", ref, "HEAD").strip()
        out = _git("diff", "--name-only", base, "HEAD")
    return [line for line in out.splitlines() if line.strip()]


def is_direction_prose(path: str) -> bool:
    """One of the two files the restated brief actually lives in."""
    return path in DIRECTION_FILES


def classify(files: list[str]) -> tuple[list[str], list[str]]:
    """Split into (direction prose, everything else)."""
    prose = [f for f in files if is_direction_prose(f)]
    other = [f for f in files if not is_direction_prose(f)]
    return prose, other


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--staged", action="store_true", help="check the staged change"
    )
    group.add_argument("--commit", metavar="SHA", help="check one commit")
    parser.add_argument(
        "--base",
        default="origin/main",
        help="base ref for the branch comparison (default: origin/main)",
    )
    args = parser.parse_args()

    if args.staged:
        mode, ref = "staged", ""
    elif args.commit:
        mode, ref = "commit", args.commit
    else:
        mode, ref = "branch", args.base

    try:
        files = changed_files(mode, ref)
    except subprocess.CalledProcessError as exc:
        print(f"git failed: {exc.stderr.strip()}", file=sys.stderr)
        # Don't block work on a shallow clone or a missing ref — say so and
        # pass. A gate that fires on its own plumbing gets disabled, and then
        # it gates nothing.
        print("Could not read the diff; not treating that as a violation.")
        return 0

    if not files:
        print("No changes to check.")
        return 0

    prose, other = classify(files)

    if other:
        print(f"OK — {len(other)} file(s) outside the two direction files.")
        if prose:
            print(
                f"     ({len(prose)} direction file(s) riding along, which is fine "
                "— a targeted correction next to real work is what "
                "DIRECTION.md's own guidance asks for.)"
            )
        return 0

    print("DIRECTION-ONLY CHANGE — this is not a deliverable.\n")
    for path in prose:
        print(f"  {path}")
    print(
        "\nEvery file in this change is one of the two files the fleet's north"
        "\nstar already lives in. Well over a dozen direction-only commits"
        "\nlanded on 2026-09-06/07 restating the same viable-business/"
        "\ndonations/legal-exposure/new-ventures-first brief in slightly"
        "\ndifferent words, and none of them shipped a venture, fixed a"
        "\ndefect, or moved a usage number — see DIRECTION.md's own 'Before"
        "\nrewriting this brief again' section."
        "\n\nBefore pushing this, check whether it's actually needed:"
        "\n  - Run `git log -5 -- portfolio/DIRECTION.md AGENTS.md`. If either"
        "\n    file was substantively touched recently and its 'North star'"
        "\n    section already matches what you were about to write, don't"
        "\n    push this — spend the session on `portfolio/router/allocate.py`'s"
        "\n    top candidate, or screening a fresh venture against"
        "\n    `portfolio/pipeline/screened-out.md`, instead."
        "\n  - If you found a genuine gap (a wrong number, a broken pointer,"
        "\n    a rule the file doesn't yet cover), fold this same edit into a"
        "\n    PR that also ships or fixes something else — that is what"
        "\n    makes it a correction instead of a restatement."
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
