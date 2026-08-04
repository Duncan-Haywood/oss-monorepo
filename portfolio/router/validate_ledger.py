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
- Spend copied from what the allocator *granted* rather than observed from what
  was drawn. This is the same defect as the split one shape further on, and it
  is harder to see because the figures are distinct and therefore look metered.
  It closes a loop: the router allocates, the allocation is written back as
  spend, and the next allocation is computed from it. The allocator ends up
  reading its own output as evidence about the world, and a venture that drew
  nothing decays exactly as if it had spent its whole grant.
- A month that is never written at all is the same defect one level up. Every
  reader of this directory sums the months it finds, so an absent month is not
  an absent record, it is a lower number. `check_continuity` covers holes inside
  the recorded span and `check_freshness` covers the tail.

The uniform-split one is why the ledger README's rule — "Record outcomes even when they
are nothing", the "spent $80, nothing shipped" row — cannot be written today. It
needs a per-venture cost signal to sit against the outcome, and an even split is
not one.

The unwritten-month case is worth stating plainly, because it disables the
portfolio's only working brake. `portfolio/router/kill_criteria.py` evaluates a
venture's stopping rules against `cumulative_agent_spend_usd`, which is this
directory summed. Stop recording months and that total freezes, so a threshold
the owner set is never reached however much is actually spent — the rule does
not fire, and it does not report that it could not. Until 2026-08-03 staleness
was a warning here, and `scripts/test-ci.sh` runs this validator without
`--strict`, so nothing acted on it; a skipped interior month was not detected in
any form.

This validator reports; it does not correct. `portfolio/router/README.md` is
explicit that changing a venture's recorded economics reallocates budget and is
the portfolio owner's call, and the ledger README forbids rewriting history at
all. Structural defects that would corrupt the join are errors, as is a month
missing from the record, because the remedy is to write the month rather than to
rewrite a closed one. Provenance and completeness problems *within* an
already-closed month stay warnings, because those can only be annotated, not
reconstructed.

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
from typing import Any, Dict, List, Optional, Set, Tuple

import yaml

PERIOD_PATTERN = re.compile(r"^(\d{4})-(\d{2})$")
MONEY_PATTERN = re.compile(r"\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)")
LINK_TEXT_PATTERN = re.compile(r"\[([^\]]+)\]")

# A per-venture cost is a continuous measurement; exact ties across several
# ventures in one month mean a single total was divided after the fact. Two
# ventures can plausibly land on the same figure, so only flag three or more.
UNIFORM_SPEND_MIN_ENTRIES = 3

# How far the newest recorded period may fall behind the current month before
# the ledger is reporting on a portfolio that has moved on. One full month of
# grace: a month can only be closed once it has ended.
STALE_LEDGER_MONTHS = 2

# How many entries in one month must record, to the cent, the figure the
# allocator granted that same venture before the month is treated as a copy of
# the plan rather than an observation of the spend. A venture that draws its
# whole grant is ordinary; three of them landing on the exact cent is not.
ALLOCATION_MIRROR_MIN_ENTRIES = 3


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


