#!/usr/bin/env python3
"""
Kill-criteria evaluator.

`portfolio/router/validate_ventures.py` makes a protected venture declare
`kill_criteria`, on the stated grounds that "without kill criteria there is no
condition under which it stops". `portfolio/router/allocate.py` then read those
criteria into a local named `kill_rules` and never referenced the variable
again. Every one of the fifteen criteria across the eleven ventures was prose
that nothing evaluated, guarded by a test named `test_kill_criteria_evaluation`
that only exercised the `winding-down` stage flag. The portfolio's entire
automated stop-loss was a field a human sets by hand after already deciding to
stop.

This module makes a criterion something that either evaluates or is registered
as unevaluable, and never quietly does neither.

Three outcomes, never two
-------------------------

A criterion resolves to TRIGGERED, NOT_TRIGGERED, or NOT_MEASURABLE. The third
is not a pass. `scripts/ci/release_lag.py` reports a shallow CI clone as its own
state for the same reason: when the data needed to answer a question is absent,
"the condition did not fire" is trivially true and completely uninformative.
Conditions combine under Kleene AND — one FALSE means NOT_TRIGGERED, but any
UNKNOWN among the rest means NOT_MEASURABLE, so a missing measurement can never
be silently read as evidence that a venture is healthy.

Metrics resolve to a value or to None, and None means unknown. In particular a
venture with no ledger rows at all has unknown spend, not zero spend:
`portfolio/ledger/README.md` records that reading an absent figure as `0.0`
earns the *maximum* explore credit, which is the exact bug that makes omitting
a cost pay better than recording it. This module does not repeat it.

Criterion forms
---------------

A plain string is accepted and is always NOT_MEASURABLE — the eleven ventures
were written that way and rewriting a venture's stated policy is the owner's
call, not this module's. A structured criterion is evaluated::

    kill_criteria:
      - id: burn-without-revenue
        description: $150 of recorded agent spend with revenue measured at zero.
        when:
          - metric: cumulative_agent_spend_usd
            op: ">="
            value: 150
          - metric: mrr
            op: "=="
            value: 0

Every criterion that does not evaluate must appear in
`portfolio/kill-criteria-register.yaml` with an owner, the specific missing
signal, and an expiry — the shape `platform/exception-register.yaml` uses. The
register carries an exact `unmeasurable_count` that fails both when new prose
slips in and when the register goes stale, so "this portfolio has no stop-loss"
is a dated, reviewed admission rather than fifteen lines of confident text.

Nothing here spends, stops, or refunds anything on its own. It reports, and
`allocate.py` zeroes the allocation of a venture whose criterion actually fired.
"""

from __future__ import annotations

import datetime as _datetime
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import yaml

TRIGGERED = "TRIGGERED"
NOT_TRIGGERED = "NOT_TRIGGERED"
NOT_MEASURABLE = "NOT_MEASURABLE"

# An unmeasurable criterion may be parked for at most this long. A stop-loss
# nobody re-reads is a decision to keep spending, made without review.
MAX_REGISTER_EXPIRY_DAYS = 180

REGISTER_PATH = Path("portfolio") / "kill-criteria-register.yaml"

_OPERATORS: Dict[str, Callable[[float, float], bool]] = {
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    ">": lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
}

# Metrics this repository can actually source today. A criterion naming
# anything else is a typo or an aspiration, and either way it must not evaluate
# to "not triggered".
KNOWN_METRICS = (
    "mrr",
    "customers",
    "monthly_cost",
    "cumulative_agent_spend_usd",
    "months_recorded",
    "consecutive_months_negative_net",
)

# `days_since:<anchor>` reads `anchors.<anchor>` from the venture contract.
DAYS_SINCE_PREFIX = "days_since:"


@dataclass
class ConditionResult:
    metric: str
    op: str
    value: Any
    observed: Any
    # True / False / None, where None is "unknown".
    holds: Optional[bool]
    note: str = ""
    # A broken rule (typo'd metric, bad operator) rather than a missing signal.
    malformed: bool = False


