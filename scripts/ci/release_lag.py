#!/usr/bin/env python3
"""
Release lag ratchet.

Production runs `origin/main`. Every control in this repository asks whether
work is *correct*; none of them asks whether it *shipped*, and the difference
is the whole return on the work. Measured 2026-08-02: `origin/main` was at
`a4b8f23` from 2026-07-31 while 119 commits sat across 29 local branches, and
the unshipped set touched all 11 ventures plus `platform/`, `portfolio/`,
`scripts/` and `.gitea/`. The homepage's five fixes from 2026-08-01 were not
live a day later; the byte size of the deployed `app.js` proved it. A "Fixed"
row in `docs/SECURITY_AUDIT_LOG.md` does not imply the live service is fixed.

Nothing measured that. `docs/ENGINEERING-ROADMAP.md` asks for DORA scorecards
in its 30-day section; a grep for `dora|lead.time|deployment.frequency` hit
only the roadmap sentence asking for them. This is the first measured piece:
lead time for changes, expressed as the lag between what is committed and what
`origin/main` carries.

It is a ratchet, not a threshold, for the reason `count` is exact in
`platform/exception-register.yaml` and coverage is two-directional in
`scripts/ci/coverage_ratchet.py`:

  * Above the declared budget fails. The pile grew.
  * More than `slack` below the declared budget also fails. The budget is
    stale. Lowering it is a deliberate, reviewed act, because a ceiling that
    silently trails reality ratchets nothing — it just records the worst the
    delivery process was ever allowed to be.

The declared budget is itself bounded. `max_unshipped_age_days` may not exceed
MAX_DECLARED_AGE_DAYS, `slack` may not exceed MAX_DECLARED_SLACK, and `expires`
may be at most MAX_EXPIRY_DAYS out, so the budget cannot be widened to
permanent silence. A budget nobody re-reads is a policy change made without
review.

Deliberately fails closed. A missing budget file, an unresolvable baseline ref,
an expired budget, or a declared value over its cap is a failure, not a skip.
That is the specific way this repository's gates have been found to lie: a
missing input reported PASSED for work it never did.

What it does not do: it does not push, merge, or deploy anything. Shipping is
an outward action and remains a human decision. This only makes the size of the
undeployed pile visible on every run instead of once a fortnight by accident.

Usage:
    python3 scripts/ci/release_lag.py              # audit, exit 1 on failure
    python3 scripts/ci/release_lag.py --report     # measure, always exit 0
    python3 scripts/ci/release_lag.py --json       # machine-readable
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import yaml

BUDGET_PATH = "platform/release-lag-budget.yaml"

REQUIRED_TOP_FIELDS = ("baseline_ref", "owner", "issue", "expires", "budget", "rationale")

REQUIRED_BUDGET_FIELDS = (
    "max_unshipped_commits",
    "max_unshipped_age_days",
    "max_branches_ahead",
    "slack_commits",
)

# A change that has been finished but not delivered for a month is not operating
# within a budget; the delivery process has stopped. The cap is on the
# *declaration*, so raising the ceiling past it requires changing this file
# under review rather than editing YAML.
MAX_DECLARED_AGE_DAYS = 30

# Slack wide enough to hide a whole release is not slack. This is the band
# between measured and declared that needs no review.
MAX_DECLARED_SLACK = 40

# The two dimensions below are the gameable ones: committing more work always
# raises them, so without a ceiling the budget can be argued up forever and a
# PASS means only that someone widened it last. That happened on the day this
# landed — `max_unshipped_commits` went 125 -> 135 and `max_branches_ahead`
# 32 -> 35 within one session, both keeping the gate green.
#
# These caps are deliberately close to the 2026-08-02 measurement (127 commits,
# 31 branches). They allow roughly one more session of growth and then refuse,
# and the only edit that clears the refusal is shipping. Raising them requires
# changing this file under review, which is the point.
# "Under review" is not a control, and this pair is the proof. `cap_ratchet.py`
# exists because these two constants were walked 150 -> 170 and 40 -> 45 on
# 2026-08-03. On 2026-08-04 they were walked again, to 250 and 50, inside
# `2fdcf83` — a commit whose subject is "complete stash convergence and clean
# uncommitted work" and whose diff is 6200 files of agent worktree snapshots.
# Nobody reviewing that commit was reviewing this line. The tell is directly
# above: the prose still described caps "deliberately close to" 127 commits and
# 31 branches while the numbers said 250 and 50, because the raise edited the
# constants and not the argument for them. Restored to the floor 150/40 that
# `cc3ff45` set; the declared budget is 125 commits and 32 branches, so nothing
# in `platform/release-lag-budget.yaml` had to move to fit under them. Read
# `cap_ratchet.py` rather than this comment for what is enforced — a number
# guarded only by the sentence next to it is what was already tried here.
MAX_DECLARED_UNSHIPPED_COMMITS = 150
MAX_DECLARED_BRANCHES = 40

# The exception register's horizon, for the same reason.
MAX_EXPIRY_DAYS = 180


class LagError(Exception):
    """A failure that must not be reported as a pass."""


@dataclass
class Measurement:
    """What git says about work that has not reached the baseline ref."""

    baseline_ref: str
    baseline_sha: str
    baseline_age_days: int
    unshipped_commits: int
    branches_ahead: int
    oldest_unshipped_age_days: int
    components: List[str] = field(default_factory=list)
    branch_names: List[str] = field(default_factory=list)
    fetch_age_days: Optional[int] = None
    observable: bool = True
    observability_note: str = ""


@dataclass
class Finding:
    check: str
    message: str


def _git(args: Sequence[str], repo_root: Path) -> str:
    env = dict(os.environ)
    env["GIT_CONFIG_GLOBAL"] = "/dev/null"
    env["GIT_CONFIG_SYSTEM"] = "/dev/null"
    result = subprocess.run(
        ["git", *args],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        env=env,
    )
    if result.returncode != 0:
        raise LagError(
            f"git {' '.join(args)} failed ({result.returncode}): {result.stderr.strip()}"
        )
    return result.stdout


def _days_between(earlier_epoch: int, now_epoch: int) -> int:
    return max(0, int((now_epoch - earlier_epoch) // 86400))


def measure(repo_root: Path, baseline_ref: str, now_epoch: Optional[int] = None) -> Measurement:
    """Measure the gap between local branches and the baseline ref.

    Fails closed: an unresolvable baseline ref raises rather than measuring
    zero lag, because "the ref is missing" and "everything is shipped" are the
    same number otherwise.
    """
    if now_epoch is None:
        now_epoch = int(time.time())

    # A shallow clone has no local branch topology: `actions/checkout` fetches
    # one ref at depth 1, so "nothing is undelivered" is trivially true there
    # and means nothing. This is reported as a third state, never as a pass —
    # the subject of the measurement is absent, which is different from a tool
    # being absent, and different again from there being no work to ship.
    if (repo_root / ".git" / "shallow").exists():
        return Measurement(
            baseline_ref=baseline_ref,
            baseline_sha="",
            baseline_age_days=0,
            unshipped_commits=0,
            branches_ahead=0,
            oldest_unshipped_age_days=0,
            observable=False,
            observability_note=(
                "shallow clone: local branch topology is not present, so undelivered work "
                "cannot be measured here. Run this on the machine holding the branches."
            ),
        )

    try:
        baseline_sha = _git(["rev-parse", "--verify", f"{baseline_ref}^{{commit}}"], repo_root).strip()
    except LagError as exc:
        raise LagError(
            f"baseline ref {baseline_ref!r} does not resolve, so release lag cannot be "
            f"measured. Refusing to report zero lag. ({exc})"
        ) from exc

    baseline_epoch = int(_git(["show", "-s", "--format=%ct", baseline_sha], repo_root).strip())

    revs = ["--branches", "--remotes", "HEAD", "--not", baseline_ref]
    unshipped_commits = int(_git(["rev-list", "--count", *revs], repo_root).strip() or "0")

    oldest_age_days = 0
    if unshipped_commits:
        stamps = [
            int(line)
            for line in _git(["rev-list", "--format=%ct", "--no-commit-header", *revs], repo_root).split()
            if line.isdigit()
        ]
        if stamps:
            oldest_age_days = _days_between(min(stamps), now_epoch)

    branch_names: List[str] = []
    for branch in _git(["for-each-ref", "--format=%(refname:short)", "refs/heads/", "refs/remotes/"], repo_root).split():
        ancestor = subprocess.run(
            ["git", "merge-base", "--is-ancestor", branch, baseline_ref],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            env={"GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_SYSTEM": "/dev/null", **os.environ},
        )
        if ancestor.returncode != 0:
            branch_names.append(branch)

    components = sorted(
        {
            _component_of(path)
            for path in _git(
                ["log", "--branches", "HEAD", "--not", baseline_ref, "--name-only", "--format="],
                repo_root,
            ).splitlines()
            if path.strip()
        }
    )

    fetch_age_days = None
    fetch_head = repo_root / ".git" / "FETCH_HEAD"
    if fetch_head.exists():
        fetch_age_days = _days_between(int(fetch_head.stat().st_mtime), now_epoch)

    return Measurement(
        baseline_ref=baseline_ref,
        baseline_sha=baseline_sha[:12],
        baseline_age_days=_days_between(baseline_epoch, now_epoch),
        unshipped_commits=unshipped_commits,
        branches_ahead=len(branch_names),
        oldest_unshipped_age_days=oldest_age_days,
        components=components,
        branch_names=sorted(branch_names),
        fetch_age_days=fetch_age_days,
    )


def _component_of(path: str) -> str:
    """Attribute a changed path to the component that would be redeployed.

    Ventures deploy individually, so `ventures/x/...` is its own component;
    everything else is grouped by its top-level directory.
    """
    parts = path.split("/")
    if parts[0] == "ventures" and len(parts) > 1:
        return "/".join(parts[:2])
    if len(parts) == 1:
        return "(repository root)"
    return parts[0]


def load_budget(repo_root: Path, budget_path: str = BUDGET_PATH) -> Dict[str, Any]:
    """Read and validate the declared budget. Fails closed on anything missing."""
    path = repo_root / budget_path
    if not path.exists():
        raise LagError(
            f"{budget_path} is missing. The release-lag ratchet has no declared budget "
            f"and will not pass by default."
        )

    data = yaml.safe_load(path.read_text()) or {}
    if not isinstance(data, dict):
        raise LagError(f"{budget_path} must be a mapping, got {type(data).__name__}.")

    missing = [f for f in REQUIRED_TOP_FIELDS if f not in data]
    if missing:
        raise LagError(f"{budget_path} is missing required fields: {', '.join(missing)}.")

    budget = data["budget"]
    if not isinstance(budget, dict):
        raise LagError(f"{budget_path}: `budget` must be a mapping.")

    missing = [f for f in REQUIRED_BUDGET_FIELDS if f not in budget]
    if missing:
        raise LagError(f"{budget_path}: `budget` is missing required fields: {', '.join(missing)}.")

    for key, value in budget.items():
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise LagError(f"{budget_path}: `budget.{key}` must be a non-negative integer, got {value!r}.")

    if budget["max_unshipped_age_days"] > MAX_DECLARED_AGE_DAYS:
        raise LagError(
            f"{budget_path}: `max_unshipped_age_days` is {budget['max_unshipped_age_days']}, over the "
            f"{MAX_DECLARED_AGE_DAYS}-day cap. Work finished more than a month ago and never delivered "
            f"is a stopped delivery process, not a budget."
        )

    if budget["slack_commits"] > MAX_DECLARED_SLACK:
        raise LagError(
            f"{budget_path}: `slack_commits` is {budget['slack_commits']}, over the "
            f"{MAX_DECLARED_SLACK} cap. Slack that wide hides a whole release."
        )

    if budget["max_unshipped_commits"] > MAX_DECLARED_UNSHIPPED_COMMITS:
        raise LagError(
            f"{budget_path}: `max_unshipped_commits` is {budget['max_unshipped_commits']}, over the "
            f"{MAX_DECLARED_UNSHIPPED_COMMITS} cap. Past this the budget is not being argued down, it "
            f"is being argued up, and the only edit that should clear this is shipping."
        )

    if budget["max_branches_ahead"] > MAX_DECLARED_BRANCHES:
        raise LagError(
            f"{budget_path}: `max_branches_ahead` is {budget['max_branches_ahead']}, over the "
            f"{MAX_DECLARED_BRANCHES} cap. Opening another branch is not a way to raise the ceiling."
        )

    return data


def check_expiry(data: Dict[str, Any], today: date, budget_path: str = BUDGET_PATH) -> List[Finding]:
    expires = data["expires"]
    if isinstance(expires, datetime):
        expires = expires.date()
    if not isinstance(expires, date):
        try:
            expires = date.fromisoformat(str(expires))
        except ValueError as exc:
            raise LagError(f"{budget_path}: `expires` must be an ISO date, got {expires!r}.") from exc

    findings: List[Finding] = []
    if expires < today:
        findings.append(
            Finding(
                "budget-expired",
                f"the release-lag budget expired on {expires.isoformat()}. Re-read it and set a new "
                f"date, or lower the numbers. An unreviewed budget is a policy change nobody made.",
            )
        )
    elif (expires - today).days > MAX_EXPIRY_DAYS:
        findings.append(
            Finding(
                "budget-horizon",
                f"`expires` is {(expires - today).days} days out, over the {MAX_EXPIRY_DAYS}-day cap.",
            )
        )
    return findings


def evaluate(measurement: Measurement, data: Dict[str, Any], today: date) -> List[Finding]:
    """Compare measurement against the declared budget. Two-directional."""
    budget = data["budget"]
    findings: List[Finding] = list(check_expiry(data, today))

    # The budget's expiry is a property of the document and is checked
    # everywhere. The lag comparisons are not, because their subject is absent.
    if not measurement.observable:
        return findings

    declared_commits = budget["max_unshipped_commits"]
    if measurement.unshipped_commits > declared_commits:
        findings.append(
            Finding(
                "lag-above-budget",
                f"{measurement.unshipped_commits} commits are not in {measurement.baseline_ref}, over the "
                f"declared budget of {declared_commits}. The undelivered pile grew; nothing in it is live.",
            )
        )
    elif declared_commits - measurement.unshipped_commits > budget["slack_commits"]:
        findings.append(
            Finding(
                "budget-stale",
                f"only {measurement.unshipped_commits} commits are unshipped against a declared budget of "
                f"{declared_commits} (slack {budget['slack_commits']}). Work shipped — lower the budget so "
                f"it keeps meaning something.",
            )
        )

    if measurement.oldest_unshipped_age_days > budget["max_unshipped_age_days"]:
        findings.append(
            Finding(
                "oldest-change-stale",
                f"the oldest undelivered commit is {measurement.oldest_unshipped_age_days} days old, over the "
                f"declared {budget['max_unshipped_age_days']}. Lead time for changes is at least this bad.",
            )
        )

    if measurement.branches_ahead > budget["max_branches_ahead"]:
        findings.append(
            Finding(
                "branches-above-budget",
                f"{measurement.branches_ahead} local branches carry work not in {measurement.baseline_ref}, over "
                f"the declared {budget['max_branches_ahead']}.",
            )
        )

    return findings


def format_report(measurement: Measurement, data: Dict[str, Any], findings: Sequence[Finding]) -> str:
    budget = data["budget"]
    if not measurement.observable:
        lines = ["=== Release lag ===", f"NOT MEASURABLE HERE: {measurement.observability_note}"]
        if findings:
            lines.append(f"FAIL: {len(findings)} finding(s)")
            lines.extend(f"  [{f.check}] {f.message}" for f in findings)
        return "\n".join(lines)

    lines = [
        "=== Release lag ===",
        f"Baseline:            {measurement.baseline_ref} @ {measurement.baseline_sha} "
        f"({measurement.baseline_age_days} days old)",
        f"Unshipped commits:   {measurement.unshipped_commits} (budget {budget['max_unshipped_commits']}, "
        f"slack {budget['slack_commits']})",
        f"Oldest undelivered:  {measurement.oldest_unshipped_age_days} days "
        f"(budget {budget['max_unshipped_age_days']})",
        f"Branches ahead:      {measurement.branches_ahead} (budget {budget['max_branches_ahead']})",
        f"Components affected: {len(measurement.components)}",
    ]
    if measurement.fetch_age_days is not None and measurement.fetch_age_days > 1:
        lines.append(
            f"NOTE: last fetch was {measurement.fetch_age_days} days ago, so {measurement.baseline_ref} may "
            f"itself be behind the real remote."
        )
    if measurement.components:
        lines.append("")
        lines.append("Components running without their committed changes:")
        for component in measurement.components:
            lines.append(f"  - {component}")
    lines.append("")
    if findings:
        lines.append(f"FAIL: {len(findings)} finding(s)")
        for finding in findings:
            lines.append(f"  [{finding.check}] {finding.message}")
    else:
        lines.append("PASS: release lag is within the declared budget.")
    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Measure and ratchet release lag against the baseline ref.")
    parser.add_argument("--report", action="store_true", help="measure and print, always exit 0")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--repo-root", default=None, help="repository root (default: two levels up)")
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root) if args.repo_root else Path(__file__).resolve().parents[2]

    try:
        data = load_budget(repo_root)
        measurement = measure(repo_root, data["baseline_ref"])
        findings = evaluate(measurement, data, date.today())
    except LagError as exc:
        if args.json:
            print(json.dumps({"error": str(exc), "ok": False}, indent=2))
        else:
            print(f"FAIL: {exc}", file=sys.stderr)
        return 0 if args.report else 1

    if args.json:
        # `ok` is not enough for a consumer: a run that measured nothing would
        # otherwise be indistinguishable from a run that measured zero lag.
        status = "fail" if findings else ("pass" if measurement.observable else "not-measurable")
        print(
            json.dumps(
                {
                    "ok": bool(measurement.observable and not findings),
                    "status": status,
                    "measurement": asdict(measurement),
                    "budget": data["budget"],
                    "findings": [asdict(f) for f in findings],
                },
                indent=2,
            )
        )
    else:
        print(format_report(measurement, data, findings))

    if args.report:
        return 0
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
