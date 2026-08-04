#!/usr/bin/env python3
"""Requires a recorded human decision for every stopping rule that has fired.

`ventures/*/VENTURE.yaml` declares `kill_criteria`, and since 2026-08-03
`portfolio/router/kill_criteria.py` can evaluate the structured ones against
recorded ledger history. What a fired criterion then *did* was the gap: it
moved a row to `killed` in a JSON file written by `portfolio/router/allocate.py`,
which nothing runs. `portfolio/router/router.py` — the engine `scripts/test-ci.sh`
does run, and the one that writes the ranked work queue in
`portfolio/ALLOCATION_REPORT.md` — never read the criteria at all. So a venture
could trip its own declared brake and keep its rank, its budget and its place at
the top of the queue an agent session reads to pick work, and nothing anywhere
would say so.

`router.py` now withholds the allocation and ranks the venture last. This file
is the other half: the decision itself. Stopping a venture is a human judgement
and must stay one, but a judgement nobody is ever asked for is indistinguishable
from no rule at all. So a triggered criterion with no entry in
`portfolio/stopping-decisions.yaml` fails the build, and the failure names the
venture, the criterion and the measured values that tripped it.

The register is audited in both directions, in the shape `count` uses in
`platform/exception-register.yaml`:

  * A triggered criterion with no decision fails — nobody looked.
  * A decision whose `review_by` has passed fails — somebody looked once and the
    answer went stale.
  * A decision for a criterion that is no longer triggered fails — the register
    drifted above the thing it covers, and a stale `continue` must not sit there
    ready to pre-authorise the next trigger.
  * `decision: wind-down` while the venture is not `stage: winding-down` fails —
    that is a decision recorded and not carried out, which is the failure mode
    this whole control exists to catch, one level up.

`continue` is an override of the portfolio's own declared brake, so it is capped
at MAX_CONTINUE_OVERRIDES ventures. A register in which every venture is
permanently `continue` is the state the criteria were written to prevent.

Usage:
    python3 scripts/ci/stopping_rule_review.py           # audit, exit 1 on failure
    python3 scripts/ci/stopping_rule_review.py --report  # measure, always exit 0
    python3 scripts/ci/stopping_rule_review.py --json    # machine-readable
"""

from __future__ import annotations

import argparse
import json
import re
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
    TRIGGERED,
    build_ledger_facts,
    evaluate_venture,
)

REGISTER_PATH = "portfolio/stopping-decisions.yaml"

REQUIRED_TOP_FIELDS = ("owner", "issue", "decisions")
REQUIRED_DECISION_FIELDS = (
    "venture",
    "criterion",
    "decided_by",
    "decided_on",
    "decision",
    "reason",
)

DECISION_CONTINUE = "continue"
DECISION_WIND_DOWN = "wind-down"
VALID_DECISIONS = (DECISION_CONTINUE, DECISION_WIND_DOWN)

# The stage a venture must reach for a `wind-down` decision to count as carried
# out. `STAGE_WEIGHTS` in portfolio/router/router.py already scores it at 0.05,
# so the allocator honours it the moment the contract says it.
WINDING_DOWN_STAGE = "winding-down"

# A `continue` is the portfolio owner overruling a brake they themselves
# declared. Two is enough for a real disagreement about a threshold and far too
# few to become the standing answer.
MAX_CONTINUE_OVERRIDES = 2

# How long a `continue` can stand before it must be re-argued. Shorter than the
# exception register's 180 days, because this one is holding back a rule that
# has already fired rather than one that might.
MAX_REVIEW_DAYS = 90

# A reason shorter than this is not a reason. Matches the shape the exception
# register asks for: the text has to say what makes continuing correct.
MIN_REASON_CHARS = 40


class ReviewError(Exception):
    """A failure that must not be reported as a pass."""


@dataclass
class TriggeredCriterion:
    venture: str
    stage: str
    description: str
    detail: str


@dataclass
class Measurement:
    ventures_measured: int
    triggered: List[TriggeredCriterion] = field(default_factory=list)
    decisions_registered: int = 0


@dataclass
class Finding:
    check: str
    message: str

    def format_line(self) -> str:
        return f"  [{self.check}] {self.message}"


