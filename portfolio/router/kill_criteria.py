#!/usr/bin/env python3
"""Evaluation of the `kill_criteria` declared in `ventures/*/VENTURE.yaml`.

Until this module existed, `portfolio/router/allocate.py` read `kill_criteria`
into a local named `kill_rules` and never looked at it again. The two rules that
did run were hardcoded — `stage == "winding-down"`, and a zero MRR in the
`revenue`/`scaling` stages — and every venture in the portfolio is `prototype`,
so neither could fire. `killed_count` was therefore zero by construction, and
the sixteen declared criteria were prose that nothing read.

The important design decision here is the third verdict. A criterion that cannot
be measured must not report the same thing as a criterion that was measured and
did not fire. Silently treating "no data" as "keep funding it" is what made the
old behaviour look reasonable: a venture with no stopping rule and a venture
comfortably inside its stopping rule both came back `active`. So evaluation
returns one of:

    triggered     the condition held against recorded data
    not-triggered the condition was measured and did not hold
    unevaluable   there is no basis to measure it at all

`unevaluable` is the state that costs money, because a venture whose criteria
are all unevaluable is a venture drawing budget with no rule that can ever stop
it. `scripts/ci/kill_criteria_ratchet.py` counts those ventures and refuses to
let the count grow.

Metrics come only from `portfolio/ledger/*.yaml`, which is recorded history, and
the vocabulary is fixed in this file rather than in YAML. A venture cannot
invent a metric that happens to be flattering; an unrecognised name is
`unevaluable`, not a pass.

Criterion forms accepted in `VENTURE.yaml`:

    kill_criteria:
      - Fewer than 50 active learners after 60 days.        # prose, unevaluable

      - description: Spend passed the cap with no revenue.  # single condition
        metric: cumulative_agent_spend_usd
        comparator: ">="
        threshold: 150

      - description: Spend passed the cap with no revenue.  # all must hold
        when:
          - {metric: cumulative_agent_spend_usd, comparator: ">=", threshold: 150}
          - {metric: cumulative_revenue_usd, comparator: "==", threshold: 0}

Prose is deliberately still valid. Rejecting it would have deleted the portfolio's
stated intent in exchange for a green number, and the intent is the part worth
keeping — it is what a structured criterion should eventually be derived from.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

TRIGGERED = "triggered"
NOT_TRIGGERED = "not-triggered"
UNEVALUABLE = "unevaluable"

# Why a criterion could not be measured. These are distinct because they need
# different repairs: `prose-only` needs the criterion expressed as a metric,
# `no-ledger-history` needs the venture's spend recorded, and `unknown-metric`
# is a typo or an invented name.
REASON_PROSE_ONLY = "prose-only"
REASON_UNKNOWN_METRIC = "unknown-metric"
REASON_MALFORMED = "malformed"
REASON_NO_LEDGER_HISTORY = "no-ledger-history"
REASON_METRIC_UNRECORDED = "metric-unrecorded"


@dataclass
class LedgerFacts:
    """What `portfolio/ledger/*.yaml` records about one venture.

    `has_history` is false when the venture appears in no ledger month at all.
    That is different from a venture recorded as having spent nothing, and the
    difference decides whether its criteria are measurable.
    """

    venture: str
    has_history: bool = False
    months_recorded: int = 0
    cumulative_agent_spend_usd: float = 0.0
    cumulative_revenue_usd: float = 0.0
    latest_mrr_usd: Optional[float] = None
    consecutive_months_zero_mrr: int = 0
    periods: List[str] = field(default_factory=list)


# The whole measurable vocabulary. Each entry maps a metric name to the reader
# that pulls it off LedgerFacts. A reader returning None means "the ledger does
# not record this yet", which is `metric-unrecorded` rather than a pass.
METRIC_READERS: Dict[str, Callable[[LedgerFacts], Optional[float]]] = {
    "cumulative_agent_spend_usd": lambda f: f.cumulative_agent_spend_usd,
    "cumulative_revenue_usd": lambda f: f.cumulative_revenue_usd,
    "months_recorded": lambda f: float(f.months_recorded),
    "latest_mrr_usd": lambda f: f.latest_mrr_usd,
    "consecutive_months_zero_mrr": lambda f: float(f.consecutive_months_zero_mrr),
}

COMPARATORS: Dict[str, Callable[[float, float], bool]] = {
    ">=": lambda a, b: a >= b,
    ">": lambda a, b: a > b,
    "<=": lambda a, b: a <= b,
    "<": lambda a, b: a < b,
    "==": lambda a, b: a == b,
}


@dataclass
class CriterionResult:
    """One criterion's verdict, carrying enough to explain itself in a report."""

    description: str
    verdict: str
    reason: str = ""
    detail: str = ""

    @property
    def evaluable(self) -> bool:
        return self.verdict != UNEVALUABLE


