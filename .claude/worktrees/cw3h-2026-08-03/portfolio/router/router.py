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
    kill_criteria: List[str]
    links: Dict[str, Optional[str]]
    path: Path

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
                for entry in data.get("entries", []):
                    v_name = entry.get("venture")
                    if v_name:
                        spend_map[v_name] = round(
                            spend_map.get(v_name, 0.0)
                            + float(entry.get("agent_spend_usd", 0.0)),
                            2,
                        )
            except Exception as e:
                print(f"Warning: Failed to parse ledger {ledger_file}: {e}", file=sys.stderr)

        return spend_map

    def compute_allocation(self, total_budget_usd: float = 300.0) -> List[AllocationResult]:
        ventures = self.load_ventures()
        cumulative_spend = self.load_cumulative_spend()

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

            scored_ventures.append((v, composite_score, focus))

        # Sort by composite score descending
        scored_ventures.sort(key=lambda x: x[1], reverse=True)

        # Allocate budget
        results = []
        remaining_budget = total_budget_usd

        for rank, (v, score, focus) in enumerate(scored_ventures, start=1):
            cap = v.budget.monthly_cap
            # Guaranteed min allocation for protected ventures
            if v.budget.protected:
                alloc = min(cap, max(20.0, remaining_budget * 0.15))
            else:
                alloc = min(cap, remaining_budget * 0.12)

            alloc = round(alloc, 2)
            remaining_budget = max(0.0, remaining_budget - alloc)

            rationale_parts = [f"Stage: {v.stage}", f"Score: {score:.2f}"]
            if v.budget.protected:
                rationale_parts.append("Protected explore budget")
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
            "| Rank | Venture | Stage | Protected | MRR | Monthly Cap | Allocated Budget | Primary Focus |",
            "|:---:|:---|:---:|:---:|:---:|:---:|:---:|:---|",
        ]

        total_allocated = 0.0
        for a in allocations:
            prot_str = "YES" if a.protected else "No"
            mrr_str = f"${a.mrr:.2f}" if a.mrr is not None else "Unmeasured"
            lines.append(
                f"| {a.rank} | **[{a.venture_name}](file://{self.repo_root}/ventures/{a.venture_name})** | `{a.stage}` | {prot_str} | {mrr_str} | ${a.monthly_cap:.2f} | **${a.allocated_spend:.2f}** | {a.suggested_focus} |"
            )
            total_allocated += a.allocated_spend

        lines.extend(
            [
                "",
                f"**Total Allocated Agent Spend:** `${total_allocated:.2f} USD`",
                "",
                "## Allocation Principles Applied",
                "",
                "1. **Protected Explore Budget**: Ventures with `budget.protected: true` are guaranteed baseline funding regardless of short-term measured MRR.",
                "2. **Unmeasured Distinction**: Unmeasured ventures (`economics.mrr: null`) receive neutral explore credit rather than being penalized as zero-revenue.",
                "3. **Stage-Gated Escalation**: Higher stage ventures (`launched`/`revenue`) receive priority allocations for customer acquisition and monetization scaling.",
                "",
            ]
        )

        return "\n".join(lines)


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
        })
        total_allocated += a.allocated_spend

    return {
        "portfolio_summary": {
            "total_ventures": len(ventures),
            "total_monthly_budget_cap_usd": total_monthly_budget,
            "allocated_monthly_budget_usd": round(total_allocated, 2),
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

