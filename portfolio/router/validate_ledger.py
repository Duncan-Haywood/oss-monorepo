#!/usr/bin/env python3
"""
Portfolio ledger validator.

`portfolio/ledger/YYYY-MM.yaml` is the only record of what the portfolio spent,
and it is not inert data: `portfolio/router/router.py:189` sums
`agent_spend_usd` across every month into `load_cumulative_spend()`, and
`economics_score()` decays a venture's explore grant against that total. Spend
recorded here moves next month's budget. Nothing validated it.

The failure mode is quiet and it runs in the flattering direction:

- A venture name that matches no `ventures/*/VENTURE.yaml` silently detaches
  spend from the venture that drew it. The router does not join, it just carries
  a key nothing reads, and the venture keeps its full explore grant.
- A missing `agent_spend_usd` is read as `0.0`, which is the maximum explore
  credit. Omitting the cost of a venture is worth more than recording it.
- Spend that is a total divided after the fact rather than a per-venture
  observation makes the decay uniform, so the control cannot separate a venture
  that absorbed real budget and reported nothing from one that is genuinely new.
  `2026-07.yaml` carries an identical 18.18 on all seven entries — $127.26 split
  seven ways. Every one of them decays by the same 36%, which is the same as no
  signal at all.

That last one is why the ledger README's rule — "Record outcomes even when they
are nothing", the "spent $80, nothing shipped" row — cannot be written today. It
needs a per-venture cost signal to sit against the outcome, and an even split is
not one.

This validator reports; it does not correct. `portfolio/router/README.md` is
explicit that changing a venture's recorded economics reallocates budget and is
the portfolio owner's call, and the ledger README forbids rewriting history at
all. Structural defects that would corrupt the join are errors. Provenance and
completeness problems in already-closed months are warnings, because they can
only be annotated, not reconstructed.

Run `python3 portfolio/router/validate_ledger.py` to report, or with `--strict`
to exit non-zero on warnings as well as errors.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass, asdict
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

PERIOD_PATTERN = re.compile(r"^(\d{4})-(\d{2})$")

# A per-venture cost is a continuous measurement; exact ties across several
# ventures in one month mean a single total was divided after the fact. Two
# ventures can plausibly land on the same figure, so only flag three or more.
UNIFORM_SPEND_MIN_ENTRIES = 3

# How far the newest recorded period may fall behind the current month before
# the ledger is reporting on a portfolio that has moved on. One full month of
# grace: a month can only be closed once it has ended.
STALE_LEDGER_MONTHS = 2


@dataclass
class Finding:
    period: str
    severity: str  # "error" | "warn"
    code: str
    message: str
    remedy: str

    def format_line(self) -> str:
        marker = "ERROR" if self.severity == "error" else " WARN"
        return f"[{marker}] {self.period}: {self.message}\n         → {self.remedy}"


def find_repo_root(start: Optional[Path] = None) -> Path:
    current = (start or Path(__file__).resolve()).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / "ventures").is_dir() and (candidate / "portfolio").is_dir():
            return candidate
    raise RuntimeError("Could not locate repository root from " + str(current))


def known_ventures(repo_root: Path) -> set:
    ventures_dir = repo_root / "ventures"
    if not ventures_dir.is_dir():
        return set()
    return {p.parent.name for p in ventures_dir.glob("*/VENTURE.yaml")}


def months_between(earlier: str, later: str) -> Optional[int]:
    """Whole months from one `YYYY-MM` period to another, or None if unparseable."""
    start, end = PERIOD_PATTERN.match(earlier), PERIOD_PATTERN.match(later)
    if not start or not end:
        return None
    return (int(end.group(1)) - int(start.group(1))) * 12 + (
        int(end.group(2)) - int(start.group(2))
    )


def validate_entry(
    entry: Any, period: str, index: int, ventures: set
) -> List[Finding]:
    findings: List[Finding] = []
    label = f"entry {index + 1}"

    if not isinstance(entry, dict):
        return [
            Finding(
                period=period,
                severity="error",
                code="malformed-entry",
                message=f"{label} is not a mapping",
                remedy="Each ledger entry must be a mapping with a `venture` key.",
            )
        ]

    name = entry.get("venture")
    if not name:
        findings.append(
            Finding(
                period=period,
                severity="error",
                code="missing-venture-name",
                message=f"{label} has no `venture`",
                remedy=(
                    "Name the venture — the router keys cumulative spend on it, so an "
                    "unnamed row is spend charged to nobody."
                ),
            )
        )
    elif ventures and name not in ventures:
        findings.append(
            Finding(
                period=period,
                severity="error",
                code="unknown-venture",
                message=f"'{name}' matches no ventures/*/VENTURE.yaml",
                remedy=(
                    "Correct the name to match the venture directory. The router joins "
                    "on it, so a typo detaches the spend and restores a full explore "
                    "grant the venture already consumed."
                ),
            )
        )

    label = f"'{name}'" if name else label

    if "agent_spend_usd" not in entry:
        findings.append(
            Finding(
                period=period,
                severity="error",
                code="missing-spend",
                message=f"{label} records no `agent_spend_usd`",
                remedy=(
                    "Record the spend, including zero. The router reads a missing value "
                    "as 0.0, which is the maximum explore credit — omitting a cost pays "
                    "better than reporting it."
                ),
            )
        )
    else:
        spend = entry.get("agent_spend_usd")
        if not isinstance(spend, (int, float)) or isinstance(spend, bool):
            findings.append(
                Finding(
                    period=period,
                    severity="error",
                    code="non-numeric-spend",
                    message=f"{label} has a non-numeric `agent_spend_usd`: {spend!r}",
                    remedy="Record `agent_spend_usd` as a number of US dollars.",
                )
            )
        elif spend < 0:
            findings.append(
                Finding(
                    period=period,
                    severity="error",
                    code="negative-spend",
                    message=f"{label} has a negative `agent_spend_usd`: {spend}",
                    remedy=(
                        "Spend cannot be negative. A refund or correction belongs in a "
                        "later period with an outcome explaining it, not as a negative "
                        "row that erases recorded history."
                    ),
                )
            )

    if "mrr_end" not in entry:
        findings.append(
            Finding(
                period=period,
                severity="warn",
                code="missing-mrr-end",
                message=f"{label} records no `mrr_end`",
                remedy=(
                    "Record it, including zero. `validate_ventures.py` reads the newest "
                    "`mrr_end` to catch a contract still claiming `mrr: null`, and an "
                    "absent value leaves that drift check with nothing to compare."
                ),
            )
        )

    outcomes = entry.get("outcomes")
    if not outcomes:
        findings.append(
            Finding(
                period=period,
                severity="warn",
                code="empty-outcomes",
                message=f"{label} records no outcomes",
                remedy=(
                    "Write the row even when the answer is nothing — the ledger README "
                    "calls 'spent $80, nothing shipped' the most valuable row in the "
                    "file. An empty list is an unanswered question, not a nil result."
                ),
            )
        )

    return findings


def validate_period(data: Any, period: str, ventures: set) -> List[Finding]:
    findings: List[Finding] = []

    if not isinstance(data, dict):
        return [
            Finding(
                period=period,
                severity="error",
                code="malformed-ledger",
                message="ledger file is not a mapping",
                remedy="A ledger month must be a mapping with `period` and `entries`.",
            )
        ]

    declared = data.get("period")
    if declared is not None and str(declared) != period:
        findings.append(
            Finding(
                period=period,
                severity="error",
                code="period-filename-mismatch",
                message=f"declares period '{declared}' but is filed as '{period}'",
                remedy=(
                    "Align them. The router reads every file in the directory, so a "
                    "mislabelled month is counted under a period nobody is reviewing."
                ),
            )
        )

    entries = data.get("entries")
    if not entries:
        findings.append(
            Finding(
                period=period,
                severity="warn",
                code="empty-period",
                message="records no entries",
                remedy=(
                    "A month with no entries claims the portfolio spent nothing. If that "
                    "is true, say so in an entry; if it is not, the month is unrecorded."
                ),
            )
        )
        return findings

    if not isinstance(entries, list):
        return findings + [
            Finding(
                period=period,
                severity="error",
                code="malformed-entries",
                message="`entries` is not a list",
                remedy="`entries` must be a list of per-venture mappings.",
            )
        ]

    for index, entry in enumerate(entries):
        findings.extend(validate_entry(entry, period, index, ventures))

    findings.extend(check_uniform_spend(entries, period))
    findings.extend(check_duplicate_ventures(entries, period))
    return findings


def check_uniform_spend(entries: List[Any], period: str) -> List[Finding]:
    """Flags a month whose spend is one total divided, rather than measured."""
    spends = [
        entry.get("agent_spend_usd")
        for entry in entries
        if isinstance(entry, dict)
        and isinstance(entry.get("agent_spend_usd"), (int, float))
        and not isinstance(entry.get("agent_spend_usd"), bool)
        and entry.get("agent_spend_usd")
    ]
    if not spends:
        return []

    value, count = Counter(spends).most_common(1)[0]
    if count < UNIFORM_SPEND_MIN_ENTRIES:
        return []

    return [
        Finding(
            period=period,
            severity="warn",
            code="uniform-spend",
            message=(
                f"{count} entries record an identical agent_spend_usd of {value} — "
                "a total divided after the fact, not a per-venture measurement"
            ),
            remedy=(
                "Meter spend per venture. router.py decays each venture's explore grant "
                "against its own cumulative spend, so an even split decays all of them "
                "identically and the control cannot tell a venture that absorbed budget "
                "and reported nothing from one that is genuinely new. Closed months "
                "cannot be reconstructed and must not be rewritten — record the basis "
                "for future months instead."
            ),
        )
    ]


def check_duplicate_ventures(entries: List[Any], period: str) -> List[Finding]:
    names = [
        entry.get("venture")
        for entry in entries
        if isinstance(entry, dict) and entry.get("venture")
    ]
    findings: List[Finding] = []
    for name, count in sorted(Counter(names).items()):
        if count > 1:
            findings.append(
                Finding(
                    period=period,
                    severity="error",
                    code="duplicate-venture",
                    message=f"'{name}' appears {count} times in one period",
                    remedy=(
                        "Merge the rows. The router sums every entry, so a venture split "
                        "across duplicate rows reads as one that drew more budget than it "
                        "did, and its outcomes are recorded against only one of them."
                    ),
                )
            )
    return findings


def check_freshness(periods: List[str], today: Optional[date] = None) -> List[Finding]:
    if not periods:
        return []

    current = (today or date.today()).strftime("%Y-%m")
    newest = max(periods)
    behind = months_between(newest, current)
    if behind is None or behind < STALE_LEDGER_MONTHS:
        return []

    return [
        Finding(
            period=newest,
            severity="warn",
            code="stale-ledger",
            message=f"newest recorded period is {behind} months behind {current}",
            remedy=(
                "Close the intervening months. The router keeps allocating from the "
                "spend it can see, so an unrecorded month is budget drawn against a "
                "cumulative total that stopped moving."
            ),
        )
    ]


def validate_all(repo_root: Optional[Path] = None, today: Optional[date] = None) -> List[Finding]:
    root = repo_root or find_repo_root()
    ledger_dir = root / "portfolio" / "ledger"
    ventures = known_ventures(root)

    findings: List[Finding] = []
    if not ledger_dir.is_dir():
        return [
            Finding(
                period="(none)",
                severity="error",
                code="missing-ledger",
                message="portfolio/ledger does not exist",
                remedy="The router reads spend from here; without it every venture reads as unfunded.",
            )
        ]

    periods: List[str] = []
    for ledger_file in sorted(ledger_dir.glob("*.yaml")):
        period = ledger_file.stem
        if not PERIOD_PATTERN.match(period):
            findings.append(
                Finding(
                    period=period,
                    severity="error",
                    code="malformed-filename",
                    message=f"'{ledger_file.name}' is not a YYYY-MM.yaml month",
                    remedy=(
                        "Name ledger months `YYYY-MM.yaml`. The router globs this "
                        "directory, so an off-pattern file is still summed into spend "
                        "while being invisible to any month-by-month review."
                    ),
                )
            )
            continue

        periods.append(period)
        try:
            with open(ledger_file, "r", encoding="utf-8") as handle:
                data = yaml.safe_load(handle)
        except yaml.YAMLError as exc:
            findings.append(
                Finding(
                    period=period,
                    severity="error",
                    code="unparseable-ledger",
                    message=f"could not be parsed: {exc}",
                    remedy=(
                        "Fix the YAML. router.py catches the parse error and continues "
                        "with the months it could read, so a broken file silently "
                        "removes a month of spend rather than failing."
                    ),
                )
            )
            continue

        findings.extend(validate_period(data, period, ventures))

    findings.extend(check_freshness(periods, today))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate the portfolio spend ledger the router allocates from."
    )
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
        print("=== Portfolio Ledger Validation ===")
        if not findings:
            print("Ledger months are well-formed and joinable to venture contracts.")
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