def build_ledger_facts(ledger_periods: List[Dict[str, Any]]) -> Dict[str, LedgerFacts]:
    """Fold every ledger month into per-venture facts.

    `ledger_periods` is the parsed contents of `portfolio/ledger/*.yaml`. Months
    are ordered by their `period` field, which is `YYYY-MM` and so sorts
    correctly as a string; `consecutive_months_zero_mrr` counts backwards from
    the newest month and stops at the first month that is not a recorded zero,
    so an unrecorded `mrr_end` breaks the run rather than extending it.
    """
    ordered = sorted(
        [p for p in ledger_periods if isinstance(p, dict)],
        key=lambda p: str(p.get("period", "")),
    )

    facts: Dict[str, LedgerFacts] = {}
    per_venture_months: Dict[str, List[Optional[float]]] = {}

    for period in ordered:
        period_name = str(period.get("period", ""))
        for entry in period.get("entries") or []:
            if not isinstance(entry, dict):
                continue
            name = entry.get("venture")
            if not name:
                continue

            f = facts.setdefault(name, LedgerFacts(venture=name))
            f.has_history = True
            f.months_recorded += 1
            f.periods.append(period_name)

            try:
                f.cumulative_agent_spend_usd = round(
                    f.cumulative_agent_spend_usd + float(entry.get("agent_spend_usd") or 0.0), 2
                )
            except (TypeError, ValueError):
                pass

            mrr_raw = entry.get("mrr_end")
            mrr: Optional[float]
            try:
                mrr = None if mrr_raw is None else float(mrr_raw)
            except (TypeError, ValueError):
                mrr = None

            if mrr is not None:
                f.cumulative_revenue_usd = round(f.cumulative_revenue_usd + mrr, 2)
                f.latest_mrr_usd = mrr

            per_venture_months.setdefault(name, []).append(mrr)

    for name, months in per_venture_months.items():
        run = 0
        for mrr in reversed(months):
            if mrr == 0:
                run += 1
            else:
                break
        facts[name].consecutive_months_zero_mrr = run

    return facts


def _normalise_conditions(criterion: Any) -> Optional[List[Dict[str, Any]]]:
    """Return the criterion's conditions, or None if it declares none.

    None is the prose case. An empty list is a malformed `when:` — a criterion
    that claims to be structured but states nothing, which must not read as a
    satisfied rule.
    """
    if isinstance(criterion, str):
        return None
    if not isinstance(criterion, dict):
        return None

    when = criterion.get("when")
    if isinstance(when, list):
        return [c for c in when if isinstance(c, dict)] if when else []

    if "metric" in criterion:
        return [criterion]

    return None


def _describe(criterion: Any) -> str:
    if isinstance(criterion, str):
        return criterion
    if isinstance(criterion, dict):
        return str(criterion.get("description") or criterion.get("metric") or "(undescribed)")
    return str(criterion)


def evaluate_criterion(criterion: Any, facts: Optional[LedgerFacts]) -> CriterionResult:
    """Evaluate one declared criterion against recorded ledger facts.

    Every condition must hold for the criterion to trigger. A condition that
    cannot be measured makes the whole criterion unevaluable rather than false:
    "two of three conditions held and the third is unknown" is not a rule that
    declined to fire.
    """
    description = _describe(criterion)
    conditions = _normalise_conditions(criterion)

    if conditions is None:
        return CriterionResult(
            description=description,
            verdict=UNEVALUABLE,
            reason=REASON_PROSE_ONLY,
            detail="stated as prose, with no metric the allocator can read",
        )

    if not conditions:
        return CriterionResult(
            description=description,
            verdict=UNEVALUABLE,
            reason=REASON_MALFORMED,
            detail="declares `when:` but lists no conditions",
        )

    if facts is None or not facts.has_history:
        return CriterionResult(
            description=description,
            verdict=UNEVALUABLE,
            reason=REASON_NO_LEDGER_HISTORY,
            detail="the venture appears in no ledger month, so nothing can be measured against it",
        )

    details: List[str] = []
    for condition in conditions:
        metric = condition.get("metric")
        comparator = condition.get("comparator")
        threshold = condition.get("threshold")

        reader = METRIC_READERS.get(str(metric))
        if reader is None:
            return CriterionResult(
                description=description,
                verdict=UNEVALUABLE,
                reason=REASON_UNKNOWN_METRIC,
                detail=(
                    f"metric {metric!r} is not one of "
                    f"{', '.join(sorted(METRIC_READERS))}"
                ),
            )

        compare = COMPARATORS.get(str(comparator))
        if compare is None:
            return CriterionResult(
                description=description,
                verdict=UNEVALUABLE,
                reason=REASON_MALFORMED,
                detail=(
                    f"comparator {comparator!r} is not one of "
                    f"{', '.join(sorted(COMPARATORS))}"
                ),
            )

        try:
            threshold_value = float(threshold)
        except (TypeError, ValueError):
            return CriterionResult(
                description=description,
                verdict=UNEVALUABLE,
                reason=REASON_MALFORMED,
                detail=f"threshold {threshold!r} is not a number",
            )

        observed = reader(facts)
        if observed is None:
            return CriterionResult(
                description=description,
                verdict=UNEVALUABLE,
                reason=REASON_METRIC_UNRECORDED,
                detail=f"the ledger records no value for {metric}",
            )

        details.append(f"{metric}={observed:g} {comparator} {threshold_value:g}")
        if not compare(observed, threshold_value):
            return CriterionResult(
                description=description,
                verdict=NOT_TRIGGERED,
                detail="; ".join(details),
            )

    return CriterionResult(
        description=description,
        verdict=TRIGGERED,
        detail="; ".join(details),
    )


def evaluate_venture(
    venture: Dict[str, Any], facts: Optional[LedgerFacts] = None
) -> List[CriterionResult]:
    """Evaluate every criterion a venture declares, in declaration order."""
    return [evaluate_criterion(c, facts) for c in (venture.get("kill_criteria") or [])]


def has_stopping_rule(results: List[CriterionResult]) -> bool:
    """True when at least one declared criterion could actually be measured.

    A venture without one has no rule that can ever stop its funding, however
    many criteria it declares. `stage: winding-down` is deliberately not counted
    here — it is a human deciding to stop, which is the outcome a stopping rule
    is supposed to prompt, not a measurement that prompts it.
    """
    return any(r.evaluable for r in results)
