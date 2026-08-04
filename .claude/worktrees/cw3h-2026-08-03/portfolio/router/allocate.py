#!/usr/bin/env python3
"""
Portfolio Allocation Router & Economics Ledger Engine

Reads ventures/*/VENTURE.yaml and portfolio/ledger/*.yaml to compute
the portfolio work queue, spend ceilings, stage allocations, and kill criteria.
"""

import os
import glob
import json
import yaml
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

try:  # Runs both as `python3 portfolio/router/allocate.py` and as a package.
    from portfolio.router import kill_criteria
except ImportError:  # pragma: no cover - import shim for direct execution
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from portfolio.router import kill_criteria


class PortfolioRouter:
    def __init__(self, repo_root: str):
        self.repo_root = Path(repo_root)
        self.ventures_dir = self.repo_root / "ventures"
        self.ledger_dir = self.repo_root / "portfolio" / "ledger"

    def load_ventures(self) -> List[Dict[str, Any]]:
        ventures = []
        venture_files = sorted(glob.glob(str(self.ventures_dir / "*" / "VENTURE.yaml")))
        for filepath in venture_files:
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                    if data and isinstance(data, dict):
                        data["manifest_path"] = filepath
                        data["dir_name"] = Path(filepath).parent.name
                        ventures.append(data)
            except Exception as e:
                print(f"Warning: Failed to parse {filepath}: {e}")
        return ventures

    def load_ledger(self) -> List[Dict[str, Any]]:
        ledger_entries = []
        ledger_files = sorted(glob.glob(str(self.ledger_dir / "*.yaml")))
        for filepath in ledger_files:
            if Path(filepath).name == "README.md":
                continue
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                    if data and isinstance(data, dict):
                        ledger_entries.append(data)
            except Exception as e:
                print(f"Warning: Failed to parse ledger {filepath}: {e}")
        return ledger_entries

    def evaluate_kill_criteria(
        self,
        venture: Dict[str, Any],
        ledger_rows: Optional[Dict[str, List[Dict[str, Any]]]] = None,
        ledger_present: Optional[bool] = None,
    ) -> Tuple[bool, List[str]]:
        """Evaluates whether any kill criterion has fired.

        Until 2026-08-03 this method loaded the venture's declared criteria into
        a local named `kill_rules` and never referenced it again, so the only
        conditions that could ever stop a venture were the two stage/MRR rules
        below — and with all eleven ventures at `prototype`, neither could fire.
        The declared criteria are now actually evaluated, in
        `portfolio/router/kill_criteria.py`.

        A criterion that cannot be evaluated does **not** count as a pass. It is
        reported separately and must be registered in
        `portfolio/kill-criteria-register.yaml`; see `evaluate_all_criteria`.
        """
        triggered = []
        stage = venture.get("stage", "prototype")
        economics = venture.get("economics") or {}
        mrr = economics.get("mrr")

        # Rule: Winding down explicit stage
        if stage == "winding-down":
            triggered.append("Venture stage set to winding-down")

        # Additional programmatic checks if MRR is known zero past 3 months
        if stage in ["revenue", "scaling"] and mrr == 0:
            triggered.append("MRR is 0 in revenue/scaling stage")

        # The venture's own declared criteria, which used to be read and dropped.
        if ledger_rows is None or ledger_present is None:
            ledger_rows, ledger_present = kill_criteria.ledger_rows_by_venture(self.repo_root)

        name = venture.get("dir_name") or venture.get("name") or ""
        for result in kill_criteria.evaluate_venture(venture, name, ledger_rows, ledger_present):
            if result.outcome == kill_criteria.TRIGGERED:
                label = result.text or result.criterion_id
                triggered.append(f"{label} ({result.reason})")

        return (len(triggered) > 0, triggered)

    def evaluate_all_criteria(self) -> List[kill_criteria.CriterionResult]:
        """Every declared criterion across every venture, with its outcome."""
        ledger_rows, ledger_present = kill_criteria.ledger_rows_by_venture(self.repo_root)
        results: List[kill_criteria.CriterionResult] = []
        for venture in self.load_ventures():
            name = venture.get("dir_name") or venture.get("name") or ""
            results.extend(
                kill_criteria.evaluate_venture(venture, name, ledger_rows, ledger_present)
            )
        return results

    def calculate_allocation(self, total_budget_usd: float = 500.0) -> Dict[str, Any]:
        ventures = self.load_ventures()
        
        # Split budget into Mature (revenue/scaling) and Explore (idea/prototype/launched)
        # Rule: 60% revenue stage+, 40% early stage (explore budget protected)
        revenue_stage_names = {"revenue", "scaling"}
        
        mature_ventures = []
        explore_ventures = []
        killed_ventures = []

        # Read the ledger once rather than per venture.
        ledger_rows, ledger_present = kill_criteria.ledger_rows_by_venture(self.repo_root)

        for v in ventures:
            is_killed, reasons = self.evaluate_kill_criteria(v, ledger_rows, ledger_present)
            v["is_killed"] = is_killed
            v["kill_reasons"] = reasons

            if is_killed:
                killed_ventures.append(v)
            elif v.get("stage") in revenue_stage_names:
                mature_ventures.append(v)
            else:
                explore_ventures.append(v)

        mature_budget_pool = total_budget_usd * 0.60
        explore_budget_pool = total_budget_usd * 0.40

        allocations = []

        # Allocate mature ventures
        if mature_ventures:
            per_venture = mature_budget_pool / len(mature_ventures)
            for v in mature_ventures:
                cap = (v.get("budget") or {}).get("monthly_cap", per_venture)
                allocated = min(per_venture, float(cap))
                allocations.append({
                    "venture": v.get("name"),
                    "stage": v.get("stage"),
                    "pool": "mature_60%",
                    "allocated_usd": round(allocated, 2),
                    "cap_usd": cap,
                    "mrr": (v.get("economics") or {}).get("mrr"),
                    "status": "active",
                    "priority": 1 if (v.get("economics") or {}).get("mrr") else 2
                })

        # Allocate explore ventures
        if explore_ventures:
            per_venture = explore_budget_pool / len(explore_ventures)
            for v in explore_ventures:
                cap = (v.get("budget") or {}).get("monthly_cap", per_venture)
                allocated = min(per_venture, float(cap))
                # Protected explore check
                is_protected = (v.get("budget") or {}).get("protected", True)
                allocations.append({
                    "venture": v.get("name"),
                    "stage": v.get("stage"),
                    "pool": "protected_explore_40%",
                    "allocated_usd": round(allocated, 2),
                    "cap_usd": cap,
                    "mrr": (v.get("economics") or {}).get("mrr"),
                    "protected": is_protected,
                    "status": "active",
                    "priority": 3
                })

        # Record killed ventures
        for v in killed_ventures:
            allocations.append({
                "venture": v.get("name"),
                "stage": v.get("stage"),
                "pool": "none",
                "allocated_usd": 0.0,
                "cap_usd": 0.0,
                "mrr": (v.get("economics") or {}).get("mrr"),
                "status": "killed",
                "kill_reasons": v.get("kill_reasons"),
                "priority": 99
            })

        # Sort allocations by priority rank
        allocations.sort(key=lambda x: (x["priority"], -x["allocated_usd"], x["venture"]))

        return {
            "total_budget_usd": total_budget_usd,
            "mature_pool_usd": mature_budget_pool,
            "explore_pool_usd": explore_budget_pool,
            "active_count": len(mature_ventures) + len(explore_ventures),
            "killed_count": len(killed_ventures),
            "work_queue": allocations
        }


def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    router = PortfolioRouter(repo_root)
    result = router.calculate_allocation(total_budget_usd=500.0)
    
    print("============================================================")
    print("          PORTFOLIO ROUTER ALLOCATION REPORT                ")
    print("============================================================")
    print(f"Total Budget Pool: ${result['total_budget_usd']:.2f}")
    print(f"  - Mature Pool (60%):  ${result['mature_pool_usd']:.2f}")
    print(f"  - Explore Pool (40%): ${result['explore_pool_usd']:.2f}")
    print(f"Active Ventures: {result['active_count']} | Killed: {result['killed_count']}")
    print("------------------------------------------------------------")
    print(f"{'RANK':<5} {'VENTURE':<30} {'STAGE':<12} {'ALLOCATED':<10} {'STATUS'}")
    print("------------------------------------------------------------")
    for idx, item in enumerate(result["work_queue"], start=1):
        print(f"{idx:<5} {item['venture']:<30} {item['stage']:<12} ${item['allocated_usd']:<9.2f} {item['status'].upper()}")

    # Export JSON report
    out_path = os.path.join(repo_root, "portfolio", "router", "allocation_queue.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    print(f"\nSaved allocation queue report to: {out_path}")

if __name__ == "__main__":
    main()
