#!/usr/bin/env python3
"""
Portfolio Router Engine

Reads venture contracts (ventures/*/VENTURE.yaml) and monthly spend ledger logs
(portfolio/ledger/YYYY-MM.yaml) to compute optimal agent effort allocations.

Implements allocation principles:
1. Protected explore budget: Early-stage / explore-flagged ventures receive guaranteed allocation.
2. Unmeasured vs. measured zero: Distinguishes unmeasured ventures (MRR null) from non-performing ones (MRR 0).
3. Stage weighting & spend caps: Balances ROI, stage progression, and monthly spend ceilings.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Any
import yaml
import math
import sys

# Run both as `python3 portfolio/router/router.py` and as an imported module, so
# the evaluator has to be reachable either way. Same shape as allocate.py.
try:  # runs both as `portfolio.router.router` under pytest
    from portfolio.router.kill_criteria import (
        TRIGGERED,
        CriterionResult,
        evaluate_venture,
        has_stopping_rule,
        ledger_rows_by_venture,
        measured_detail,
    )
except ImportError:  # running as a script, not as portfolio.router.router
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from kill_criteria import (
        TRIGGERED,
        CriterionResult,
        evaluate_venture,
        has_stopping_rule,
        ledger_rows_by_venture,
        measured_detail,
    )


STAGE_WEIGHTS = {
    "scaling": 1.0,
    "revenue": 0.9,
    "launched": 0.75,
    "prototype": 0.55,
    "idea": 0.35,
    "winding-down": 0.05,
}

# Economics credit bounds.
#
# `EXPLORE_CREDIT` is what an unmeasured venture (`economics.mrr: null`) earns,
# and it is deliberately higher than `MEASURED_ZERO_CREDIT` — see README.md,
# "Unmeasured is not zero". A brand new venture must not be punished for being
# new.
#
# But that credit was previously permanent, which inverted the incentive it
# exists to serve: every venture the router has ever funded reported an honest
# `mrr_end: 0` in the ledger and immediately scored *below* the ventures that
# had never been funded and never measured. Reporting a real number cost 0.35
# economics credit, while reporting nothing cost nothing. The router paid more
# for not measuring, and it paid most for the ventures it knew least about.
#
# So the explore credit is now a grant with a size rather than a standing
# entitlement. It stays at full value while a venture has drawn no recorded
# spend, and decays linearly toward the measured-zero floor as the venture
# consumes `EXPLORE_GRANT_USD` of cumulative agent spend. A venture that has
# never been funded is still treated as new; one that has absorbed real budget
# and still reports nothing is treated as declining to measure.
#
# This is not automated spend escalation on an ROI signal — the README warns
# against that, and it still applies. Nothing here rewards measured revenue
# more aggressively; it only stops rewarding the *absence* of a measurement.
EXPLORE_CREDIT = 0.65
MEASURED_ZERO_CREDIT = 0.30
EXPLORE_GRANT_USD = 50.0

# Guaranteed baseline for a protected venture — a floor *within* the portfolio
# budget, never a claim against money the portfolio does not have.
#
# It used to be the latter. `compute_allocation` walked the ranked ventures
# handing each protected one `max(20.0, remaining * 0.15)`, and that `max`
# ignored `remaining` entirely, so the floor kept paying out after the budget
# was gone. The subtraction clamped at zero and the loop carried on. With the
# current 11 protected ventures the router allocated $200 against a budget of
# $100, of $10, and of $0 alike — the number printed as "Total Portfolio Budget
# Cap" could not cap anything. It only looked correct at $300 because 11
# ventures happened to want less than $300.
#
# The floor is now applied and then clamped to what is left. Because ventures
# are funded in composite-score order, a budget that cannot cover every floor
# starves the lowest-scoring ventures rather than quietly overspending the
# total, and an unfunded venture is reported as unfunded instead of vanishing
# into a total nobody checks.
PROTECTED_FLOOR_USD = 20.0

# What a venture's declared stopping rules say about it right now.
#
#   triggered  at least one criterion was measured and held
#   holding    at least one criterion is measurable and none held
#   none       no declared criterion can be measured at all
#
# `none` is deliberately not `holding`. A venture comfortably inside its
# stopping rule and a venture with no stopping rule to be inside of are
# different states, and reporting them identically is what let eleven ventures
# draw budget with no brake for as long as they had existed.
STOP_TRIGGERED = "triggered"
STOP_HOLDING = "holding"
STOP_NONE = "none"

# What the work queue tells an agent session to do with a venture whose
# stopping rule fired. The queue is what sessions read to pick work, so this
# string is the only thing standing between a triggered criterion and another
# month of spend on the venture that triggered it.
STOPPED_FOCUS = (
    "STOP — a declared stopping rule fired. Do no further funded work on this "
    "venture until the owner records a decision in portfolio/stopping-decisions.yaml."
)


def economics_score(mrr: Optional[float], cumulative_spend: float = 0.0) -> float:
    """Economics component of the composite score.

    `cumulative_spend` is the venture's lifetime recorded agent spend from the
    ledger. It only affects unmeasured ventures, where it decays the explore
    grant; a measured venture is scored on its number regardless of spend.
    """
    if mrr is not None:
        if mrr > 0:
            return 1.0 + math.log10(float(mrr) + 1.0)
        return MEASURED_ZERO_CREDIT

    if EXPLORE_GRANT_USD <= 0:
        return MEASURED_ZERO_CREDIT

    consumed = min(max(cumulative_spend, 0.0), EXPLORE_GRANT_USD) / EXPLORE_GRANT_USD
    return EXPLORE_CREDIT - consumed * (EXPLORE_CREDIT - MEASURED_ZERO_CREDIT)


@dataclass
class Hypothesis:
    claim: str
    status: str  # untested | supported | refuted
    checked: Optional[str] = None


@dataclass
class Economics:
    currency: str = "USD"
    mrr: Optional[float] = None
    monthly_cost: Optional[float] = None
    customers: Optional[int] = None


@dataclass
class Budget:
    monthly_cap: float = 50.0
    protected: bool = False


@dataclass
class VentureContract:
    name: str
    description: str
    stage: str
    owner: str
    hypotheses: List[Hypothesis]
    economics: Economics
    budget: Budget
    # Prose strings or structured criteria — see portfolio/router/kill_criteria.py
    # for the two forms and which of them the allocator can actually evaluate.
    # This module only carries them; `allocate.py` is what reads them.
    kill_criteria: List[Any]
    links: Dict[str, Optional[str]]
    path: Path
    # The parsed contract as written. `kill_criteria.py` resolves `mrr` off
    # `economics` and `days_since:<anchor>` off `anchors`, so handing it only
    # the criteria list would make both permanently unmeasurable — the exact
    # failure the evaluator exists to distinguish from "measured, and zero".
    raw: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_yaml(cls, path: Path) -> "VentureContract":
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)

        hypotheses = [
            Hypothesis(
                claim=h.get("claim", ""),
                status=h.get("status", "untested"),
                checked=h.get("checked"),
            )
            for h in data.get("hypotheses", [])
        ]

        econ_data = data.get("economics", {}) or {}
        economics = Economics(
            currency=econ_data.get("currency", "USD"),
            mrr=econ_data.get("mrr"),
            monthly_cost=econ_data.get("monthly_cost"),
            customers=econ_data.get("customers"),
        )

        budget_data = data.get("budget", {}) or {}
        budget = Budget(
            monthly_cap=float(budget_data.get("monthly_cap", 50.0)),
            protected=bool(budget_data.get("protected", False)),
        )

        return cls(
            name=data.get("name", path.parent.name),
            description=data.get("description", ""),
            stage=data.get("stage", "prototype"),
            owner=data.get("owner", "unassigned"),
            hypotheses=hypotheses,
            economics=economics,
            budget=budget,
            kill_criteria=data.get("kill_criteria", []),
            links=data.get("links", {}),
            path=path,
            raw=data or {},
        )


@dataclass
class AllocationResult:
    rank: int
    venture_name: str
    stage: str
    allocated_spend: float
    monthly_cap: float
    protected: bool
    mrr: Optional[float]
    score: float
    rationale: str
    suggested_focus: str
    funded: bool = True
    # One of STOP_TRIGGERED / STOP_HOLDING / STOP_NONE.
    stopping_rule: str = STOP_NONE
    # The measured detail behind a triggered criterion, e.g.
    # "cumulative_agent_spend_usd=150.0 >= 150; cumulative_revenue_usd=0.0 == 0".
    # Empty unless `stopping_rule` is STOP_TRIGGERED.
    kill_reasons: List[str] = field(default_factory=list)
    # What this row would have drawn at its position in the queue, had the
    # criterion not fired. Kept so the report can state the sum the stopping
    # rule actually held back; a control whose effect is invisible is one
    # nobody notices has stopped working.
    withheld_spend: float = 0.0


class PortfolioRouter:
    def __init__(self, repo_root: Path):
        self.repo_root = repo_root
        self.ventures_dir = repo_root / "ventures"
        self.ledger_dir = repo_root / "portfolio" / "ledger"

    def load_ventures(self) -> List[VentureContract]:
        contracts = []
        if not self.ventures_dir.exists():
            return contracts

        for yaml_path in sorted(self.ventures_dir.glob("*/VENTURE.yaml")):
            try:
                contracts.append(VentureContract.from_yaml(yaml_path))
            except Exception as e:
                print(f"Warning: Failed to parse {yaml_path}: {e}", file=sys.stderr)

        return contracts

    def evaluate_stopping_rules(
        self,
        venture: VentureContract,
        ledger_rows: Dict[str, List[Dict[str, Any]]],
        ledger_present: bool,
    ) -> "tuple[str, List[CriterionResult]]":
        """Evaluate one venture's declared criteria against recorded history.

        Returns the venture's stopping-rule state and every criterion result, so
        callers can report *why* as well as *what*. Evaluation itself lives in
        `kill_criteria.py` and is shared with `allocate.py` and
        `scripts/ci/kill_criteria_ratchet.py` — a second implementation of the
        rules here would be a second answer to the same question.
        """
        results = evaluate_venture(venture.raw, venture.name, ledger_rows, ledger_present)
        if any(r.outcome == TRIGGERED for r in results):
            return STOP_TRIGGERED, results
        if has_stopping_rule(results):
            return STOP_HOLDING, results
        return STOP_NONE, results

    def load_cumulative_spend(self) -> Dict[str, float]:
        """Lifetime recorded agent spend per venture, across every ledger month.

        The explore grant decays against a venture's whole funding history, not
        just the current month, so a venture cannot refresh its credit simply by
        crossing a month boundary while still reporting no measurement.
        """
        spend_map: Dict[str, float] = {}
        if not self.ledger_dir.exists():
            return spend_map

        for ledger_file in sorted(self.ledger_dir.glob("*.yaml")):
            try:
                with open(ledger_file, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
            except Exception as e:
                print(f"Warning: Failed to parse ledger {ledger_file}: {e}", file=sys.stderr)
                continue

            for entry in data.get("entries", []):
                v_name = entry.get("venture")
                if not v_name:
                    continue
                # Per entry, not per file. One unparseable `agent_spend_usd`
                # used to abort the whole month, which zeroed recorded spend for
                # every *other* venture in it — silently restoring their full
                # explore grant and raising what the router hands them. A typo
                # in one row must not become a raise for the rest.
                try:
                    spend = float(entry.get("agent_spend_usd", 0.0))
                except (TypeError, ValueError) as e:
                    print(
                        f"Warning: {ledger_file}: venture {v_name!r} has an "
                        f"unreadable agent_spend_usd ({e}); counted as 0.0",
                        file=sys.stderr,
                    )
                    spend = 0.0
                spend_map[v_name] = round(spend_map.get(v_name, 0.0) + spend, 2)

        return spend_map

    def compute_allocation(self, total_budget_usd: float = 300.0) -> List[AllocationResult]:
        ventures = self.load_ventures()
        cumulative_spend = self.load_cumulative_spend()
        ledger_rows, ledger_present = ledger_rows_by_venture(self.repo_root)

        if not ventures:
            return []

        scored_ventures = []
        for v in ventures:
            stage_w = STAGE_WEIGHTS.get(v.stage.lower(), 0.5)

            econ_score = economics_score(
                v.economics.mrr, cumulative_spend.get(v.name, 0.0)
            )

            # Protection bonus
            protected_bonus = 0.4 if v.budget.protected else 0.0

            # Hypotheses bonus
            tested_count = sum(1 for h in v.hypotheses if h.status != "untested")
            hyp_score = 0.1 * tested_count

            composite_score = (stage_w * 0.4) + (econ_score * 0.35) + protected_bonus + hyp_score

            # Determine focus
            if v.stage == "launched":
                focus = "Customer acquisition, conversion optimization, and monetization"
            elif v.stage == "prototype":
                focus = "Core feature completion and concierge MVP testing"
            elif v.stage == "idea":
                focus = "Hypothesis validation and problem interview scope"
            elif v.stage == "revenue":
                focus = "Scaling MRR and expanding distribution channels"
            else:
                focus = "Maintenance and exploratory review"

            stop_state, criterion_results = self.evaluate_stopping_rules(
                v, ledger_rows, ledger_present
            )
            if stop_state == STOP_TRIGGERED:
                focus = STOPPED_FOCUS

            scored_ventures.append(
                (v, composite_score, focus, stop_state, criterion_results)
            )

        # Triggered ventures sort last regardless of score, then by score
        # descending. Rank is the order of a work queue, and a venture whose own
        # stopping rule fired must not be the first thing a session is told to
        # work on.
        scored_ventures.sort(key=lambda x: (x[3] == STOP_TRIGGERED, -x[1]))

        # Allocate budget
        results = []
        remaining_budget = round(max(0.0, total_budget_usd), 2)

        for rank, (v, score, focus, stop_state, criterion_results) in enumerate(
            scored_ventures, start=1
        ):
            cap = v.budget.monthly_cap
            # Guaranteed min allocation for protected ventures
            if v.budget.protected:
                target = min(cap, max(PROTECTED_FLOOR_USD, remaining_budget * 0.15))
            else:
                target = min(cap, remaining_budget * 0.12)

            # The budget is a ceiling. Round before clamping so the clamp is
            # exact — rounding afterwards can round an allocation up past the
            # money that is actually left.
            target = round(target, 2)
            alloc = min(target, remaining_budget)

            # A fired stopping rule withholds the allocation and does not draw
            # from the pool. The money is not redistributed: total portfolio
            # spend falls by what was withheld. Handing it to the next venture
            # would mean the portfolio commits the same sum whether or not a
            # brake fired, and the only effect of a fired criterion would be
            # which zero-revenue venture received the budget.
            #
            # Because a triggered venture sorts last, `withheld` is what this
            # row would have drawn *at its position in the queue* — after every
            # other venture has taken its share. That understates the saving
            # against a counterfactual where the criterion never fired and the
            # venture kept its score rank, and understating it is the right
            # direction for a number that argues for spending less.
            #
            # `protected: true` does not exempt a venture: protection guarantees
            # a floor while a venture is being explored, and a triggered
            # criterion is the portfolio saying the exploration reached its
            # declared limit. print-atelier is both protected and the only
            # venture with a measurable rule, so an exemption here would have
            # made the whole mechanism inert.
            withheld = 0.0
            kill_reasons: List[str] = []
            if stop_state == STOP_TRIGGERED:
                withheld = alloc
                alloc = 0.0
                kill_reasons = [
                    f"{r.text.strip()} ({measured_detail(r)})"
                    for r in criterion_results
                    if r.outcome == TRIGGERED
                ]
            else:
                remaining_budget = round(max(0.0, remaining_budget - alloc), 2)

            rationale_parts = [f"Stage: {v.stage}", f"Score: {score:.2f}"]
            if stop_state == STOP_TRIGGERED:
                rationale_parts.insert(
                    0,
                    f"STOPPING RULE TRIGGERED — ${withheld:.2f} withheld pending owner decision",
                )
            elif stop_state == STOP_NONE:
                rationale_parts.append("No measurable stopping rule")
            if v.budget.protected:
                rationale_parts.append("Protected explore budget")
            if alloc < target:
                # Say so, rather than letting a starved venture read as a
                # cheap one. This is the signal that the portfolio is trying
                # to fund more ventures than the budget supports.
                rationale_parts.append(
                    f"Budget exhausted: ${target:.2f} indicated, ${alloc:.2f} available"
                )
            if v.economics.mrr is not None:
                rationale_parts.append(f"MRR: ${v.economics.mrr:.2f}")
            else:
                spent = cumulative_spend.get(v.name, 0.0)
                if spent > 0:
                    # Name the decay in the report, so a venture losing explore
                    # credit shows why rather than just sliding down the table.
                    rationale_parts.append(
                        f"MRR: Unmeasured after ${spent:.2f} spend "
                        f"(explore grant {min(spent / EXPLORE_GRANT_USD, 1.0):.0%} consumed)"
                    )
                else:
                    rationale_parts.append("MRR: Unmeasured (explore grant intact)")

            results.append(
                AllocationResult(
                    rank=rank,
                    venture_name=v.name,
                    stage=v.stage,
                    allocated_spend=alloc,
                    monthly_cap=cap,
                    protected=v.budget.protected,
                    mrr=v.economics.mrr,
                    score=round(score, 3),
                    rationale=" | ".join(rationale_parts),
                    suggested_focus=focus,
                    funded=alloc > 0.0,
                    stopping_rule=stop_state,
                    kill_reasons=kill_reasons,
                    withheld_spend=round(withheld, 2),
                )
            )

        return results

    def generate_report_markdown(self, total_budget_usd: float = 300.0) -> str:
        allocations = self.compute_allocation(total_budget_usd)
        lines = [
            "# Portfolio Effort & Resource Allocation Report",
            "",
            f"**Total Portfolio Budget Cap:** `${total_budget_usd:.2f} USD`",
            f"**Total Ventures Monitored:** {len(allocations)}",
            "",
            "## Venture Effort Work Queue",
            "",
            "| Rank | Venture | Stage | Stopping Rule | Protected | MRR | Monthly Cap | Allocated Budget | Primary Focus |",
            "|:---:|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---|",
        ]

        total_allocated = 0.0
        total_withheld = 0.0
        unfunded = []
        stop_labels = {STOP_TRIGGERED: "**TRIGGERED**", STOP_HOLDING: "holding", STOP_NONE: "`none`"}
        for a in allocations:
            prot_str = "YES" if a.protected else "No"
            mrr_str = f"${a.mrr:.2f}" if a.mrr is not None else "Unmeasured"
            if a.stopping_rule == STOP_TRIGGERED:
                # Withheld, not starved. `funded` is False for both, and saying
                # "budget exhausted" here would credit the shortfall to the cap
                # instead of to the criterion that actually stopped the money.
                focus_str = a.suggested_focus
            elif a.funded:
                focus_str = a.suggested_focus
            else:
                focus_str = "**UNFUNDED THIS PERIOD** — budget exhausted before this rank"
            lines.append(
                # Repo-relative, not `file://{self.repo_root}`. This report is a
                # committed artifact and CI regenerates it, so an absolute path
                # meant the checked-in file could never match what a runner
                # produced — every worktree and every runner rewrote all 11 rows.
                f"| {a.rank} | **[{a.venture_name}](../ventures/{a.venture_name})** | `{a.stage}` | {stop_labels.get(a.stopping_rule, a.stopping_rule)} | {prot_str} | {mrr_str} | ${a.monthly_cap:.2f} | **${a.allocated_spend:.2f}** | {focus_str} |"
            )
            total_allocated += a.allocated_spend
            total_withheld += a.withheld_spend
            if not a.funded and a.stopping_rule != STOP_TRIGGERED:
                unfunded.append(a.venture_name)

        lines.extend(
            [
                "",
                f"**Total Allocated Agent Spend:** `${total_allocated:.2f} USD` "
                f"of `${total_budget_usd:.2f} USD` cap "
                f"(`${total_budget_usd - total_allocated:.2f} USD` unallocated)",
            ]
        )

        if unfunded:
            lines.extend(
                [
                    "",
                    f"**Unfunded this period ({len(unfunded)}):** "
                    + ", ".join(f"`{n}`" for n in unfunded)
                    + ". The portfolio is carrying more protected ventures than the"
                    " budget cap supports. Raise the cap, lower a `monthly_cap`, or"
                    " retire a venture — the router will not overspend to hide this.",
                ]
            )

        lines.extend(self._stopping_rule_section(allocations, total_withheld))

        lines.extend(
            [
                "",
                "## Allocation Principles Applied",
                "",
                "1. **Protected Explore Budget**: Ventures with `budget.protected: true` are guaranteed baseline funding regardless of short-term measured MRR.",
                "2. **Unmeasured Distinction**: Unmeasured ventures (`economics.mrr: null`) receive neutral explore credit rather than being penalized as zero-revenue.",
                "3. **Stage-Gated Escalation**: Higher stage ventures (`launched`/`revenue`) receive priority allocations for customer acquisition and monetization scaling.",
                "4. **Declared Stopping Rules**: A venture whose `kill_criteria` fire against recorded ledger history is ranked last, allocated `$0.00`, and escalated below. Whether to wind it down is the portfolio owner's decision; withholding the next month's budget until that decision exists is this engine's.",
                "5. **The Cap Is A Ceiling**: Total allocated spend never exceeds the portfolio budget cap. The protected floor in principle 1 is a floor within the cap, not a claim against it; when the budget cannot fund every floor, the shortfall falls on the lowest-scoring ventures and is reported above.",
                "",
            ]
        )

        return "\n".join(lines)


    def _stopping_rule_section(
        self, allocations: List[AllocationResult], total_withheld: float
    ) -> List[str]:
        """The escalation block: what fired, what it cost, and who must decide.

        A triggered criterion used to change nothing anyone would ever see. This
        section is the route to a human — the report states the venture, the
        measured values that tripped it, and the decision the register expects.
        `scripts/ci/stopping_rule_review.py` is what makes ignoring it fail.
        """
        triggered = [a for a in allocations if a.stopping_rule == STOP_TRIGGERED]
        without_rule = [a for a in allocations if a.stopping_rule == STOP_NONE]

        lines = ["## Stopping Rules", ""]

        if triggered:
            lines.append(
                f"**{len(triggered)} venture(s) tripped a declared stopping rule. "
                f"`${total_withheld:.2f}` of allocation is withheld pending an owner "
                "decision recorded in "
                "[`portfolio/stopping-decisions.yaml`](stopping-decisions.yaml).**"
            )
            lines.append("")
            for a in triggered:
                lines.append(f"- **{a.venture_name}** — ${a.withheld_spend:.2f} withheld")
                for reason in a.kill_reasons:
                    lines.append(f"  - {reason}")
            lines.append("")
        else:
            lines.append(
                "No venture has tripped a declared stopping rule against recorded "
                "ledger history. That is a measurement, not a guarantee: see the "
                "count below."
            )
            lines.append("")

        if without_rule:
            names = ", ".join(f"`{a.venture_name}`" for a in without_rule)
            drawn = sum(a.allocated_spend for a in without_rule)
            lines.append(
                f"{len(without_rule)} of {len(allocations)} venture(s) draw "
                f"`${drawn:.2f}` with no criterion this engine can measure, so no "
                f"rule in the system can ever stop their funding: {names}. "
                "`scripts/ci/kill_criteria_ratchet.py` holds that count and reports "
                "why each one is unevaluable."
            )
        else:
            lines.append(
                "Every venture holds at least one criterion that can be measured "
                "against recorded ledger history."
            )
        lines.append("")

        return lines


def find_repo_root() -> Path:
    current = Path(__file__).resolve()
    for parent in [current] + list(current.parents):
        if (parent / "ventures").exists():
            return parent
    return Path(__file__).resolve().parents[2]


def load_ventures(repo_root: Optional[Path] = None) -> List[Dict[str, Any]]:
    root = Path(repo_root) if repo_root else find_repo_root()
    router = PortfolioRouter(root)
    contracts = router.load_ventures()
    res = []
    for c in contracts:
        res.append({
            "name": c.name,
            "stage": c.stage,
            "protected": c.budget.protected,
            "monthly_cap": c.budget.monthly_cap,
            "mrr": c.economics.mrr,
            "hypotheses": [h.__dict__ for h in c.hypotheses],
            "path": str(c.path),
        })
    return res


def load_ledger(repo_root: Optional[Path] = None) -> Dict[str, Any]:
    root = Path(repo_root) if repo_root else find_repo_root()
    router = PortfolioRouter(root)
    res: Dict[str, Dict[str, float]] = {}

    if router.ledger_dir.exists():
        for yaml_file in sorted(router.ledger_dir.glob("*.yaml")):
            try:
                with open(yaml_file, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
                for entry in data.get("entries", []):
                    name = entry.get("venture")
                    spend = float(entry.get("agent_spend_usd", 0.0))
                    if name:
                        if name not in res:
                            res[name] = {"total_agent_spend": 0.0}
                        res[name]["total_agent_spend"] = round(res[name]["total_agent_spend"] + spend, 2)
            except Exception:
                pass
    return res


def calculate_score(venture: Dict[str, Any], cumulative_spend: float = 0.0) -> float:
    stage = str(venture.get("stage", "prototype")).lower()
    stage_w = STAGE_WEIGHTS.get(stage, 0.5)
    econ_score = economics_score(venture.get("mrr"), cumulative_spend)
    protected_bonus = 0.4 if venture.get("protected") else 0.0
    hypotheses = venture.get("hypotheses", [])
    tested_count = sum(
        1 for h in hypotheses
        if (h.get("status") if isinstance(h, dict) else getattr(h, "status", "untested")) != "untested"
    )
    hyp_score = 0.1 * tested_count
    return round((stage_w * 0.4) + (econ_score * 0.35) + protected_bonus + hyp_score, 3)


def route_portfolio(repo_root: Optional[Path] = None, total_monthly_budget: float = 300.0) -> Dict[str, Any]:
    root = Path(repo_root) if repo_root else find_repo_root()
    router = PortfolioRouter(root)
    allocations = router.compute_allocation(total_monthly_budget)
    ventures = router.load_ventures()
    queue = []
    total_allocated = 0.0
    total_withheld = 0.0
    for a in allocations:
        queue.append({
            "rank": a.rank,
            "venture": a.venture_name,
            "stage": a.stage,
            "allocated_budget_usd": a.allocated_spend,
            "monthly_cap": a.monthly_cap,
            "protected": a.protected,
            "mrr": a.mrr,
            "score": a.score,
            "rationale": a.rationale,
            "suggested_focus": a.suggested_focus,
            "funded": a.funded,
            # Carried on every row, not only the triggered ones. A consumer has
            # to be able to tell a venture inside its stopping rule from one
            # with no stopping rule to be inside of, and both used to be absent.
            "stopping_rule": a.stopping_rule,
            "kill_reasons": a.kill_reasons,
            "withheld_budget_usd": a.withheld_spend,
        })
        total_allocated += a.allocated_spend
        total_withheld += a.withheld_spend

    return {
        "portfolio_summary": {
            "total_ventures": len(ventures),
            "total_monthly_budget_cap_usd": total_monthly_budget,
            "allocated_monthly_budget_usd": round(total_allocated, 2),
            "unallocated_budget_usd": round(total_monthly_budget - total_allocated, 2),
            "unfunded_ventures": [
                a.venture_name
                for a in allocations
                if not a.funded and a.stopping_rule != STOP_TRIGGERED
            ],
            "withheld_by_stopping_rule_usd": round(total_withheld, 2),
            "stopped_ventures": sorted(
                a.venture_name for a in allocations if a.stopping_rule == STOP_TRIGGERED
            ),
            "without_stopping_rule": sorted(
                a.venture_name for a in allocations if a.stopping_rule == STOP_NONE
            ),
        },
        "queue": queue,
    }


def main():
    repo_root = Path(__file__).resolve().parents[2]
    router = PortfolioRouter(repo_root)
    report_md = router.generate_report_markdown()

    # Write report to portfolio/ALLOCATION_REPORT.md
    out_file = repo_root / "portfolio" / "ALLOCATION_REPORT.md"
    out_file.write_text(report_md, encoding="utf-8")
    print(f"Generated allocation report at: {out_file}")
    print("\n--- Summary Output ---")
    print(report_md[:1200])


if __name__ == "__main__":
    main()

