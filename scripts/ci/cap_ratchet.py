#!/usr/bin/env python3
"""
Cap ratchet — the ratchet over the ratchets.

Every declared budget in this repository is bounded by a number one level up.
`platform/release-lag-budget.yaml` may declare `max_unshipped_commits`, but not
above `MAX_DECLARED_UNSHIPPED_COMMITS` in `scripts/ci/release_lag.py`.
`platform/kill-criteria-baseline.yaml` may declare `max_without_stopping_rule`,
but not above `MAX_DECLARED_WITHOUT_STOPPING_RULE` in
`scripts/ci/kill_criteria_ratchet.py`. Each of those caps carries a comment
saying that raising it "requires changing this file under review, which is the
point."

Nothing reviewed it. The caps landed on 2026-08-02 in `cc3ff45` — "cap the two
release-lag budget values that could be argued up forever" — and by the next
day the working tree held:

    -MAX_DECLARED_UNSHIPPED_COMMITS = 150
    -MAX_DECLARED_BRANCHES = 40
    +MAX_DECLARED_UNSHIPPED_COMMITS = 170
    +MAX_DECLARED_BRANCHES = 45

alongside `max_unshipped_commits: 135 -> 165` and `max_branches_ahead: 35 -> 45`
in the YAML the cap exists to bound. The measured pile was 171 commits, so the
gate failed anyway; the tell that this was widening rather than re-declaring is
that the prose above the constants still read "deliberately close to the
2026-08-02 measurement (127 commits, 31 branches)" and "allow roughly one more
session of growth". A cap is not a cap if the thing it caps can edit it.

So this control ratchets the caps themselves, and it takes its floor from git
rather than from another declared number — because another declared number is
just one more thing to raise. For each watched value:

    fail when the value on disk is above the lowest value it has ever held
    in this file's committed history.

That is the ratchet property stated exactly once, at the top of the tower.
Lowering a cap is always allowed and immediately becomes the new floor. Raising
one is refused, and the refusal cannot be cleared by editing YAML, by editing
the enforcing script, or by adding commits — only by making the underlying
number genuinely smaller, which for the release-lag budget means shipping.

Why git history and not the previous commit: comparing against `HEAD` lets a
value walk upward five at a time across a session, each step legal against the
one before it. Comparing against the historical minimum makes the walk
impossible regardless of how it is spread across commits. Rewriting history to
defeat this is possible and is visible as a force-push, which is a different
control's problem.

Why not compare against `origin/main`: on 2026-08-03 most of these files did
not exist at `origin/main` at all — 171 commits of the delivery pile stood
between them. A baseline that is absent for the files it governs governs
nothing.

Deliberately fails closed. A missing file, a missing constant, a non-numeric
value, or an unreadable history is a failure, not a skip. That is the specific
way this repository's gates have been found to lie: a missing input reported
PASSED for work it never did.

What it does not do: it does not decide whether any budget is *right*. A cap
that was always too generous stays too generous — this only refuses to let it
grow. Tightening one is the portfolio owner's call, and doing so needs no
permission from this file.

Usage:
    python3 scripts/ci/cap_ratchet.py              # audit, exit 1 on failure
    python3 scripts/ci/cap_ratchet.py --report     # measure, always exit 0
    python3 scripts/ci/cap_ratchet.py --json       # machine-readable
"""

from __future__ import annotations

import argparse
import ast
import json
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import yaml

# How far back to walk a file's history. These files are days old; the bound
# exists so a long-lived repository cannot turn this check into a git-storm.
# Truncation is reported, never silent — a floor taken from a partial history
# is still a floor, but the operator should know it is one.
MAX_REVISIONS = 500


@dataclass(frozen=True)
class Watch:
    """A number that may only ever move down."""

    path: str
    kind: str  # "python-constant" | "yaml-path"
    locator: str
    why: str