@dataclass
class CriterionResult:
    venture: str
    criterion_id: str
    text: str
    outcome: str
    conditions: List[ConditionResult] = field(default_factory=list)
    reason: str = ""
    # Malformed criteria are NOT_MEASURABLE too, but they are not parkable:
    # the register exists for signals nobody collects yet, not for rules that
    # are simply wrong. A typo must fail, not become a registered gap.
    malformed: bool = False

    @property
    def is_prose(self) -> bool:
        return not self.conditions and self.outcome == NOT_MEASURABLE and not self.malformed


class MetricResolver:
    """Resolves a metric name to a number, or to None meaning 'unknown'.

    Every resolver distinguishes "measured, and the answer is zero" from "not
    measured". Collapsing those two is how a portfolio convinces itself that
    silence is good news.
    """

    def __init__(
        self,
        venture: Dict[str, Any],
        ledger_rows: List[Dict[str, Any]],
        ledger_present: bool,
        today: Optional[_datetime.date] = None,
    ) -> None:
        self.venture = venture
        # Ledger rows for this venture only, ordered oldest period first.
        self.ledger_rows = ledger_rows
        self.ledger_present = ledger_present
        self.today = today or _datetime.date.today()

    # -- individual metrics -------------------------------------------------

    def _economics(self) -> Dict[str, Any]:
        return self.venture.get("economics") or {}

    def _mrr(self) -> Optional[float]:
        declared = self._economics().get("mrr")
        if declared is not None:
            return float(declared)
        # Fall back to the most recently recorded ledger figure.
        for row in reversed(self.ledger_rows):
            if row.get("mrr_end") is not None:
                return float(row["mrr_end"])
        return None

    def _customers(self) -> Optional[float]:
        value = self._economics().get("customers")
        return None if value is None else float(value)

    def _monthly_cost(self) -> Optional[float]:
        value = self._economics().get("monthly_cost")
        return None if value is None else float(value)

    def _cumulative_agent_spend(self) -> Optional[float]:
        if not self.ledger_present or not self.ledger_rows:
            # No rows is not zero spend. See portfolio/ledger/README.md.
            return None
        total = 0.0
        for row in self.ledger_rows:
            spend = row.get("agent_spend_usd")
            if spend is None:
                return None
            total += float(spend)
        return round(total, 2)

    def _months_recorded(self) -> Optional[float]:
        if not self.ledger_present:
            return None
        return float(len(self.ledger_rows))

    def _consecutive_months_negative_net(self) -> Optional[float]:
        """Trailing run of recorded months where `mrr_end - agent_spend_usd < 0`.

        Returns None when any month in the trailing run is missing either
        figure — a run computed over a month with no revenue recorded is not a
        shorter run, it is an unknown one.
        """
        if not self.ledger_present or not self.ledger_rows:
            return None
        run = 0
        for row in reversed(self.ledger_rows):
            mrr_end = row.get("mrr_end")
            spend = row.get("agent_spend_usd")
            if mrr_end is None or spend is None:
                return None
            if float(mrr_end) - float(spend) < 0:
                run += 1
            else:
                break
        return float(run)

    def _days_since(self, anchor: str) -> Tuple[Optional[float], str]:
        anchors = self.venture.get("anchors") or {}
        if anchor not in anchors:
            return None, f"no `anchors.{anchor}` recorded in the venture contract"
        raw = anchors.get(anchor)
        if raw is None:
            return None, f"`anchors.{anchor}` is null — the event has not happened, or was never recorded"
        if isinstance(raw, _datetime.datetime):
            parsed = raw.date()
        elif isinstance(raw, _datetime.date):
            parsed = raw
        else:
            try:
                parsed = _datetime.date.fromisoformat(str(raw))
            except ValueError:
                return None, f"`anchors.{anchor}` is not an ISO date: {raw!r}"
        return float((self.today - parsed).days), ""

    # -- dispatch -----------------------------------------------------------

    def resolve(self, metric: str) -> Tuple[Optional[float], str]:
        if metric.startswith(DAYS_SINCE_PREFIX):
            return self._days_since(metric[len(DAYS_SINCE_PREFIX):])

        if metric == "mrr":
            value = self._mrr()
            return value, "" if value is not None else "economics.mrr is null and no ledger mrr_end is recorded"
        if metric == "customers":
            value = self._customers()
            return value, "" if value is not None else "economics.customers is null"
        if metric == "monthly_cost":
            value = self._monthly_cost()
            return value, "" if value is not None else "economics.monthly_cost is null"
        if metric == "cumulative_agent_spend_usd":
            value = self._cumulative_agent_spend()
            return value, "" if value is not None else "no ledger row records spend for this venture"
        if metric == "months_recorded":
            value = self._months_recorded()
            return value, "" if value is not None else "no ledger is present"
        if metric == "consecutive_months_negative_net":
            value = self._consecutive_months_negative_net()
            return value, "" if value is not None else "a month in the trailing run records no mrr_end or no spend"

        return None, f"unknown metric '{metric}' — this repository sources none such"


