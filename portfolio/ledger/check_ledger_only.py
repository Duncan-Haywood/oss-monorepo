#!/usr/bin/env python3
"""Fail a change that adds ledger prose and nothing else.

Why this exists as a script rather than a line of prose: the rule already
existed as prose. `AGENTS.md` has said "do not open ledger-only PRs" since the
file was written, and in the seven days to 2026-09-02 the fleet still landed
**381 commits on `main` that touched nothing but `portfolio/ledger/*.yaml`** —
34.6% of 1,102. The soft wording carried an escape hatch ("...that re-state
known blockers"), and a session writing a genuinely new entry read itself as
the exception every time. A rule a third of commits break is not a rule.

What counts as prose here is the ledger *data*: `2026-08.yaml`, `asks.yaml`,
`README.md` and friends. The ledger *tooling* (`session_gate.py`,
`supersede_check.py`, their tests) is ordinary platform code and is exempt —
those are 4 of the 385 ledger-only commits in that window, and they are not
the problem.

Recording an outcome stays correct and stays cheap. It just rides along with
the work it describes, in the same commit or the same PR, instead of becoming
the deliverable. A session that shipped nothing has nothing to record.

Usage:
    python3 portfolio/ledger/check_ledger_only.py              # branch vs origin/main
    python3 portfolio/ledger/check_ledger_only.py --staged     # what you are about to commit
    python3 portfolio/ledger/check_ledger_only.py --commit SHA # one commit

Exit 0 = the change carries something besides ledger prose. Exit 1 = it does
not, and the message names what to do instead.
"""

from __future__ import annotations

import argparse
import subprocess
import sys

LEDGER_DIR = "portfolio/ledger/"


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


def is_ledger_prose(path: str) -> bool:
    """A ledger data file — the thing this check is about."""
    return path.startswith(LEDGER_DIR) and not path.endswith(".py")


def classify(files: list[str]) -> tuple[list[str], list[str]]:
    """Split into (ledger prose, everything else)."""
    prose = [f for f in files if is_ledger_prose(f)]
    other = [f for f in files if not is_ledger_prose(f)]
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
        print(f"OK — {len(other)} file(s) outside the ledger prose.")
        if prose:
            print(f"     ({len(prose)} ledger file(s) riding along, which is the point.)")
        return 0

    print("LEDGER-ONLY CHANGE — this is not a deliverable.\n")
    for path in prose:
        print(f"  {path}")
    print(
        "\nEvery file in this change is ledger prose. In the seven days to"
        "\n2026-09-02 the fleet landed 381 such commits — 34.6% of everything"
        "\nmerged — while no product had a single observed user."
        "\n\nDo one of these instead:"
        "\n  - Ship the change the entry describes, and let the entry ride"
        "\n    along in the same commit."
        "\n  - If the session found a blocker rather than shipping: say so in"
        "\n    the reply, and leave `main` alone. An unshipped session is a"
        "\n    real outcome; it does not need a commit to be true."
        "\n  - If you are editing the ledger *tooling*, that is exempt —"
        "\n    `.py` under portfolio/ledger/ passes this check."
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