# Every cap that bounds a declared budget elsewhere in the repository, plus the
# declared budgets that are themselves pure debt counters. A ceiling on debt is
# only meaningful while it is falling.
#
# Not watched: `platform/coverage-baseline.yaml` component baselines. Those are
# floors that are *supposed* to rise as coverage improves, and the two-
# directional check in `scripts/ci/coverage_ratchet.py` already refuses a drop.
# Watching them here would forbid the improvement the ratchet exists to force.
WATCHES: Tuple[Watch, ...] = (
    Watch(
        path="scripts/ci/release_lag.py",
        kind="python-constant",
        locator="MAX_DECLARED_UNSHIPPED_COMMITS",
        why="the ceiling on how large the undelivered pile may be declared to be",
    ),
    Watch(
        path="scripts/ci/release_lag.py",
        kind="python-constant",
        locator="MAX_DECLARED_BRANCHES",
        why="the ceiling on how many branches may be declared to hold undelivered work",
    ),
    Watch(
        path="scripts/ci/release_lag.py",
        kind="python-constant",
        locator="MAX_DECLARED_AGE_DAYS",
        why="the ceiling on how long finished work may sit undelivered",
    ),
    Watch(
        path="scripts/ci/release_lag.py",
        kind="python-constant",
        locator="MAX_DECLARED_SLACK",
        why="the widest gap allowed between the measured lag and the declared budget",
    ),
    Watch(
        path="scripts/ci/kill_criteria_ratchet.py",
        kind="python-constant",
        locator="MAX_DECLARED_WITHOUT_STOPPING_RULE",
        why="the ceiling on how many ventures may draw budget with no brake",
    ),
    Watch(
        path="scripts/ci/kill_criteria_ratchet.py",
        kind="python-constant",
        locator="MAX_DECLARED_SLACK",
        why="the widest gap allowed between the measured count and the declared ceiling",
    ),
    Watch(
        path="scripts/ci/coverage_ratchet.py",
        kind="python-constant",
        locator="MAX_TOLERANCE_POINTS",
        why="the coverage band that needs no review, which is not permission to regress",
    ),
    Watch(
        path="scripts/ci/branch_collisions.py",
        kind="python-constant",
        locator="MAX_COLLIDING_PATHS",
        why="the ceiling on how many files two live branches may be building twice",
    ),
    # The expiry horizons. These bound how long any suppression may be parked
    # before someone re-reads it, so raising one is a way to stop re-reading
    # everything at once. They are ceilings on debt like the rest.
    Watch(
        path="scripts/ci/audit_exceptions.py",
        kind="python-constant",
        locator="MAX_HORIZON_DAYS",
        why="the furthest out a registered exception may be parked before review",
    ),
    Watch(
        path="scripts/ci/release_lag.py",
        kind="python-constant",
        locator="MAX_EXPIRY_DAYS",
        why="the furthest out the release-lag budget may be parked before review",
    ),
    Watch(
        path="scripts/ci/kill_criteria_ratchet.py",
        kind="python-constant",
        locator="MAX_EXPIRY_DAYS",
        why="the furthest out the stopping-rule baseline may be parked before review",
    ),
    # Arrived with the 2026-08-03 integration, from four branches that each
    # added a cap without knowing this ratchet existed. The contract test below
    # is what found them, which is the argument for it being a test rather than
    # a convention: a cap nobody watches is indistinguishable from no cap.
    Watch(
        path="scripts/ci/image_tags.py",
        kind="python-constant",
        locator="MAX_EXPIRY_DAYS",
        why="the furthest out a mutable-image-tag exemption may be parked before review",
    ),
    Watch(
        path="scripts/ci/route_posture_contract.py",
        kind="python-constant",
        locator="MAX_EXEMPTION_DAYS",
        why="the furthest out a venture may serve routes with no contract running in CI",
    ),
    Watch(
        path="scripts/ci/sast_scan.py",
        kind="python-constant",
        locator="MAX_EXPIRY_DAYS",
        why="the furthest out a SAST finding may be suppressed before review",
    ),
    Watch(
        path="scripts/ci/coverage_ratchet.py",
        kind="python-constant",
        locator="MAX_BASIS_DRIFT_PERCENT",
        why="how far a coverage basis may move before the measurement is re-read",
    ),
    # Same story, one branch later: `stopping_rule_review.py` landed with two
    # caps of its own, and the contract test below caught them within the hour.
    Watch(
        path="scripts/ci/stopping_rule_review.py",
        kind="python-constant",
        locator="MAX_CONTINUE_OVERRIDES",
        why="how many fired stopping rules the owner may overrule before it is the standing answer",
    ),
    Watch(
        path="scripts/ci/stopping_rule_review.py",
        kind="python-constant",
        locator="MAX_REVIEW_DAYS",
        why="how long a decision to keep funding past a fired brake may stand unargued",
    ),
    Watch(
        path="platform/release-lag-budget.yaml",
        kind="yaml-path",
        locator="budget.max_unshipped_commits",
        why="the size of the undelivered pile; only shipping lowers it",
    ),
    Watch(
        path="platform/release-lag-budget.yaml",
        kind="yaml-path",
        locator="budget.max_branches_ahead",
        why="the number of branches holding undelivered work",
    ),
    Watch(
        path="platform/kill-criteria-baseline.yaml",
        kind="yaml-path",
        locator="budget.max_without_stopping_rule",
        why="the number of ventures that can draw budget forever",
    ),
)


