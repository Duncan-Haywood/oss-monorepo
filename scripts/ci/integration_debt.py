#!/usr/bin/env python3
"""
Integration debt ratchet.

`scripts/ci/release_lag.py` measures how much work has not reached
`origin/main`. On 2026-08-04 it said: 136 commits, 42 branches. That number is
the same for two situations that are nothing alike.

  * 42 branches that each diverge from every other. Shipping means 42
    reconciliations, days of conflict resolution, and a real chance of losing
    work in the merges.
  * 42 branches that are all ancestors of one branch. The reconciliation is
    already done. Shipping is one reviewed push.

It was the second. Nothing in the repository could say so, so every session
rediscovered it by hand — `docs/INTEGRATION-REPORT-2026-08-03.md` is that
measurement written out longhand ("27 of the 39"), and it was stale within a
day. A fact that has to be re-derived by hand each time is not a control, and
the cost of not having it is that the pile *looks* like weeks of work when it
is one push, so it keeps not being pushed.

What is measured is the number of **independent tips**: branches ahead of the
baseline that are not an ancestor of any other branch ahead of the baseline.
`git merge-base --independent` computes exactly that set. One tip means the
pile has converged onto a single candidate. N tips means there are N piles.

  * Above `max_unintegrated_tips` fails. The pile fragmented.
  * More than `slack_tips` below it also fails. The budget is stale, and a
    ceiling that silently trails reality ratchets nothing.

The declared numbers are bounded by MAX_DECLARED_TIPS, MAX_DECLARED_SLACK and
MAX_EXPIRY_DAYS, so this file cannot be widened into permanent silence, in the
shape `scripts/ci/release_lag.py` uses and `scripts/ci/cap_ratchet.py` holds.

The second measurement is the one that makes the first safe to believe.
Convergence is cheap to fake: `git merge -s ours` makes a branch an ancestor
while discarding every line it carried, and the tip count cannot tell that from
an honest merge. So for every absorbed branch this also asks whether the files
that branch *added* still exist at the tip, and requires each missing one to be
registered with a reason. Measured 2026-08-04: two files, both from the
deliberate resolution of the duplicate kill-criteria engine in `fbb8bd1`, whose
coverage survives in `tests/test_portfolio_router_stopping.py` and
`tests/test_stopping_rule_review.py`. That is what a legitimate drop looks like,
and it is registered rather than assumed.

What this does not measure: whether the merges were *correct*. A file that
still exists can have been merged badly, and the tip count says nothing about
whether the tip passes its own gates — `scripts/test-ci.sh` is what answers
that. This answers a narrower question that nothing else answers: is the work
converged, and did convergence lose anything.

Deliberately fails closed. A missing budget file, an unresolvable baseline ref,
an expired budget, a declared value over its cap, or a git command that fails
is a failure, not a skip. That is the specific way this repository's gates have
been found to lie: a missing input reported PASSED for work it never did.

In a shallow clone there is no branch topology, so "everything is integrated"
is trivially true and means nothing. That is reported as a third state,
NOT MEASURABLE, and never as a pass — the same distinction
`scripts/ci/release_lag.py` draws, for the same reason.

What it does not do: it does not merge, push, or deploy anything. Integrating
and shipping are human decisions. This only makes the shape of the pile visible
on every run instead of once a session by accident.

Usage:
    python3 scripts/ci/integration_debt.py            # audit, exit 1 on failure
    python3 scripts/ci/integration_debt.py --report   # measure, always exit 0
    python3 scripts/ci/integration_debt.py --json     # machine-readable
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

import yaml

BUDGET_PATH = "platform/integration-debt-budget.yaml"

REQUIRED_TOP_FIELDS = ("baseline_ref", "owner", "issue", "expires", "budget", "rationale")

REQUIRED_BUDGET_FIELDS = ("max_unintegrated_tips", "slack_tips")

# A repository whose work sits in more than this many independent piles is not
# operating within a budget; integration has stopped. The cap is on the
# *declaration*, so raising the ceiling past it requires changing this file
# under review rather than editing YAML.
#
# This bounds the *declaration*, not the measurement, so it is not what
# ordinary work has to live within — `budget.max_unintegrated_tips` is, and it
# is 6. The only thing a wider cap buys is room to raise that 6 later.
#
# It was set to 12 for one revision here, reasoned from
# docs/INTEGRATION-REPORT-2026-08-03.md: `agent/integration-2026-08-03` held 27
# of 39 branches the day before, so the repository had been at roughly 12 piles
# and a cap of 8 would not have accommodated declaring that. `cap_ratchet.py`
# refused the raise, and it was right — the answer to 12 real piles is to
# integrate them, not to declare them acceptable. "Raising it does not make the
# underlying problem smaller, it makes the gate stop reporting it" is that
# script's own wording and it applies here.
MAX_DECLARED_TIPS = 8

# Slack wide enough to hide a fragmented pile is not slack. This is the band
# between measured and declared that needs no review.
MAX_DECLARED_SLACK = 6

# The exception register's horizon, for the same reason.
MAX_EXPIRY_DAYS = 180

REQUIRED_DROP_FIELDS = ("path", "branch", "reason", "owner")


class IntegrationDebtError(Exception):
    """A failure that must not be reported as a pass."""


@dataclass
class DroppedArtifact:
    """A file some branch added that is absent from the tip that absorbed it."""

    path: str
    branch: str


@dataclass
class Measurement:
    baseline_ref: str
    baseline_sha: str
    candidate_refs: int
    distinct_commits: int
    tips: List[str] = field(default_factory=list)
    tip_names: List[str] = field(default_factory=list)
    absorbed_refs: int = 0
    dropped: List[DroppedArtifact] = field(default_factory=list)
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
        raise IntegrationDebtError(
            f"git {' '.join(args)} failed ({result.returncode}): {result.stderr.strip()}"
        )
    return result.stdout


def _is_ancestor(repo_root: Path, commit: str, of: str) -> bool:
    """True when `commit` is reachable from `of`. Distinguishes 1 from an error.

    `git merge-base --is-ancestor` exits 0 for yes and 1 for no; any other code
    is a real failure and must not be read as "no".
    """
    env = dict(os.environ)
    env["GIT_CONFIG_GLOBAL"] = "/dev/null"
    env["GIT_CONFIG_SYSTEM"] = "/dev/null"
    result = subprocess.run(
        ["git", "merge-base", "--is-ancestor", commit, of],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        env=env,
    )
    if result.returncode not in (0, 1):
        raise IntegrationDebtError(
            f"git merge-base --is-ancestor {commit} {of} failed "
            f"({result.returncode}): {result.stderr.strip()}"
        )
    return result.returncode == 0


def _candidate_refs(repo_root: Path, baseline_ref: str) -> List[Tuple[str, str]]:
    """Refs holding work the baseline does not have, as (name, sha).

    Both `refs/heads/` and `refs/remotes/` are read. Agent sessions work in
    independent clones of this repository — where the branches arrive as
    remote-tracking refs — while the primary checkout holds them as local
    branches, and the measurement has to mean the same thing in both. A ref
    present under both names resolves to one commit and is counted once by
    `distinct_commits`.

    Symbolic refs (`origin/HEAD`) are skipped: they are an alias for a ref
    already in the list, not a separate pile of work.

    The remote prefix is stripped, so the same branch is named the same thing
    in both environments. Without that, `dropped_artifacts` — which is keyed on
    `(path, branch)` — is not portable: an entry registered from a clone reads
    as `origin/agent/x` and the primary checkout measures `agent/x`, so the
    same deliberate drop fails twice over, once as unregistered and once as a
    stale registration. Registering a drop is a reviewed judgement about a
    *branch*, and it should survive being read from a different checkout of it.
    """
    symbolic: Set[str] = set()
    for line in _git(["for-each-ref", "--format=%(refname) %(symref)", "refs/"], repo_root).splitlines():
        parts = line.split()
        if len(parts) == 2:
            symbolic.add(parts[0])

    remotes = _remote_names(repo_root)
    seen_names: Set[str] = set()
    seen_candidates: Set[Tuple[str, str]] = set()
    candidates: List[Tuple[str, str]] = []
    for pattern in ("refs/heads/", "refs/remotes/"):
        out = _git(["for-each-ref", "--format=%(refname) %(objectname)", pattern], repo_root)
        for line in out.splitlines():
            parts = line.split()
            if len(parts) != 2:
                continue
            refname, sha = parts
            if refname in symbolic or refname in seen_names:
                continue
            seen_names.add(refname)
            if _is_ancestor(repo_root, sha, baseline_ref):
                continue
            # A branch held both locally and as a remote-tracking ref is one
            # branch. It already resolved to one commit; now it also has one
            # name, so it is not counted or reported twice.
            entry = (_short_ref(refname, remotes), sha)
            if entry in seen_candidates:
                continue
            seen_candidates.add(entry)
            candidates.append(entry)
    return candidates


def _remote_names(repo_root: Path) -> Tuple[str, ...]:
    """Configured remotes, longest first so `origin/x` beats a remote named `o`."""
    names = [n for n in _git(["remote"], repo_root).splitlines() if n.strip()]
    return tuple(sorted((n.strip() for n in names), key=len, reverse=True))


def _short_ref(refname: str, remotes: Sequence[str] = ()) -> str:
    for prefix in ("refs/heads/", "refs/remotes/"):
        if refname.startswith(prefix):
            short = refname[len(prefix) :]
            if prefix == "refs/remotes/":
                for remote in remotes:
                    if short.startswith(f"{remote}/"):
                        return short[len(remote) + 1 :]
            return short
    return refname


def _tips(repo_root: Path, shas: Sequence[str]) -> List[str]:
    """The subset of `shas` reachable from no other member of `shas`.

    `git merge-base --independent` is the plumbing for exactly this, in one
    call rather than the O(n^2) pairwise walk. Identical commits collapse,
    which is what makes two refs pointing at the same tip one pile and not two.
    """
    if not shas:
        return []
    out = _git(["merge-base", "--independent", *shas], repo_root)
    return sorted(line.strip() for line in out.splitlines() if line.strip())


def _dropped_artifacts(
    repo_root: Path,
    baseline_ref: str,
    candidates: Sequence[Tuple[str, str]],
    tip_shas: Sequence[str],
) -> List[DroppedArtifact]:
    """Files an absorbed branch added that no tip carries.

    Convergence is cheap to fake — `git merge -s ours` makes a branch an
    ancestor while discarding everything it carried — so the tip count alone
    cannot distinguish an honest integration from a discarded one. This is the
    artifact check behind it: for each absorbed branch, the files it *added*
    relative to where it left the baseline, minus the files any tip still has.

    Added files only. A branch that edited a shared file cannot be checked this
    way without reading the merge, and a bad content merge is a different
    failure that `scripts/test-ci.sh` is the gate for. Deletion of a file the
    branch created is the shape that silently loses a whole control, which is
    the one worth naming.
    """
    tip_set = set(tip_shas)
    surviving: Set[str] = set()
    for sha in tip_shas:
        surviving.update(
            line.strip()
            for line in _git(["ls-tree", "-r", "--name-only", sha], repo_root).splitlines()
            if line.strip()
        )

    dropped: List[DroppedArtifact] = []
    for name, sha in candidates:
        if sha in tip_set:
            continue
        merge_base = _git(["merge-base", sha, baseline_ref], repo_root).strip()
        added = _git(
            ["diff", "--name-only", "--diff-filter=A", merge_base, sha], repo_root
        ).splitlines()
        for path in added:
            path = path.strip()
            if path and path not in surviving:
                dropped.append(DroppedArtifact(path=path, branch=name))
    return sorted(dropped, key=lambda d: (d.path, d.branch))


def measure(repo_root: Path, baseline_ref: str) -> Measurement:
    """Measure the shape of the undelivered pile. Fails closed."""
    # A shallow clone has no branch topology: `actions/checkout` fetches one ref
    # at depth 1, so "one tip" and "no branches at all" are the same number
    # there. Reported as a third state, never as a pass — the subject of the
    # measurement is absent, which is different from there being no debt.
    if (repo_root / ".git" / "shallow").exists():
        return Measurement(
            baseline_ref=baseline_ref,
            baseline_sha="",
            candidate_refs=0,
            distinct_commits=0,
            observable=False,
            observability_note=(
                "shallow clone: branch topology is not present, so integration debt "
                "cannot be measured here. Run this on the machine holding the branches."
            ),
        )

    try:
        baseline_sha = _git(
            ["rev-parse", "--verify", f"{baseline_ref}^{{commit}}"], repo_root
        ).strip()
    except IntegrationDebtError as exc:
        raise IntegrationDebtError(
            f"baseline ref {baseline_ref!r} does not resolve, so integration debt cannot "
            f"be measured. Refusing to report zero debt. ({exc})"
        ) from exc

    candidates = _candidate_refs(repo_root, baseline_ref)
    distinct = sorted({sha for _, sha in candidates})
    tips = _tips(repo_root, distinct)

    tip_names = sorted(
        {name for name, sha in candidates if sha in set(tips)}
    )
    dropped = _dropped_artifacts(repo_root, baseline_ref, candidates, tips)

    return Measurement(
        baseline_ref=baseline_ref,
        baseline_sha=baseline_sha[:12],
        candidate_refs=len(candidates),
        distinct_commits=len(distinct),
        tips=tips,
        tip_names=tip_names,
        absorbed_refs=len([1 for _, sha in candidates if sha not in set(tips)]),
        dropped=dropped,
    )


def load_budget(repo_root: Path, budget_path: str = BUDGET_PATH) -> Dict[str, Any]:
    """Read and validate the declared budget. Fails closed on anything missing."""
    path = repo_root / budget_path
    if not path.exists():
        raise IntegrationDebtError(
            f"{budget_path} is missing. The integration-debt ratchet has no declared "
            f"budget and will not pass by default."
        )

    data = yaml.safe_load(path.read_text()) or {}
    if not isinstance(data, dict):
        raise IntegrationDebtError(
            f"{budget_path} must be a mapping, got {type(data).__name__}."
        )

    missing = [f for f in REQUIRED_TOP_FIELDS if f not in data]
    if missing:
        raise IntegrationDebtError(
            f"{budget_path} is missing required fields: {', '.join(missing)}."
        )

    budget = data["budget"]
    if not isinstance(budget, dict):
        raise IntegrationDebtError(f"{budget_path}: `budget` must be a mapping.")

    missing = [f for f in REQUIRED_BUDGET_FIELDS if f not in budget]
    if missing:
        raise IntegrationDebtError(
            f"{budget_path}: `budget` is missing required fields: {', '.join(missing)}."
        )

    for key, value in budget.items():
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise IntegrationDebtError(
                f"{budget_path}: `budget.{key}` must be a non-negative integer, got {value!r}."
            )

    if budget["max_unintegrated_tips"] > MAX_DECLARED_TIPS:
        raise IntegrationDebtError(
            f"{budget_path}: `max_unintegrated_tips` is {budget['max_unintegrated_tips']}, "
            f"over the {MAX_DECLARED_TIPS} cap. Work sitting in more piles than that is a "
            f"stopped integration process, not a budget."
        )

    if budget["slack_tips"] > MAX_DECLARED_SLACK:
        raise IntegrationDebtError(
            f"{budget_path}: `slack_tips` is {budget['slack_tips']}, over the "
            f"{MAX_DECLARED_SLACK} cap. Slack that wide hides a fragmented pile."
        )

    expires = data["expires"]
    if isinstance(expires, datetime):
        expires = expires.date()
    if not isinstance(expires, date):
        raise IntegrationDebtError(
            f"{budget_path}: `expires` must be a date (YYYY-MM-DD), got {expires!r}."
        )

    horizon = (expires - date.today()).days
    if horizon > MAX_EXPIRY_DAYS:
        raise IntegrationDebtError(
            f"{budget_path}: `expires` is {horizon} days out, over the {MAX_EXPIRY_DAYS}-day "
            f"cap. A budget nobody re-reads is a policy change made without review."
        )

    registered = data.get("dropped_artifacts") or []
    if not isinstance(registered, list):
        raise IntegrationDebtError(
            f"{budget_path}: `dropped_artifacts` must be a list, got {type(registered).__name__}."
        )
    for index, entry in enumerate(registered):
        if not isinstance(entry, dict):
            raise IntegrationDebtError(
                f"{budget_path}: `dropped_artifacts[{index}]` must be a mapping."
            )
        absent = [f for f in REQUIRED_DROP_FIELDS if not entry.get(f)]
        if absent:
            raise IntegrationDebtError(
                f"{budget_path}: `dropped_artifacts[{index}]` is missing "
                f"{', '.join(absent)}. A dropped file with no stated reason is "
                f"indistinguishable from work lost in a merge."
            )

    data["expires"] = expires
    return data


def evaluate(
    measurement: Measurement, budget_data: Dict[str, Any], today: date
) -> List[Finding]:
    """Compare the measurement to the declared budget. Two-directional."""
    findings: List[Finding] = []

    if budget_data["expires"] < today:
        findings.append(
            Finding(
                check="budget-expired",
                message=(
                    f"{BUDGET_PATH} expired on {budget_data['expires']}. Re-read it and "
                    f"declare the debt again, or lower it."
                ),
            )
        )

    if not measurement.observable:
        return findings

    budget = budget_data["budget"]
    declared = budget["max_unintegrated_tips"]
    slack = budget["slack_tips"]
    measured = len(measurement.tips)

    if measured > declared:
        findings.append(
            Finding(
                check="tips-above-budget",
                message=(
                    f"{measured} independent tips hold undelivered work, over the declared "
                    f"budget of {declared}. The pile fragmented: shipping now means "
                    f"{measured} reconciliations, not one push."
                ),
            )
        )
    elif measured < declared - slack:
        findings.append(
            Finding(
                check="budget-stale",
                message=(
                    f"{measured} independent tips measured against a declared budget of "
                    f"{declared} (slack {slack}). The pile converged and the budget did "
                    f"not follow. Lower `max_unintegrated_tips` to {measured}."
                ),
            )
        )

    registered = {
        (entry["path"], entry["branch"]) for entry in (budget_data.get("dropped_artifacts") or [])
    }
    measured_drops = {(d.path, d.branch) for d in measurement.dropped}

    for path, branch in sorted(measured_drops - registered):
        findings.append(
            Finding(
                check="unregistered-drop",
                message=(
                    f"{path} was added on {branch} and no tip carries it. Integration "
                    f"discarded a file some branch created. Register it in {BUDGET_PATH} "
                    f"with the reason it was right to drop, or restore it."
                ),
            )
        )

    for path, branch in sorted(registered - measured_drops):
        findings.append(
            Finding(
                check="stale-drop-registration",
                message=(
                    f"{BUDGET_PATH} registers {path} from {branch} as deliberately dropped, "
                    f"but it is no longer missing. Remove the entry: a register that "
                    f"outlives what it excuses stops being read."
                ),
            )
        )

    return findings


def format_report(
    measurement: Measurement, budget_data: Dict[str, Any], findings: Sequence[Finding]
) -> str:
    lines = ["=== Integration debt ==="]

    if not measurement.observable:
        lines.append(f"Baseline:            {measurement.baseline_ref}")
        lines.append("")
        lines.append(f"NOT MEASURABLE HERE: {measurement.observability_note}")
        if findings:
            lines.append("")
            lines.append(f"FAIL: {len(findings)} finding(s)")
            for finding in findings:
                lines.append(f"  [{finding.check}] {finding.message}")
        return "\n".join(lines)

    budget = budget_data["budget"]
    lines.append(f"Baseline:            {measurement.baseline_ref} @ {measurement.baseline_sha}")
    lines.append(
        f"Refs ahead:          {measurement.candidate_refs} "
        f"({measurement.distinct_commits} distinct commits)"
    )
    lines.append(
        f"Independent tips:    {len(measurement.tips)} "
        f"(budget {budget['max_unintegrated_tips']}, slack {budget['slack_tips']})"
    )
    lines.append(f"Absorbed into them:  {measurement.absorbed_refs}")
    lines.append(f"Dropped artifacts:   {len(measurement.dropped)}")

    if measurement.tip_names:
        lines.append("")
        lines.append("Release candidates (each is a separate pile):")
        for name in measurement.tip_names:
            lines.append(f"  - {name}")

    if measurement.dropped:
        lines.append("")
        lines.append("Files added on an absorbed branch that no tip carries:")
        for drop in measurement.dropped:
            lines.append(f"  - {drop.path}  (added on {drop.branch})")

    lines.append("")
    if findings:
        lines.append(f"FAIL: {len(findings)} finding(s)")
        for finding in findings:
            lines.append(f"  [{finding.check}] {finding.message}")
    else:
        tips = len(measurement.tips)
        if tips == 1:
            lines.append(
                f"PASS: {measurement.candidate_refs} refs ahead of {measurement.baseline_ref} "
                f"converge on one candidate. Shipping is one reviewed push, not "
                f"{measurement.candidate_refs} reconciliations."
            )
        elif tips == 0:
            lines.append(f"PASS: nothing is ahead of {measurement.baseline_ref}.")
        else:
            lines.append(f"PASS: {tips} independent tips, within the declared budget.")

    return "\n".join(lines)


def audit(repo_root: Path, today: Optional[date] = None) -> Tuple[Measurement, Dict[str, Any], List[Finding]]:
    budget_data = load_budget(repo_root)
    measurement = measure(repo_root, budget_data["baseline_ref"])
    findings = evaluate(measurement, budget_data, today or date.today())
    return measurement, budget_data, findings


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("--report", action="store_true", help="measure and always exit 0")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--repo-root", default=None)
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root) if args.repo_root else Path(__file__).resolve().parents[2]

    try:
        measurement, budget_data, findings = audit(repo_root)
    except IntegrationDebtError as exc:
        if args.json:
            print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        else:
            print(f"ERROR: {exc}", file=sys.stderr)
        return 0 if args.report else 1

    if args.json:
        payload = {
            # A shallow clone is not a pass. `ok` is false there so a consumer
            # reading only this field cannot mistake an absent measurement for
            # a clean one.
            "ok": bool(measurement.observable and not findings),
            "observable": measurement.observable,
            "measurement": asdict(measurement),
            "budget": {
                k: (v.isoformat() if isinstance(v, date) else v) for k, v in budget_data.items()
            },
            "findings": [asdict(f) for f in findings],
        }
        print(json.dumps(payload, indent=2, default=str))
    else:
        print(format_report(measurement, budget_data, findings))

    if args.report:
        return 0
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