def _evaluate_condition(condition: Dict[str, Any], resolver: MetricResolver) -> ConditionResult:
    metric = str(condition.get("metric", "")).strip()
    op = str(condition.get("op", "")).strip()
    value = condition.get("value")

    if not metric:
        return ConditionResult(metric, op, value, None, None, "condition declares no metric", malformed=True)
    if op not in _OPERATORS:
        return ConditionResult(metric, op, value, None, None, f"unknown operator '{op}'", malformed=True)
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return ConditionResult(metric, op, value, None, None, "condition value is not a number", malformed=True)

    is_anchor = metric.startswith(DAYS_SINCE_PREFIX)
    if not is_anchor and metric not in KNOWN_METRICS:
        return ConditionResult(
            metric,
            op,
            value,
            None,
            None,
            f"unknown metric '{metric}' — this repository sources none such",
            malformed=True,
        )
    if is_anchor and not metric[len(DAYS_SINCE_PREFIX):].strip():
        return ConditionResult(metric, op, value, None, None, "`days_since:` names no anchor", malformed=True)

    observed, note = resolver.resolve(metric)
    if observed is None:
        # An anchor that is present but not a date is a broken rule; an anchor
        # that is absent or null is a missing signal.
        malformed = "not an ISO date" in note
        return ConditionResult(metric, op, value, None, None, note, malformed=malformed)

    return ConditionResult(metric, op, value, observed, _OPERATORS[op](observed, float(value)))


def evaluate_criterion(
    criterion: Any,
    index: int,
    venture_name: str,
    resolver: MetricResolver,
) -> CriterionResult:
    """Evaluates one declared criterion under Kleene AND."""
    if isinstance(criterion, str):
        return CriterionResult(
            venture=venture_name,
            criterion_id=f"{venture_name}[{index}]",
            text=criterion.strip(),
            outcome=NOT_MEASURABLE,
            reason="prose criterion: no machine-evaluable rule is declared",
        )

    if not isinstance(criterion, dict):
        return CriterionResult(
            venture=venture_name,
            criterion_id=f"{venture_name}[{index}]",
            text=repr(criterion),
            outcome=NOT_MEASURABLE,
            reason="criterion is neither a string nor a mapping",
            malformed=True,
        )

    criterion_id = str(criterion.get("id") or f"{venture_name}[{index}]")
    text = str(criterion.get("description") or criterion.get("id") or "").strip()
    conditions = criterion.get("when")

    if not isinstance(conditions, list) or not conditions:
        return CriterionResult(
            venture=venture_name,
            criterion_id=criterion_id,
            text=text,
            outcome=NOT_MEASURABLE,
            reason="structured criterion declares no `when` conditions",
            malformed=True,
        )

    results = [_evaluate_condition(c if isinstance(c, dict) else {}, resolver) for c in conditions]
    malformed = [r for r in results if r.malformed]

    if malformed:
        # A criterion containing a broken rule cannot be trusted to report
        # "not triggered" even when another condition is definitely false, so
        # the breakage settles the outcome ahead of the Kleene logic below.
        outcome = NOT_MEASURABLE
        reason = "; ".join(f"{r.metric or '(no metric)'}: {r.note}" for r in malformed)
    elif any(r.holds is False for r in results):
        # Kleene AND: any definite False settles it as not triggered; otherwise
        # any unknown leaves the whole criterion unmeasurable.
        outcome, reason = NOT_TRIGGERED, ""
    elif any(r.holds is None for r in results):
        unknown = [r for r in results if r.holds is None]
        outcome = NOT_MEASURABLE
        reason = "; ".join(f"{r.metric}: {r.note}" for r in unknown)
    else:
        outcome = TRIGGERED
        reason = ", ".join(f"{r.metric} {r.op} {r.value} (observed {r.observed})" for r in results)

    return CriterionResult(
        venture=venture_name,
        criterion_id=criterion_id,
        text=text,
        outcome=outcome,
        conditions=results,
        reason=reason,
        malformed=bool(malformed),
    )