class CapError(Exception):
    """A failure that must not be reported as a pass."""


@dataclass
class Reading:
    watch: Watch
    current: float
    floor: float
    floor_sha: str
    revisions_seen: int
    history_truncated: bool
    first_appearance: bool


@dataclass
class Finding:
    check: str
    message: str


@dataclass
class Measurement:
    readings: List[Reading] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)


def _git(repo_root: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise CapError(f"git {' '.join(args)} failed: {proc.stderr.strip() or 'no stderr'}")
    return proc.stdout


def extract_python_constant(source: str, name: str) -> Optional[float]:
    """Read a module-level `NAME = <number>` without executing the module.

    Returns None when the constant is absent, which for a historical revision
    means "this cap did not exist yet" and for the working tree means the
    caller must fail. Parsed with `ast` rather than exec or regex: the file is
    a control, and importing a control to audit it lets the control decide
    whether it is audited.
    """
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return None
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id == name:
                value = node.value
                if isinstance(value, ast.Constant) and isinstance(value.value, (int, float)):
                    return float(value.value)
                # `X = -1` parses as a UnaryOp, not a Constant.
                if (
                    isinstance(value, ast.UnaryOp)
                    and isinstance(value.op, ast.USub)
                    and isinstance(value.operand, ast.Constant)
                    and isinstance(value.operand.value, (int, float))
                ):
                    return -float(value.operand.value)
                return None
    return None


def extract_yaml_path(source: str, dotted: str) -> Optional[float]:
    """Read a dotted path out of a YAML document, or None if it is absent."""
    try:
        data = yaml.safe_load(source)
    except yaml.YAMLError:
        return None
    cursor: Any = data
    for part in dotted.split("."):
        if not isinstance(cursor, dict) or part not in cursor:
            return None
        cursor = cursor[part]
    if isinstance(cursor, bool) or not isinstance(cursor, (int, float)):
        return None
    return float(cursor)


def extract(watch: Watch, source: str) -> Optional[float]:
    if watch.kind == "python-constant":
        return extract_python_constant(source, watch.locator)
    if watch.kind == "yaml-path":
        return extract_yaml_path(source, watch.locator)
    raise CapError(f"{watch.path}: unknown watch kind {watch.kind!r}")


def revisions_for(repo_root: Path, path: str) -> Tuple[List[str], bool]:
    """Commits that touched `path`, newest first, and whether the list was cut."""
    out = _git(repo_root, "log", f"--max-count={MAX_REVISIONS + 1}", "--format=%H", "--", path)
    shas = [line.strip() for line in out.splitlines() if line.strip()]
    truncated = len(shas) > MAX_REVISIONS
    return shas[:MAX_REVISIONS], truncated


def blob_at(repo_root: Path, sha: str, path: str) -> Optional[str]:
    proc = subprocess.run(
        ["git", "show", f"{sha}:{path}"],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        # The path did not exist at that revision, or was a directory. Both
        # mean "no value to compare against here", not a failure.
        return None
    return proc.stdout


def assert_full_history(repo_root: Path) -> None:
    """Refuse to measure a floor from a truncated history.

    A shallow checkout — `actions/checkout` defaults to `fetch-depth: 1` — makes
    `git log -- path` return one revision, so the floor becomes whatever is
    committed right now and every past raise reads as "at floor". That is a
    fail-open path: the gate would report PASS on the exact history it exists to
    read. It is the same shape as the offline branch in `scripts/security-scan.sh`
    that kept regrowing escape hatches, so this one refuses instead.
    """
    if (repo_root / ".git" / "shallow").exists():
        raise CapError(
            "this is a shallow clone, so the history a floor is taken from is not here. "
            "Fetch full history (`fetch-depth: 0`) before running this gate; measuring a "
            "floor from one revision would pass every raise that has already landed."
        )
    out = _git(repo_root, "rev-parse", "--is-shallow-repository").strip()
    if out == "true":
        raise CapError(
            "git reports a shallow repository. Fetch full history (`fetch-depth: 0`) "
            "before running this gate."
        )


def measure(repo_root: Path, watches: Sequence[Watch] = WATCHES) -> Measurement:
    measurement = Measurement()
    assert_full_history(repo_root)

    # One history walk per file, not per watched value: `release_lag.py` alone
    # carries four of them.
    by_path: Dict[str, List[Watch]] = {}
    for watch in watches:
        by_path.setdefault(watch.path, []).append(watch)

    for path, path_watches in by_path.items():
        on_disk = repo_root / path
        if not on_disk.is_file():
            raise CapError(f"{path}: watched file is missing. A cap that is not there caps nothing.")
        source = on_disk.read_text(encoding="utf-8")

        current: Dict[str, float] = {}
        for watch in path_watches:
            value = extract(watch, source)
            if value is None:
                raise CapError(
                    f"{path}: `{watch.locator}` is missing or is not a plain number. "
                    f"It is {watch.why}; deleting or hiding it is how a cap stops being one."
                )
            current[watch.locator] = value

        shas, truncated = revisions_for(repo_root, path)
        history: Dict[str, List[Tuple[float, str]]] = {w.locator: [] for w in path_watches}
        for sha in shas:
            blob = blob_at(repo_root, sha, path)
            if blob is None:
                continue
            for watch in path_watches:
                value = extract(watch, blob)
                if value is not None:
                    history[watch.locator].append((value, sha))

        for watch in path_watches:
            seen = history[watch.locator]
            if seen:
                floor, floor_sha = min(seen, key=lambda pair: pair[0])
                first_appearance = False
            else:
                # Never committed with this locator present. There is no floor
                # to hold it to yet; today's value becomes the floor once it is
                # committed. Reported, not silently passed.
                floor, floor_sha = current[watch.locator], ""
                first_appearance = True
            measurement.readings.append(
                Reading(
                    watch=watch,
                    current=current[watch.locator],
                    floor=floor,
                    floor_sha=floor_sha,
                    revisions_seen=len(seen),
                    history_truncated=truncated,
                    first_appearance=first_appearance,
                )
            )
        if truncated:
            measurement.notes.append(
                f"{path}: history walk stopped at {MAX_REVISIONS} revisions; the floor is taken "
                f"from that window."
            )

    measurement.readings.sort(key=lambda r: (r.watch.path, r.watch.locator))
    return measurement


def evaluate(measurement: Measurement) -> List[Finding]:
    findings: List[Finding] = []
    for reading in measurement.readings:
        if reading.current > reading.floor:
            findings.append(
                Finding(
                    check="cap-raised",
                    message=(
                        f"{reading.watch.path}: `{reading.watch.locator}` is {_fmt(reading.current)}, above "
                        f"the lowest value it has ever held ({_fmt(reading.floor)}, "
                        f"{reading.floor_sha[:12]}). This number is {reading.watch.why}. Raising it does "
                        f"not make the underlying problem smaller, it makes the gate stop reporting it; "
                        f"lower it back to {_fmt(reading.floor)} or below."
                    ),
                )
            )
    return findings


def _fmt(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else str(value)


def format_report(measurement: Measurement, findings: Sequence[Finding]) -> str:
    lines = ["=== Cap ratchet ==="]
    width = max((len(f"{r.watch.path}:{r.watch.locator}") for r in measurement.readings), default=0)
    for reading in measurement.readings:
        label = f"{reading.watch.path}:{reading.watch.locator}".ljust(width)
        if reading.first_appearance:
            state = "no committed history yet — this run sets the floor"
        elif reading.current > reading.floor:
            state = f"RAISED from floor {_fmt(reading.floor)} ({reading.revisions_seen} revs)"
        elif reading.current < reading.floor:
            state = f"lowered below previous floor {_fmt(reading.floor)} — new floor"
        else:
            state = f"at floor ({reading.revisions_seen} revs)"
        lines.append(f"  {label}  {_fmt(reading.current):>6}  {state}")
    for note in measurement.notes:
        lines.append(f"NOTE: {note}")
    lines.append("")
    if findings:
        lines.append(f"FAIL: {len(findings)} finding(s)")
        for finding in findings:
            lines.append(f"  [{finding.check}] {finding.message}")
    else:
        lines.append(f"PASS: {len(measurement.readings)} caps, none above its historical floor.")
    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Refuse any cap that bounds a declared budget from moving upward."
    )
    parser.add_argument("--report", action="store_true", help="measure and print, always exit 0")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--repo-root", default=None, help="repository root (default: two levels up)")
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root) if args.repo_root else Path(__file__).resolve().parents[2]

    try:
        measurement = measure(repo_root)
        findings = evaluate(measurement)
    except CapError as exc:
        if args.json:
            print(json.dumps({"error": str(exc), "ok": False, "measured": False}, indent=2))
        else:
            print(f"FAIL: {exc}", file=sys.stderr)
        return 0 if args.report else 1

    if args.json:
        print(
            json.dumps(
                {
                    "ok": not findings,
                    "measured": True,
                    "readings": [
                        {**asdict(r), "watch": asdict(r.watch)} for r in measurement.readings
                    ],
                    "notes": measurement.notes,
                    "findings": [asdict(f) for f in findings],
                },
                indent=2,
            )
        )
    else:
        print(format_report(measurement, findings))

    if args.report:
        return 0
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
