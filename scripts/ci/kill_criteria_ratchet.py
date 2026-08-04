#!/usr/bin/env python3
"""Counts the ventures that have no stopping rule, and refuses to let that grow.

Every venture in `ventures/*/VENTURE.yaml` declares `kill_criteria`: the
conditions under which the portfolio stops funding it. Sixteen were declared
across eleven ventures, and until 2026-08-03 nothing read a single one.
`portfolio/router/allocate.py` loaded them into a local called `kill_rules` and
never referenced it; the only rules that ran were two hardcoded stage checks
that cannot fire while every venture is `prototype`. So `killed_count` was zero
by construction, and the money kept moving.

That is a spending control, not a style problem. The allocator hands out
$199.98 a month against a $500 pool to ventures whose combined recorded revenue
is zero, and there was no rule in the system capable of ending any of it.

Making the criteria evaluable is the fix; this file is what stops it eroding.
It measures how many ventures have no criterion the allocator can actually
measure, and compares against `platform/kill-criteria-baseline.yaml` in both
directions, like the coverage baselines and the release-lag budget:

  * Measured above `max_without_stopping_rule` fails — a venture was added, or a
    criterion was rewritten back into prose, and the portfolio lost a brake.
  * Measured below it by more than `slack` also fails — criteria became
    measurable and the baseline is now stale. Lowering it is a deliberate,
    reviewed act.

The declared ceiling is capped in this file at MAX_DECLARED_WITHOUT_STOPPING_RULE,
which equals the whole portfolio as measured on 2026-08-03. A ceiling that can be
raised to cover every venture is not a ceiling, so the only direction this number
can travel is down, and the only edit that moves it is making a criterion
measurable.

Nothing here defunds, kills, or pauses a venture. Stopping a venture is a human
decision, and the criteria themselves are the portfolio owner's to set. This
only refuses to let the count of ventures with no brake grow quietly.

Usage:
    python3 scripts/ci/kill_criteria_ratchet.py           # audit, exit 1 on failure
    python3 scripts/ci/kill_criteria_ratchet.py --report  # measure, always exit 0
    python3 scripts/ci/kill_criteria_ratchet.py --json    # machine-readable
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from portfolio.router.kill_criteria import (
    NOT_MEASURABLE,
    evaluate_venture,
    has_stopping_rule,
    ledger_rows_by_venture,
)

BASELINE_PATH = "platform/kill-criteria-baseline.yaml"

REQUIRED_TOP_FIELDS = ("owner", "issue", "expires", "budget", "rationale")
REQUIRED_BUDGET_FIELDS = ("max_without_stopping_rule", "slack")

# The 2026-08-03 measurement was 11 of 11 ventures with no measurable stopping
# rule. Capping the declaration at that number means the ceiling can never be
# widened past "the entire portfolio has no brake" — which is where it started,
# and the one place it must not be allowed to return to.
MAX_DECLARED_WITHOUT_STOPPING_RULE = 11

# Slack wide enough to swallow the whole portfolio is not slack.
MAX_DECLARED_SLACK = 4

# The exception register's horizon, for the same reason.
MAX_EXPIRY_DAYS = 180


class RatchetError(Exception):
    """A failure that must not be reported as a pass."""


@dataclass
class VentureVerdict:
    venture: str
    stage: str
    criteria_declared: int
    criteria_evaluable: int
    has_stopping_rule: bool
    unevaluable: List[Dict[str, str]] = field(default_factory=list)


@dataclass
class Measurement:
    ventures_measured: int
    without_stopping_rule: int
    venture_names_without: List[str] = field(default_factory=list)
    verdicts: List[VentureVerdict] = field(default_factory=list)


@dataclass
class Finding:
    check: str
    message: str

    def format_line(self) -> str:
        return f"  [{self.check}] {self.message}"


def load_baseline(repo_root: Path, baseline_path: str = BASELINE_PATH) -> Dict[str, Any]:
    """Read and validate the declared baseline, failing closed on every defect."""
    path = repo_root / baseline_path
    if not path.exists():
        raise RatchetError(
            f"{baseline_path} is missing. The ratchet cannot report a pass without a "
            "declared baseline to compare against."
        )

    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        raise RatchetError(f"{baseline_path} is not parseable YAML: {exc}") from exc

    if not isinstance(data, dict):
        raise RatchetError(f"{baseline_path} must be a mapping, found {type(data).__name__}.")

    missing = [f for f in REQUIRED_TOP_FIELDS if not data.get(f)]
    if missing:
        raise RatchetError(f"{baseline_path} is missing required field(s): {', '.join(missing)}.")

    budget = data.get("budget")
    if not isinstance(budget, dict):
        raise RatchetError(f"{baseline_path}: `budget` must be a mapping.")

    for field_name in REQUIRED_BUDGET_FIELDS:
        if field_name not in budget:
            raise RatchetError(f"{baseline_path}: `budget.{field_name}` is not declared.")
        value = budget[field_name]
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise RatchetError(
                f"{baseline_path}: `budget.{field_name}` must be a non-negative integer, "
                f"found {value!r}."
            )

    declared = budget["max_without_stopping_rule"]
    if declared > MAX_DECLARED_WITHOUT_STOPPING_RULE:
        raise RatchetError(
            f"{baseline_path}: `budget.max_without_stopping_rule` is {declared}, above the "
            f"cap of {MAX_DECLARED_WITHOUT_STOPPING_RULE} set in {Path(__file__).name}. "
            "The ceiling cannot be widened to cover the whole portfolio; make a criterion "
            "measurable instead."
        )

    if budget["slack"] > MAX_DECLARED_SLACK:
        raise RatchetError(
            f"{baseline_path}: `budget.slack` is {budget['slack']}, above the cap of "
            f"{MAX_DECLARED_SLACK}."
        )

    expires = data.get("expires")
    expiry = expires if isinstance(expires, date) else None
    if expiry is None:
        try:
            expiry = datetime.strptime(str(expires), "%Y-%m-%d").date()
        except ValueError as exc:
            raise RatchetError(
                f"{baseline_path}: `expires` must be a YYYY-MM-DD date, found {expires!r}."
            ) from exc

    data["_expiry_date"] = expiry
    return data


def measure(repo_root: Path) -> Measurement:
    """Evaluate every venture's criteria against recorded ledger history."""
    ventures_dir = repo_root / "ventures"
    ledger_dir = repo_root / "portfolio" / "ledger"

    # `ledger_rows_by_venture` skips a ledger file it cannot parse, so a corrupt
    # month would read here as "these ventures recorded nothing" — which is the
    # unmeasurable verdict, not an error. Parse every file first and fail on one
    # that does not load, so a broken ledger stops this gate instead of quietly
    # widening the count it is supposed to hold.
    if ledger_dir.exists():
        for ledger_file in sorted(ledger_dir.glob("*.yaml")):
            try:
                yaml.safe_load(ledger_file.read_text(encoding="utf-8"))
            except yaml.YAMLError as exc:
                raise RatchetError(f"{ledger_file} is not parseable YAML: {exc}") from exc

    ledger_rows, ledger_present = ledger_rows_by_venture(repo_root)

    verdicts: List[VentureVerdict] = []
    for manifest in sorted(ventures_dir.glob("*/VENTURE.yaml")):
        try:
            data = yaml.safe_load(manifest.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as exc:
            raise RatchetError(f"{manifest} is not parseable YAML: {exc}") from exc
        if not isinstance(data, dict):
            continue

        name = str(data.get("name") or manifest.parent.name)
        # The engine keys ledger rows by the venture's own name; fall back to
        # the directory name, which is what some ledger rows record.
        lookup = name if name in ledger_rows else manifest.parent.name
        results = evaluate_venture(data, lookup, ledger_rows, ledger_present)
        verdicts.append(
            VentureVerdict(
                venture=name,
                stage=str(data.get("stage", "unknown")),
                criteria_declared=len(results),
                criteria_evaluable=sum(1 for r in results if r.outcome != NOT_MEASURABLE),
                has_stopping_rule=has_stopping_rule(results),
                unevaluable=[
                    {"description": r.text, "reason": r.reason, "criterion_id": r.criterion_id}
                    for r in results
                    if r.outcome == NOT_MEASURABLE
                ],
            )
        )

    without = [v.venture for v in verdicts if not v.has_stopping_rule]
    return Measurement(
        ventures_measured=len(verdicts),
        without_stopping_rule=len(without),
        venture_names_without=sorted(without),
        verdicts=verdicts,
    )


def audit(measurement: Measurement, baseline: Dict[str, Any], today: date) -> List[Finding]:
    """Compare the measurement against the declared baseline, in both directions."""
    findings: List[Finding] = []
    budget = baseline["budget"]
    declared = budget["max_without_stopping_rule"]
    slack = budget["slack"]
    measured = measurement.without_stopping_rule

    if measurement.ventures_measured == 0:
        findings.append(
            Finding(
                "not-measurable",
                "no ventures/*/VENTURE.yaml were found. A measurement of zero here means "
                "the ventures were not read, not that every venture has a stopping rule.",
            )
        )
        return findings

    if measured > declared:
        findings.append(
            Finding(
                "stopping-rules-lost",
                f"{measured} venture(s) have no measurable stopping rule, above the declared "
                f"ceiling of {declared}: {', '.join(measurement.venture_names_without)}. "
                "Give one of them a criterion with a `metric`, or lower the ceiling only if "
                "a venture was removed.",
            )
        )

    if measured < declared - slack:
        findings.append(
            Finding(
                "baseline-stale",
                f"{measured} venture(s) have no measurable stopping rule, more than {slack} "
                f"below the declared ceiling of {declared}. Criteria became measurable and "
                f"nobody lowered the ceiling; set `max_without_stopping_rule: {measured}` in "
                f"{BASELINE_PATH}.",
            )
        )

    expiry = baseline["_expiry_date"]
    if expiry < today:
        findings.append(
            Finding(
                "baseline-expired",
                f"{BASELINE_PATH} expired on {expiry.isoformat()}. Re-argue the ceiling or "
                "make the remaining criteria measurable; an expired budget is not a pass.",
            )
        )
    elif (expiry - today).days > MAX_EXPIRY_DAYS:
        findings.append(
            Finding(
                "baseline-horizon-too-far",
                f"{BASELINE_PATH} expires {(expiry - today).days} days out, beyond the "
                f"{MAX_EXPIRY_DAYS}-day cap. A budget nobody revisits is silence.",
            )
        )

    return findings


def format_report(measurement: Measurement, baseline: Dict[str, Any], findings: List[Finding]) -> str:
    budget = baseline["budget"]
    lines = ["=== Kill-criteria stopping rules ==="]
    lines.append(f"Ventures measured:            {measurement.ventures_measured}")
    lines.append(
        f"Without a stopping rule:      {measurement.without_stopping_rule} "
        f"(declared ceiling {budget['max_without_stopping_rule']}, slack {budget['slack']})"
    )

    if measurement.venture_names_without:
        lines.append("")
        lines.append("No criterion the allocator can measure:")
        for verdict in measurement.verdicts:
            if verdict.has_stopping_rule:
                continue
            lines.append(f"  {verdict.venture} ({verdict.criteria_declared} declared)")
            for item in verdict.unevaluable:
                lines.append(f"    - [{item['reason']}] {item['description']}")

    lines.append("")
    if findings:
        lines.append(f"FAIL: {len(findings)} finding(s)")
        lines.extend(f.format_line() for f in findings)
    else:
        lines.append("PASS: no venture lost a stopping rule, and the baseline is current.")
    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--report", action="store_true", help="measure and print, always exit 0")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--repo-root", default=None, help="repository root to audit")
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root).resolve() if args.repo_root else REPO_ROOT

    try:
        baseline = load_baseline(repo_root)
        measurement = measure(repo_root)
    except RatchetError as exc:
        print(f"ERROR {exc}", file=sys.stderr)
        return 0 if args.report else 1

    findings = audit(measurement, baseline, date.today())

    if args.json:
        payload = {
            "ok": not findings,
            # "not-measurable" exists so that reading nothing is never reported
            # as measuring zero ventures without a stopping rule.
            "status": (
                "not-measurable"
                if any(f.check == "not-measurable" for f in findings)
                else ("pass" if not findings else "fail")
            ),
            "measurement": asdict(measurement),
            "budget": baseline["budget"],
            "findings": [asdict(f) for f in findings],
        }
        print(json.dumps(payload, indent=2))
    else:
        print(format_report(measurement, baseline, findings))

    if args.report:
        return 0
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