def ledger_rows_by_venture(repo_root: Path) -> Tuple[Dict[str, List[Dict[str, Any]]], bool]:
    """Ledger entries grouped by venture, oldest period first.

    The second return value is whether a ledger exists at all, which is the
    difference between "this venture has recorded nothing" and "there is
    nothing to read".
    """
    ledger_dir = repo_root / "portfolio" / "ledger"
    if not ledger_dir.is_dir():
        return {}, False

    files = sorted(ledger_dir.glob("*.yaml"))
    if not files:
        return {}, False

    rows: Dict[str, List[Dict[str, Any]]] = {}
    for ledger_file in files:
        try:
            with open(ledger_file, "r", encoding="utf-8") as handle:
                data = yaml.safe_load(handle) or {}
        except yaml.YAMLError:
            continue
        for entry in data.get("entries", []) or []:
            name = entry.get("venture")
            if name:
                rows.setdefault(name, []).append(entry)
    return rows, True


def evaluate_venture(
    venture: Dict[str, Any],
    venture_name: str,
    ledger_rows: Dict[str, List[Dict[str, Any]]],
    ledger_present: bool,
    today: Optional[_datetime.date] = None,
) -> List[CriterionResult]:
    resolver = MetricResolver(
        venture=venture,
        ledger_rows=ledger_rows.get(venture_name, []),
        ledger_present=ledger_present,
        today=today,
    )
    criteria = venture.get("kill_criteria") or []
    return [
        evaluate_criterion(criterion, index, venture_name, resolver)
        for index, criterion in enumerate(criteria)
    ]


# -- register -------------------------------------------------------------


@dataclass
class RegisterFinding:
    severity: str  # "error" | "warn"
    code: str
    message: str
    remedy: str