def _cents(value: Any) -> Optional[float]:
    """A money figure rounded to the cent, or None if it is not a number."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return round(float(value), 2)


def parse_allocation_report(text: str) -> Dict[str, Set[float]]:
    """Venture → the budgets `portfolio/ALLOCATION_REPORT.md` records granting it.

    The report is generated by `router.py`, so its columns can move. The header
    row is read to find the allocated-budget column rather than counting cells
    from the left; if that column is not there, this returns nothing and
    `load_allocation_figures` turns that into an error. A parser that quietly
    matches nothing would leave the check passing forever while enforcing it.
    """
    figures: Dict[str, Set[float]] = {}
    name_column: Optional[int] = None
    amount_column: Optional[int] = None

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("|"):
            continue
        cells = [cell.strip() for cell in stripped.strip("|").split("|")]

        if amount_column is None:
            headers = [cell.lower() for cell in cells]
            for index, header in enumerate(headers):
                if "allocated" in header:
                    amount_column = index
                if header == "venture":
                    name_column = index
            continue

        if name_column is None or max(name_column, amount_column) >= len(cells):
            continue

        raw_name = cells[name_column].strip("*").strip()
        link = LINK_TEXT_PATTERN.search(raw_name)
        name = (link.group(1) if link else raw_name).strip("*").strip()
        money = MONEY_PATTERN.search(cells[amount_column])
        if not name or not money:
            continue
        try:
            amount = round(float(money.group(1).replace(",", "")), 2)
        except ValueError:
            continue
        figures.setdefault(name, set()).add(amount)

    return figures


def parse_allocation_queue(data: Any) -> Dict[str, Set[float]]:
    """Venture → the budgets a persisted router queue records granting it."""
    figures: Dict[str, Set[float]] = {}
    if not isinstance(data, dict):
        return figures
    rows = data.get("work_queue") or data.get("queue") or []
    if not isinstance(rows, list):
        return figures
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = row.get("venture")
        for key in ("allocated_usd", "allocated_budget_usd", "allocated_spend"):
            amount = _cents(row.get(key))
            if name and amount is not None:
                figures.setdefault(name, set()).add(amount)
    return figures


def load_allocation_figures(
    repo_root: Path,
) -> Tuple[Dict[str, Set[float]], List[Finding]]:
    """Every budget the allocator is on record as granting, by venture.

    Both sources are generated artefacts that a person or an agent can read a
    number out of and paste into the ledger, which is exactly the provenance
    this exists to detect. Absence of a source is silent — a temporary tree has
    neither — but a source that exists and yields nothing is an error, because
    that is how this check would stop working without anybody noticing.
    """
    figures: Dict[str, Set[float]] = {}
    findings: List[Finding] = []

    sources = (
        ("portfolio/ALLOCATION_REPORT.md", repo_root / "portfolio" / "ALLOCATION_REPORT.md"),
        (
            "portfolio/router/allocation_queue.json",
            repo_root / "portfolio" / "router" / "allocation_queue.json",
        ),
    )

    for label, path in sources:
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
            parsed = (
                parse_allocation_report(text)
                if path.suffix == ".md"
                else parse_allocation_queue(json.loads(text))
            )
        except (OSError, ValueError) as exc:
            parsed = {}
            findings.append(
                Finding(
                    period="(allocation)",
                    severity="error",
                    code="unreadable-allocation-source",
                    message=f"{label} could not be read: {exc}",
                    remedy=(
                        "Repair or regenerate it. It is one of the two sources the "
                        "spend-mirrors-allocation check compares the ledger against, "
                        "and an unreadable one silently removes that comparison."
                    ),
                )
            )
            continue

        if not parsed:
            findings.append(
                Finding(
                    period="(allocation)",
                    severity="error",
                    code="unreadable-allocation-source",
                    message=f"{label} exists but no per-venture allocation could be read from it",
                    remedy=(
                        "Update the parser in validate_ledger.py to the current format, "
                        "or regenerate the artefact. A matcher that finds nothing reports "
                        "no findings forever, which reads exactly like a clean ledger."
                    ),
                )
            )
            continue

        for name, amounts in parsed.items():
            figures.setdefault(name, set()).update(amounts)

    return figures, findings


def check_spend_mirrors_allocation(
    entries: List[Any], period: str, allocations: Dict[str, Set[float]]
) -> List[Finding]:
    """Flags a month whose spend is the allocator's own output written back.

    Only exact cent-for-cent agreement counts. Figures nudged off the grant by a
    few cents read as measured and are not caught here; the honest limit of this
    check is that it detects copying, not fabrication in general.
    """
    if not allocations:
        return []

    mirrored: List[str] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        name = entry.get("venture")
        spend = _cents(entry.get("agent_spend_usd"))
        # A zero spend matching a zero grant carries no signal, and flagging it
        # would punish the honest "this venture drew nothing" row.
        if not name or not spend:
            continue
        if spend in allocations.get(name, set()):
            mirrored.append(f"{name} (${spend:.2f})")

    if len(mirrored) < ALLOCATION_MIRROR_MIN_ENTRIES:
        return []

    return [
        Finding(
            period=period,
            severity="warn",
            code="spend-mirrors-allocation",
            message=(
                f"{len(mirrored)} entries record exactly the budget the allocator granted "
                f"them: {', '.join(sorted(mirrored))} — the plan written back as the "
                "observation"
            ),
            remedy=(
                "Record what was drawn, not what was granted. router.py sums this ledger "
                "into cumulative spend and decays each venture's next explore grant "
                "against it, so an allocation copied back in makes the allocator read its "
                "own output as evidence, and a venture that drew nothing decays as if it "
                "had spent the lot. Closed months must not be rewritten — meter the spend "
                "for the months still open and say in `outcomes` where the figure came "
                "from."
            ),
        )
    ]


def months_between(earlier: str, later: str) -> Optional[int]:
    """Whole months from one `YYYY-MM` period to another, or None if unparseable."""
    start, end = PERIOD_PATTERN.match(earlier), PERIOD_PATTERN.match(later)
    if not start or not end:
        return None
    return (int(end.group(1)) - int(start.group(1))) * 12 + (
        int(end.group(2)) - int(start.group(2))
    )


def shift_month(period: str, offset: int) -> Optional[str]:
    """The `YYYY-MM` period `offset` whole months after `period`."""
    match = PERIOD_PATTERN.match(period)
    if not match:
        return None
    total = int(match.group(1)) * 12 + (int(match.group(2)) - 1) + offset
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


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


def validate_period(
    data: Any,
    period: str,
    ventures: set,
    allocations: Optional[Dict[str, Set[float]]] = None,
) -> List[Finding]:
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
    findings.extend(check_spend_mirrors_allocation(entries, period, allocations or {}))
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


def check_continuity(periods: List[str]) -> List[Finding]:
    """Every month between the oldest and newest recorded period must be present.

    `check_freshness` reads only `max(periods)`, so a hole in the middle of the
    record is invisible to it: a ledger holding 2026-05 and 2026-11 is one month
    behind in December and reports nothing about the five months missing between
    them.

    A hole is not cosmetic. `build_ledger_facts` in
    `portfolio/router/kill_criteria.py` sums `agent_spend_usd` across whatever
    months happen to be on disk, so an absent month lowers
    `cumulative_agent_spend_usd` — the metric behind the only stopping rule the
    portfolio can currently evaluate. The error runs in the flattering
    direction, which is this validator's recurring theme: a venture that has
    drawn past its threshold reads as though it has not, and the brake that
    exists to stop funding it does not fire.

    The span is bounded by the recorded months themselves, so months from before
    the ledger existed fall outside it by construction and are never reported.
    Backfilling those is neither possible nor wanted — the ledger README forbids
    rewriting history, and the figures were never captured.
    """
    recorded = sorted(p for p in periods if PERIOD_PATTERN.match(p))
    if len(recorded) < 2:
        return []

    oldest, newest = recorded[0], recorded[-1]
    span = months_between(oldest, newest)
    if span is None:
        return []

    present = set(recorded)
    findings: List[Finding] = []
    for offset in range(1, span):
        month = shift_month(oldest, offset)
        if month is None or month in present:
            continue
        findings.append(
            Finding(
                period=month,
                severity="error",
                code="ledger-gap",
                message=(
                    f"no {month}.yaml, but the ledger records both {oldest} and {newest}"
                ),
                remedy=(
                    "Record the month, with zero spend if that is what happened. Every "
                    "reader of this directory sums the months it finds, so a skipped "
                    "month silently lowers cumulative spend rather than announcing "
                    "itself — and cumulative spend is what the venture stopping rules "
                    "in portfolio/router/kill_criteria.py measure against."
                ),
            )
        )
    return findings


def check_freshness(periods: List[str], today: Optional[date] = None) -> List[Finding]:
    """The newest recorded month must not fall behind the calendar.

    This is an error rather than a warning, and deliberately so. An unrecorded
    month is the failure that disables the portfolio's only working brake:
    `cumulative_agent_spend_usd` stops moving, so a spend threshold that would
    otherwise fire never does, and budget keeps flowing to a venture that has
    already passed the point its owner said it should stop. A finding that
    cannot fail a build does not prevent that — `scripts/test-ci.sh` runs this
    validator without `--strict`, so as a warning this was reported to nobody.

    It is the one check here whose result depends on the date, which means the
    gate turns red on a schedule if the ledger is not kept. That is the whole
    point: the only way to clear it is to record the month. Widening
    `STALE_LEDGER_MONTHS` clears it too, and doing so silently is precisely the
    erosion this control exists to make visible.
    """
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
            severity="error",
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
    allocations, findings = load_allocation_figures(root)

    if not ledger_dir.is_dir():
        return findings + [
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

        findings.extend(validate_period(data, period, ventures, allocations))

    findings.extend(check_continuity(periods))
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