def normalise(text: Any) -> str:
    """Collapse whitespace so a folded YAML scalar matches its own text.

    A criterion written with `>-` in VENTURE.yaml arrives with the line breaks
    turned into spaces, and the same sentence pasted into the register may not
    wrap at the same column. Matching on the collapsed form means the register
    is keyed on what the criterion says, not on how it was typeset.
    """
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _parse_date(value: Any, label: str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (TypeError, ValueError) as exc:
        raise ReviewError(f"{label} must be a YYYY-MM-DD date, got {value!r}") from exc


def load_register(repo_root: Path, register_path: str = REGISTER_PATH) -> Dict[str, Any]:
    """Read and validate the decision register, failing closed on every defect.

    An absent register is a failure rather than an empty one. "No file" and "no
    triggered criteria" would otherwise report the same thing, and the first is
    the state this control was built because the repository was already in.
    """
    path = repo_root / register_path
    if not path.exists():
        raise ReviewError(
            f"{register_path} is missing. A triggered stopping rule has nowhere to be "
            "decided, so this audit cannot report a pass."
        )

    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ReviewError(f"{register_path} is not parseable YAML: {exc}") from exc

    if not isinstance(data, dict):
        raise ReviewError(f"{register_path} must be a YAML mapping.")

    missing = [f for f in REQUIRED_TOP_FIELDS if f not in data]
    if missing:
        raise ReviewError(f"{register_path} is missing required field(s): {', '.join(missing)}.")

    decisions = data.get("decisions")
    if decisions is None:
        decisions = []
    if not isinstance(decisions, list):
        raise ReviewError(f"{register_path}: `decisions` must be a list.")

    parsed: List[Dict[str, Any]] = []
    for index, entry in enumerate(decisions):
        if not isinstance(entry, dict):
            raise ReviewError(f"{register_path}: decision {index} is not a mapping.")

        absent = [f for f in REQUIRED_DECISION_FIELDS if not entry.get(f)]
        if absent:
            raise ReviewError(
                f"{register_path}: decision {index} "
                f"({entry.get('venture', 'unnamed')}) is missing: {', '.join(absent)}."
            )

        verdict = str(entry["decision"])
        if verdict not in VALID_DECISIONS:
            raise ReviewError(
                f"{register_path}: decision {index} has `decision: {verdict}`, "
                f"which is not one of {', '.join(VALID_DECISIONS)}."
            )

        record = dict(entry)
        record["_decided_on"] = _parse_date(
            entry["decided_on"], f"{register_path}: decision {index} `decided_on`"
        )

        if verdict == DECISION_CONTINUE:
            if not entry.get("review_by"):
                raise ReviewError(
                    f"{register_path}: decision {index} ({entry['venture']}) continues "
                    "funding past a fired stopping rule and must carry `review_by`."
                )
            record["_review_by"] = _parse_date(
                entry["review_by"], f"{register_path}: decision {index} `review_by`"
            )

        parsed.append(record)

    data["_decisions"] = parsed
    return data


def measure(repo_root: Path) -> Measurement:
    """Evaluate every venture's criteria and collect the ones that have fired."""
    ventures_dir = repo_root / "ventures"
    ledger_dir = repo_root / "portfolio" / "ledger"

    periods: List[Dict[str, Any]] = []
    if ledger_dir.exists():
        for ledger_file in sorted(ledger_dir.glob("*.yaml")):
            try:
                loaded = yaml.safe_load(ledger_file.read_text(encoding="utf-8")) or {}
            except yaml.YAMLError as exc:
                raise ReviewError(f"{ledger_file} is not parseable YAML: {exc}") from exc
            if isinstance(loaded, dict):
                periods.append(loaded)

    facts = build_ledger_facts(periods)

    measured = 0
    triggered: List[TriggeredCriterion] = []
    for manifest in sorted(ventures_dir.glob("*/VENTURE.yaml")) if ventures_dir.exists() else []:
        try:
            data = yaml.safe_load(manifest.read_text(encoding="utf-8"))
        except yaml.YAMLError as exc:
            raise ReviewError(f"{manifest} is not parseable YAML: {exc}") from exc
        if not isinstance(data, dict):
            continue

        measured += 1
        name = str(data.get("name") or manifest.parent.name)
        results = evaluate_venture(data, facts.get(name) or facts.get(manifest.parent.name))
        for result in results:
            if result.verdict == TRIGGERED:
                triggered.append(
                    TriggeredCriterion(
                        venture=name,
                        stage=str(data.get("stage", "unknown")),
                        description=normalise(result.description),
                        detail=result.detail,
                    )
                )

    return Measurement(ventures_measured=measured, triggered=triggered)


def audit(measurement: Measurement, register: Dict[str, Any], today: date) -> List[Finding]:
    """Compare what fired against what was decided, in both directions."""
    findings: List[Finding] = []
    decisions: List[Dict[str, Any]] = register["_decisions"]
    measurement.decisions_registered = len(decisions)

    if measurement.ventures_measured == 0:
        findings.append(
            Finding(
                "not-measurable",
                "no ventures/*/VENTURE.yaml were found. Zero triggered criteria here means "
                "the ventures were not read, not that no stopping rule fired.",
            )
        )
        return findings

    triggered_keys = {(t.venture, t.description): t for t in measurement.triggered}
    decided_keys = set()

    for index, entry in enumerate(decisions):
        key = (str(entry["venture"]), normalise(entry["criterion"]))
        decided_keys.add(key)
        label = f"{entry['venture']} decision {index}"

        if key not in triggered_keys:
            findings.append(
                Finding(
                    "decision-orphaned",
                    f"{label} covers a criterion that is not currently triggered: "
                    f"{normalise(entry['criterion'])[:90]!r}. Remove it. A decision left "
                    "behind pre-authorises the next trigger without anyone looking at it.",
                )
            )
            continue

        if entry["_decided_on"] > today:
            findings.append(
                Finding(
                    "decision-future-dated",
                    f"{label} is dated {entry['_decided_on'].isoformat()}, in the future.",
                )
            )

        if len(normalise(entry["reason"])) < MIN_REASON_CHARS:
            findings.append(
                Finding(
                    "reason-too-thin",
                    f"{label} states a reason of {len(normalise(entry['reason']))} characters. "
                    f"Say what makes this decision correct in at least {MIN_REASON_CHARS}.",
                )
            )

        verdict = str(entry["decision"])
        if verdict == DECISION_CONTINUE:
            review_by = entry["_review_by"]
            if review_by < today:
                findings.append(
                    Finding(
                        "decision-stale",
                        f"{label} continued funding past a fired stopping rule and was due "
                        f"for review on {review_by.isoformat()}. Re-argue it or wind the "
                        "venture down; an expired override is not a decision.",
                    )
                )
            elif (review_by - today).days > MAX_REVIEW_DAYS:
                findings.append(
                    Finding(
                        "review-horizon-too-far",
                        f"{label} is not reviewed again for {(review_by - today).days} days, "
                        f"beyond the {MAX_REVIEW_DAYS}-day cap. An override nobody revisits "
                        "is the rule being deleted slowly.",
                    )
                )
        elif verdict == DECISION_WIND_DOWN:
            stage = triggered_keys[key].stage
            if stage != WINDING_DOWN_STAGE:
                findings.append(
                    Finding(
                        "wind-down-not-carried-out",
                        f"{label} records `wind-down`, but ventures/{entry['venture']}/"
                        f"VENTURE.yaml still declares `stage: {stage}`. Set "
                        f"`stage: {WINDING_DOWN_STAGE}`; a decision that changes no "
                        "behaviour is the defect this control exists to catch.",
                    )
                )

    for key, item in sorted(triggered_keys.items()):
        if key not in decided_keys:
            findings.append(
                Finding(
                    "undecided",
                    f"{item.venture} tripped a declared stopping rule and no human has "
                    f"decided what to do: {item.description[:90]!r} ({item.detail}). "
                    f"Record a `continue` or `wind-down` in {REGISTER_PATH}.",
                )
            )

    continues = sum(
        1
        for e in decisions
        if str(e["decision"]) == DECISION_CONTINUE
        and (str(e["venture"]), normalise(e["criterion"])) in triggered_keys
    )
    if continues > MAX_CONTINUE_OVERRIDES:
        findings.append(
            Finding(
                "too-many-overrides",
                f"{continues} venture(s) are funded past a fired stopping rule, above the "
                f"cap of {MAX_CONTINUE_OVERRIDES}. The criteria are the portfolio's brake; "
                "overriding most of them is removing it.",
            )
        )

    return findings


def format_report(measurement: Measurement, findings: List[Finding]) -> str:
    lines = ["=== Stopping-rule decisions ==="]
    lines.append(f"Ventures measured:            {measurement.ventures_measured}")
    lines.append(f"Criteria triggered:           {len(measurement.triggered)}")
    lines.append(f"Decisions registered:         {measurement.decisions_registered}")

    if measurement.triggered:
        lines.append("")
        lines.append("Triggered:")
        for item in measurement.triggered:
            lines.append(f"  {item.venture} ({item.stage})")
            lines.append(f"    - {item.description}")
            lines.append(f"      measured: {item.detail}")

    lines.append("")
    if findings:
        lines.append(f"FAIL: {len(findings)} finding(s)")
        lines.extend(f.format_line() for f in findings)
    else:
        lines.append(
            "PASS: every triggered stopping rule carries a current human decision."
            if measurement.triggered
            else "PASS: no declared stopping rule has fired, so none is awaiting a decision."
        )
    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--report", action="store_true", help="measure and print, always exit 0")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--repo-root", default=None, help="repository root to audit")
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root).resolve() if args.repo_root else REPO_ROOT

    try:
        register = load_register(repo_root)
        measurement = measure(repo_root)
    except ReviewError as exc:
        print(f"ERROR {exc}", file=sys.stderr)
        return 0 if args.report else 1

    findings = audit(measurement, register, date.today())

    if args.json:
        payload = {
            "ok": not findings,
            # "not-measurable" exists so that reading no ventures is never
            # reported as measuring that no stopping rule fired.
            "status": (
                "not-measurable"
                if any(f.check == "not-measurable" for f in findings)
                else ("pass" if not findings else "fail")
            ),
            "measurement": asdict(measurement),
            "findings": [asdict(f) for f in findings],
        }
        print(json.dumps(payload, indent=2))
    else:
        print(format_report(measurement, findings))

    if args.report:
        return 0
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