def load_register(repo_root: Path) -> Optional[Dict[str, Any]]:
    path = repo_root / REGISTER_PATH
    if not path.is_file():
        return None
    with open(path, "r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def audit_register(
    results: List[CriterionResult],
    register: Optional[Dict[str, Any]],
    today: Optional[_datetime.date] = None,
) -> List[RegisterFinding]:
    """Every unevaluable criterion must be registered, and the register must
    not outlive or drift from what it covers."""
    today = today or _datetime.date.today()
    findings: List[RegisterFinding] = []

    # A broken rule is a defect to fix, not a gap to park, so it is excluded
    # from the registerable set and reported on its own.
    for result in (r for r in results if r.malformed):
        findings.append(
            RegisterFinding(
                severity="error",
                code="malformed-criterion",
                message=f"{result.venture} declares a criterion that cannot be parsed: {result.reason}",
                remedy=(
                    "Fix the rule. The register is for signals nobody collects yet, "
                    f"not for rules that are wrong. Known metrics: {', '.join(KNOWN_METRICS)}, "
                    f"or '{DAYS_SINCE_PREFIX}<anchor>'."
                ),
            )
        )

    unmeasurable = [r for r in results if r.outcome == NOT_MEASURABLE and not r.malformed]

    if register is None:
        if unmeasurable:
            findings.append(
                RegisterFinding(
                    severity="error",
                    code="missing-kill-criteria-register",
                    message=(
                        f"{len(unmeasurable)} kill criteria cannot be evaluated and "
                        f"{REGISTER_PATH} does not exist"
                    ),
                    remedy=(
                        "Create the register naming each unevaluable criterion, the "
                        "signal it needs, an owner and an expiry."
                    ),
                )
            )
        return findings

    gaps = register.get("gaps") or []
    registered: Dict[Tuple[str, str], Dict[str, Any]] = {}

    for gap in gaps:
        if not isinstance(gap, dict):
            findings.append(
                RegisterFinding("error", "malformed-gap", "a register entry is not a mapping", "Fix the YAML.")
            )
            continue
        key = (str(gap.get("venture", "")), str(gap.get("criterion", "")).strip())
        if key in registered:
            findings.append(
                RegisterFinding(
                    "error",
                    "duplicate-gap",
                    f"{key[0]} registers the same criterion twice: {key[1][:60]}",
                    "Remove the duplicate; each criterion is claimed once.",
                )
            )
        registered[key] = gap

        for required in ("venture", "criterion", "owner", "issue", "missing_signal", "expires"):
            if not gap.get(required):
                findings.append(
                    RegisterFinding(
                        "error",
                        "incomplete-gap",
                        f"{key[0]} gap '{key[1][:50]}' has no `{required}`",
                        "Every parked criterion needs an owner, issue, missing signal and expiry.",
                    )
                )

        expires = gap.get("expires")
        if expires:
            expiry_date = expires if isinstance(expires, _datetime.date) else None
            if expiry_date is None:
                try:
                    expiry_date = _datetime.date.fromisoformat(str(expires))
                except ValueError:
                    findings.append(
                        RegisterFinding(
                            "error",
                            "unparseable-expiry",
                            f"{key[0]}: `expires: {expires}` is not an ISO date",
                            "Use YYYY-MM-DD.",
                        )
                    )
                    expiry_date = None
            if expiry_date is not None:
                if expiry_date < today:
                    findings.append(
                        RegisterFinding(
                            "error",
                            "expired-gap",
                            f"{key[0]}: the parked criterion expired on {expiry_date}",
                            "Make it measurable, restate it, or re-review and re-date it.",
                        )
                    )
                elif (expiry_date - today).days > MAX_REGISTER_EXPIRY_DAYS:
                    findings.append(
                        RegisterFinding(
                            "error",
                            "overlong-expiry",
                            (
                                f"{key[0]}: `expires: {expiry_date}` is more than "
                                f"{MAX_REGISTER_EXPIRY_DAYS} days out"
                            ),
                            f"Cap it at {MAX_REGISTER_EXPIRY_DAYS} days; a stop-loss nobody re-reads is a decision to keep spending.",
                        )
                    )

    # Unregistered: a criterion nothing can evaluate and nobody has admitted to.
    for result in unmeasurable:
        key = (result.venture, result.text)
        if key not in registered:
            findings.append(
                RegisterFinding(
                    "error",
                    "unregistered-unmeasurable-criterion",
                    f"{result.venture} declares a criterion nothing can evaluate: {result.text[:70]}",
                    (
                        f"Make it structured, or register it in {REGISTER_PATH} with the "
                        f"signal it needs. Reason: {result.reason}"
                    ),
                )
            )

    # Stale: registered as unevaluable, but it evaluates now (or no longer exists).
    live_keys = {(r.venture, r.text) for r in unmeasurable}
    for key in registered:
        if key not in live_keys:
            findings.append(
                RegisterFinding(
                    "error",
                    "stale-gap",
                    f"{key[0]} registers a criterion that is no longer unevaluable: {key[1][:60]}",
                    "Remove the entry and lower `unmeasurable_count`.",
                )
            )

    declared_count = register.get("unmeasurable_count")
    if declared_count is None:
        findings.append(
            RegisterFinding(
                "error",
                "missing-count",
                "the register declares no `unmeasurable_count`",
                "Declare the exact number; it ratchets in both directions.",
            )
        )
    elif int(declared_count) != len(unmeasurable):
        direction = "grew" if len(unmeasurable) > int(declared_count) else "shrank"
        findings.append(
            RegisterFinding(
                "error",
                "count-drift",
                (
                    f"`unmeasurable_count: {declared_count}` but {len(unmeasurable)} criteria "
                    f"cannot be evaluated — the unevaluable surface {direction}"
                ),
                (
                    "Raising it is a reviewed admission that another criterion went "
                    "inert; lowering it is the reward for making one real."
                ),
            )
        )

    return findings
