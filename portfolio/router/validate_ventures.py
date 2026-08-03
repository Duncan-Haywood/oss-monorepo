#!/usr/bin/env python3
"""
Venture contract validator.

The router allocates real budget from `ventures/*/VENTURE.yaml`. Three fields
move money, and nothing currently checks that any of them reflect reality:

- `economics.mrr` — `null` (unmeasured) earns 0.65 explore credit, a measured
  `0` earns 0.30. A venture that has been measured at zero but still says `null`
  collects more than double the economics credit it earned.
- `hypotheses[].status` — every status other than `untested` adds +0.1 to the
  composite score. Nothing verifies the claim was actually tested. A `supported`
  claim must be backed by either measured revenue or an explicit `evidence:`
  citation; "we believe it" is `untested`.
- `stage` — `launched` weights 0.75 against `prototype` at 0.55. A venture with
  no production link is not launched.

`portfolio/ledger/README.md` states the rule this enforces: "Record outcomes
even when they are nothing." A contract that drifts from the ledger destroys the
only signal the router has, and it drifts in the flattering direction by default.

Run `python3 portfolio/router/validate_ventures.py` to report, or with
`--strict` to exit non-zero on warnings as well as errors.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

try:
    # Importable as a package (pytest sets `pythonpath`), and runnable as a
    # script, which puts this directory on sys.path instead of the repo root.
    from portfolio.router import kill_criteria
except ImportError:
    import kill_criteria

REVENUE_STAGES = {"launched", "revenue", "scaling"}
VALID_STAGES = {"idea", "prototype", "launched", "revenue", "scaling", "winding-down"}
VALID_HYPOTHESIS_STATUSES = {"untested", "supported", "refuted"}


@dataclass
class Finding:
    venture: str
    severity: str  # "error" | "warn"
    code: str
    message: str
    remedy: str

    def format_line(self) -> str:
        marker = "ERROR" if self.severity == "error" else " WARN"
        return f"[{marker}] {self.venture}: {self.message}\n         → {self.remedy}"


def find_repo_root(start: Optional[Path] = None) -> Path:
    current = (start or Path(__file__).resolve()).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / "ventures").is_dir() and (candidate / "portfolio").is_dir():
            return candidate
    raise RuntimeError("Could not locate repository root from " + str(current))


def load_latest_ledger_mrr(repo_root: Path) -> Dict[str, Optional[float]]:
    """Maps venture name to the most recent recorded `mrr_end`, if any."""
    ledger_dir = repo_root / "portfolio" / "ledger"
    if not ledger_dir.is_dir():
        return {}

    ledger_files = sorted(p for p in ledger_dir.glob("*.yaml"))
    if not ledger_files:
        return {}

    recorded: Dict[str, Optional[float]] = {}
    # Later files win, so the newest period is authoritative.
    for ledger_file in ledger_files:
        try:
            with open(ledger_file, "r", encoding="utf-8") as handle:
                data = yaml.safe_load(handle) or {}
        except yaml.YAMLError as exc:
            print(f"Warning: could not parse {ledger_file}: {exc}", file=sys.stderr)
            continue

        for entry in data.get("entries", []) or []:
            name = entry.get("venture")
            if not name:
                continue
            if "mrr_end" in entry:
                recorded[name] = entry.get("mrr_end")

    return recorded


def validate_venture(
    data: Dict[str, Any],
    name: str,
    ledger_mrr: Dict[str, Optional[float]],
) -> List[Finding]:
    findings: List[Finding] = []

    stage = str(data.get("stage", "")).lower()
    economics = data.get("economics") or {}
    links = data.get("links") or {}
    budget = data.get("budget") or {}
    hypotheses = data.get("hypotheses") or []

    if stage not in VALID_STAGES:
        findings.append(
            Finding(
                venture=name,
                severity="error",
                code="invalid-stage",
                message=f"stage '{stage or '(missing)'}' is not a recognised stage",
                remedy=f"Set stage to one of: {', '.join(sorted(VALID_STAGES))}",
            )
        )

    declared_mrr = economics.get("mrr")
    measured_mrr = ledger_mrr.get(name)

    if declared_mrr is None and measured_mrr is not None:
        findings.append(
            Finding(
                venture=name,
                severity="warn",
                code="stale-unmeasured-mrr",
                message=(
                    f"economics.mrr is null (unmeasured) but the ledger records "
                    f"mrr_end: {measured_mrr}"
                ),
                remedy=(
                    f"Set economics.mrr to {measured_mrr}. Unmeasured earns 0.65 "
                    "explore credit; a measured zero earns 0.30, so leaving this "
                    "null overstates the venture's allocation."
                ),
            )
        )

    has_revenue_evidence = bool(
        (declared_mrr is not None and declared_mrr > 0)
        or (measured_mrr is not None and measured_mrr > 0)
    )

    for index, hypothesis in enumerate(hypotheses):
        status = str(hypothesis.get("status", "untested")).lower()
        claim = str(hypothesis.get("claim", "")).strip()

        if status not in VALID_HYPOTHESIS_STATUSES:
            findings.append(
                Finding(
                    venture=name,
                    severity="error",
                    code="invalid-hypothesis-status",
                    message=f"hypothesis[{index}] status '{status}' is not recognised",
                    remedy=f"Use one of: {', '.join(sorted(VALID_HYPOTHESIS_STATUSES))}",
                )
            )
            continue

        # Not every hypothesis is a willingness-to-pay claim, so revenue is not
        # the only admissible proof — but something has to be cited. An
        # `evidence:` line naming the benchmark, experiment, or customer that
        # settled the question is enough; an unsourced assertion is not.
        cited_evidence = str(hypothesis.get("evidence") or "").strip()

        if status == "supported" and not has_revenue_evidence and not cited_evidence:
            findings.append(
                Finding(
                    venture=name,
                    severity="warn",
                    code="unearned-hypothesis-support",
                    message=(
                        f"hypothesis[{index}] is marked 'supported' with neither "
                        f"measured revenue nor cited evidence: {claim[:80]}"
                    ),
                    remedy=(
                        "Add an `evidence:` line naming the benchmark, experiment, or "
                        "paying customer that settled it, or set status to 'untested'. "
                        "Each non-untested hypothesis adds +0.1 to the venture's "
                        "composite allocation score."
                    ),
                )
            )

        if status != "untested" and not hypothesis.get("checked"):
            findings.append(
                Finding(
                    venture=name,
                    severity="warn",
                    code="missing-hypothesis-check-date",
                    message=f"hypothesis[{index}] is '{status}' but has no `checked` date",
                    remedy="Add `checked: YYYY-MM-DD` recording when it was evaluated",
                )
            )

    if stage in REVENUE_STAGES and not links.get("production"):
        findings.append(
            Finding(
                venture=name,
                severity="warn",
                code="launched-without-production-link",
                message=f"stage is '{stage}' but links.production is not set",
                remedy=(
                    "Add the production URL, or move the stage back to 'prototype'. "
                    "'launched' carries a 0.75 stage weight against 0.55 for prototype."
                ),
            )
        )

    if budget.get("protected") and not (data.get("kill_criteria") or []):
        findings.append(
            Finding(
                venture=name,
                severity="error",
                code="protected-without-kill-criteria",
                message="budget.protected is true but no kill_criteria are defined",
                remedy=(
                    "A protected venture draws budget regardless of return. Without "
                    "kill criteria there is no condition under which it stops."
                ),
            )
        )

    if "monthly_cap" not in budget:
        findings.append(
            Finding(
                venture=name,
                severity="error",
                code="missing-monthly-cap",
                message="budget.monthly_cap is not set",
                remedy="Set an explicit monthly_cap; the router otherwise assumes $50.",
            )
        )

    return findings


def validate_kill_criteria(root: Path) -> List[Finding]:
    """Every declared kill criterion either evaluates or is registered.

    `budget.protected` above demands kill criteria on the grounds that without
    them "there is no condition under which it stops" — but until 2026-08-03 a
    line of prose satisfied that check while `allocate.py` read the criteria
    into an unused variable. Declaring a criterion and evaluating one were
    entirely unrelated acts. This closes the join.
    """
    findings: List[Finding] = []
    ledger_rows, ledger_present = kill_criteria.ledger_rows_by_venture(root)

    results = []
    for venture_file in sorted((root / "ventures").glob("*/VENTURE.yaml")):
        try:
            with open(venture_file, "r", encoding="utf-8") as handle:
                data = yaml.safe_load(handle) or {}
        except yaml.YAMLError:
            continue  # already reported as unparseable-contract
        results.extend(
            kill_criteria.evaluate_venture(
                data, venture_file.parent.name, ledger_rows, ledger_present
            )
        )

    for triggered in (r for r in results if r.outcome == kill_criteria.TRIGGERED):
        findings.append(
            Finding(
                venture=triggered.venture,
                severity="warn",
                code="kill-criterion-triggered",
                message=f"kill criterion fired: {triggered.text or triggered.criterion_id} — {triggered.reason}",
                remedy=(
                    "The allocator has zeroed this venture's budget. Wind it down, or "
                    "change the criterion deliberately and record why."
                ),
            )
        )

    for register_finding in kill_criteria.audit_register(results, kill_criteria.load_register(root)):
        findings.append(
            Finding(
                venture="portfolio",
                severity=register_finding.severity,
                code=register_finding.code,
                message=register_finding.message,
                remedy=register_finding.remedy,
            )
        )

    return findings


def validate_all(repo_root: Optional[Path] = None) -> List[Finding]:
    root = repo_root or find_repo_root()
    ledger_mrr = load_latest_ledger_mrr(root)

    findings: List[Finding] = []
    for venture_file in sorted((root / "ventures").glob("*/VENTURE.yaml")):
        name = venture_file.parent.name
        try:
            with open(venture_file, "r", encoding="utf-8") as handle:
                data = yaml.safe_load(handle) or {}
        except yaml.YAMLError as exc:
            findings.append(
                Finding(
                    venture=name,
                    severity="error",
                    code="unparseable-contract",
                    message=f"VENTURE.yaml could not be parsed: {exc}",
                    remedy="Fix the YAML syntax; the router skips unreadable contracts.",
                )
            )
            continue

        declared_name = data.get("name")
        if declared_name and declared_name != name:
            findings.append(
                Finding(
                    venture=name,
                    severity="error",
                    code="name-directory-mismatch",
                    message=f"name '{declared_name}' does not match directory '{name}'",
                    remedy=(
                        "Align them — the ledger joins on venture name, so a mismatch "
                        "silently detaches spend from outcomes."
                    ),
                )
            )

        findings.extend(validate_venture(data, name, ledger_mrr))

    findings.extend(validate_kill_criteria(root))

    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate venture contracts against the ledger.")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero on warnings as well as errors.",
    )
    parser.add_argument("--json", action="store_true", help="Emit findings as JSON.")
    args = parser.parse_args()

    findings = validate_all()
    errors = [f for f in findings if f.severity == "error"]
    warnings = [f for f in findings if f.severity == "warn"]

    if args.json:
        print(json.dumps([asdict(f) for f in findings], indent=2))
    else:
        print("=== Venture Contract Validation ===")
        if not findings:
            print("All venture contracts are consistent with the ledger.")
        else:
            for finding in findings:
                print(finding.format_line())
            print()
            print(f"{len(errors)} error(s), {len(warnings)} warning(s).")

    if errors:
        return 1
    if warnings and args.strict:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
