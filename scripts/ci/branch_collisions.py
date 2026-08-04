#!/usr/bin/env python3
"""
Parallel-work collision detector.

Several automated sessions work this repository at once. They read the same
`docs/ENGINEERING-ROADMAP.md`, pick the same top item, and write the same file —
on different branches, so neither can see the other. Measured 2026-08-02 across
the 31 local branches not in `origin/main`:

  * `scripts/ci/release_lag.py` and `tests/test_release_lag.py` were created
    twice, by commits **twelve minutes apart** (14:47 and 14:59), each a
    complete control with its own policy file, tests and documentation.
  * `platform/ci/test/homepage-release-surface.test.mjs` was created twice, ten
    hours apart, both fixing the same live exposure of `/Dockerfile`.
  * `src/lib/routeAuthPosture.test.ts` was created twice in `quick-pick-survey`
    (twelve minutes apart) and twice in `local-site-studio` (six minutes apart)
    on 2026-08-01.
  * `ShareInsightModal.test.tsx` was created three times.

Six of the 86 files added in unshipped commits exist in more than one
independent version. None of them can merge cleanly.

The cause is the pile measured by `scripts/ci/release_lag.py`, running one level
up. Nothing merges, so every session starts from an `origin/main` that is days
stale, cannot see what the other sessions have already built, and re-derives it.
The duplication rate is a function of how much work is sitting unmerged, which
means it gets worse on its own.

This does not deduplicate anything — choosing between two good implementations
of the same control is a review decision. It reports which paths have competing
versions and which commits produced them, so the choice is made once, on
purpose, rather than discovered during a merge.

Distinguishes a genuine duplicate from shared history: a file added by one
commit and inherited by thirty descendant branches is one creation, not thirty.
Only the set of distinct *creating commits* counts.

The baseline is verified against the remote before anything is counted. It used
to be read straight from `refs/remotes/origin/main` — a local file that was
overwritten by hand four times in this repository, which shrank the release-lag
gate from 336 to 2 and would shrink this count the same way, since commits the
baseline already contains cannot collide. `scripts/ci/baseline_trust.py` carries
the evidence and does the check.

Usage:
    python3 scripts/ci/branch_collisions.py            # audit, exit 1 over budget
    python3 scripts/ci/branch_collisions.py --report   # always exit 0
    python3 scripts/ci/branch_collisions.py --json
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence

# Sibling module. Explicit rather than relying on `sys.path[0]`, so this keeps
# working when the file is imported rather than executed.
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from baseline_trust import describe as describe_trust, trust_findings, verify_baseline

BUDGET_PATH = "platform/release-lag-budget.yaml"

# Declared here rather than in YAML: the number that matters is zero, and a
# repository sitting above it should be reading the report, not tuning a
# threshold. Today's measurement is 9, which is over this budget, and the only
# edit that closes the gap is shipping: this counts distinct creating commits
# among commits not in `origin/main`, so integrating the rival branches moved
# those commits into `main` rather than removing them. Raising the number to
# match the measurement was attempted on 2026-08-04 and refused by
# `scripts/ci/cap_ratchet.py`, which holds this constant at its historical
# floor; the constant stayed 6 and only this comment was left claiming
# otherwise.
MAX_COLLIDING_PATHS = 6


class CollisionError(Exception):
    """A failure that must not be reported as a pass."""


class BaselineUnverified(CollisionError):
    """The baseline could not be shown to be the remote's.

    Separate from `CollisionError` because the two are tolerated differently.
    "The branches are not present here" is a fact about the checkout; "the ref
    I am measuring against may have been written by hand" is a fact about the
    measurement's integrity, and a caller that swallows the first must not
    swallow the second by accident. `tests/test_branch_collisions.py` had
    exactly that hole: `except CollisionError: return`.
    """


@dataclass
class Collision:
    path: str
    commits: List[str] = field(default_factory=list)

    @property
    def versions(self) -> int:
        return len(self.commits)


def _git(args: Sequence[str], repo_root: Path) -> str:
    env = dict(os.environ)
    env["GIT_CONFIG_GLOBAL"] = "/dev/null"
    env["GIT_CONFIG_SYSTEM"] = "/dev/null"
    result = subprocess.run(["git", *args], cwd=str(repo_root), capture_output=True, text=True, env=env)
    if result.returncode != 0:
        raise CollisionError(f"git {' '.join(args)} failed ({result.returncode}): {result.stderr.strip()}")
    return result.stdout


def find_collisions(repo_root: Path, baseline_ref: str = "origin/main", verify: bool = True) -> List[Collision]:
    """Paths created by more than one commit that is not in the baseline.

    This counts against `origin/main` for the same reason `release_lag.py` does,
    and it read that ref the same way: straight out of
    `refs/remotes/origin/main`, a local file that has been written by hand in
    this repository four times (see `scripts/ci/baseline_trust.py` for the
    reflog). A doctored baseline shrinks this count exactly as it shrank the
    release-lag one — commits that are "already in main" cannot collide — so the
    baseline is verified against the remote before anything is counted.

    Raises rather than returning findings because this control's whole output is
    one number, and there is no honest number to return for a baseline nobody
    could confirm.
    """
    if verify:
        trust = verify_baseline(repo_root, baseline_ref)
        problems = trust_findings(trust)
        if problems:
            raise BaselineUnverified(
                f"{problems[0][1]} Refusing to report a collision count against an unverified baseline."
            )

    if (repo_root / ".git" / "shallow").exists():
        raise CollisionError(
            "shallow clone: the branches that collide are not present, so this cannot be "
            "measured here. Refusing to report zero collisions."
        )
    try:
        _git(["rev-parse", "--verify", f"{baseline_ref}^{{commit}}"], repo_root)
    except CollisionError as exc:
        raise CollisionError(
            f"baseline ref {baseline_ref!r} does not resolve. Refusing to report zero collisions. ({exc})"
        ) from exc

    log = _git(
        ["log", "--branches", "--remotes", "--not", baseline_ref, "--diff-filter=A", "--name-only", "--format=%H"],
        repo_root,
    )

    creators: Dict[str, set] = defaultdict(set)
    sha: Optional[str] = None
    for line in log.splitlines():
        line = line.strip()
        if not line:
            continue
        if len(line) == 40 and all(c in "0123456789abcdef" for c in line):
            sha = line
        elif sha is not None:
            creators[line].add(sha)

    return sorted(
        (Collision(path, sorted(shas)) for path, shas in creators.items() if len(shas) > 1),
        key=lambda c: (-c.versions, c.path),
    )


def describe(repo_root: Path, sha: str) -> str:
    try:
        return _git(["log", "-1", "--format=%h %ad %s", "--date=format:%Y-%m-%d %H:%M", sha], repo_root).strip()
    except CollisionError:
        return sha[:12]


def format_report(repo_root: Path, collisions: Sequence[Collision]) -> str:
    lines = ["=== Parallel-work collisions ===", f"Paths with competing versions: {len(collisions)} "
             f"(budget {MAX_COLLIDING_PATHS})"]
    if not collisions:
        lines.append("")
        lines.append("PASS: no path was created by two independent commits.")
        return "\n".join(lines)

    lines.append("")
    for collision in collisions:
        lines.append(f"  {collision.versions}x  {collision.path}")
        for sha in collision.commits:
            lines.append(f"        {describe(repo_root, sha)}")
    lines.append("")
    lines.append(
        "Each of these has two or more complete implementations on different branches and "
        "cannot merge cleanly. Pick one per path before merging; the choice is a review "
        "decision, not a merge-conflict resolution."
    )
    if len(collisions) > MAX_COLLIDING_PATHS:
        lines.append("")
        lines.append(f"FAIL: {len(collisions)} colliding paths, over the budget of {MAX_COLLIDING_PATHS}.")
    else:
        lines.append("")
        lines.append(f"PASS: within the budget of {MAX_COLLIDING_PATHS}, which should be falling.")
    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Report files built twice on parallel unmerged branches.")
    parser.add_argument("--report", action="store_true", help="always exit 0")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--repo-root", default=None)
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root) if args.repo_root else Path(__file__).resolve().parents[2]

    try:
        collisions = find_collisions(repo_root)
    except CollisionError as exc:
        status = "baseline-unverified" if isinstance(exc, BaselineUnverified) else "not-measurable"
        if args.json:
            print(json.dumps({"ok": False, "status": status, "error": str(exc)}, indent=2))
        else:
            print(f"FAIL: {exc}", file=sys.stderr)
        return 0 if args.report else 1

    over = len(collisions) > MAX_COLLIDING_PATHS
    if args.json:
        print(
            json.dumps(
                {
                    "ok": not over,
                    "status": "fail" if over else "pass",
                    "budget": MAX_COLLIDING_PATHS,
                    "collisions": [asdict(c) | {"versions": c.versions} for c in collisions],
                },
                indent=2,
            )
        )
    else:
        print(format_report(repo_root, collisions))

    if args.report:
        return 0
    return 1 if over else 0


if __name__ == "__main__":
    sys.exit(main())
