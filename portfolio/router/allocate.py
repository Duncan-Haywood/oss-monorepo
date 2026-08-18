#!/usr/bin/env python3
"""Portfolio router v1: reads ventures/*/VENTURE.yaml and produces a ranked
work queue of where the next unit of agent effort should go.

This implements the heuristic described in README.md — protected explore
budget, and treating an unmeasured venture differently from one measured at
zero. It is a read-only report over the current VENTURE.yaml files; it does
not read portfolio/ledger/ yet (there is no ledger data to read from), and it
does not spend anything or write anything back. See README.md's "Attribution
honesty" section for why that next step is deliberately not automated yet.

Usage:
    python3 portfolio/router/allocate.py           # table
    python3 portfolio/router/allocate.py --json     # JSON work queue
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
VENTURES_DIR = REPO_ROOT / "ventures"

# Stage at or beyond which a venture is no longer "early" for the protected
# explore-budget split described in README.md.
LATER_STAGES = {"revenue", "scaling"}

EXPLORE_SPLIT_LATER = 0.60
EXPLORE_SPLIT_EARLY = 0.40


@dataclass
class Venture:
    name: str
    stage: str
    mrr: Optional[float]
    monthly_cost: Optional[float]
    monthly_cap: float
    protected: bool
    kill_criteria: list = field(default_factory=list)

    @property
    def measured(self) -> bool:
        return self.mrr is not None

    @property
    def later_stage(self) -> bool:
        return self.stage in LATER_STAGES

    @property
    def needs_decision(self) -> bool:
        """Measured at exactly zero past the point spend should show up."""
        return self.later_stage and self.mrr == 0


def load_ventures(ventures_dir: Path = VENTURES_DIR) -> list[Venture]:
    ventures = []
    for venture_dir in sorted(p for p in ventures_dir.iterdir() if p.is_dir()):
        yaml_path = venture_dir / "VENTURE.yaml"
        if not yaml_path.is_file():
            continue
        data = yaml.safe_load(yaml_path.read_text()) or {}
        economics = data.get("economics") or {}
        budget = data.get("budget") or {}
        ventures.append(
            Venture(
                name=data.get("name", venture_dir.name),
                stage=data.get("stage", "idea"),
                mrr=economics.get("mrr"),
                monthly_cost=economics.get("monthly_cost"),
                monthly_cap=float(budget.get("monthly_cap") or 0),
                protected=bool(budget.get("protected", False)),
                kill_criteria=data.get("kill_criteria") or [],
            )
        )
    return ventures


def rank(ventures: list[Venture]) -> list[Venture]:
    """Order ventures for the next unit of agent effort.

    Priority:
      1. Measured at $0 MRR at revenue stage or beyond -- this needs a
         decision (kill or fix) before more spend, not blind continuation.
      2. Unmeasured ventures -- still owed their protected explore budget;
         null MRR is "not yet measured", not "measured and failing".
      3. Everything else: later stage before earlier stage, then by
         monthly_cap descending, then name for a stable order.
    """

    def sort_key(v: Venture):
        return (
            0 if v.needs_decision else 1,
            0 if not v.measured else 1,
            0 if v.later_stage else 1,
            -v.monthly_cap,
            v.name,
        )

    return sorted(ventures, key=sort_key)


def next_task(v: Venture) -> str:
    if v.needs_decision:
        return "Review: measured at $0 MRR past revenue stage -- check against kill_criteria before further spend."
    if not v.measured:
        return "Explore: no economics signal yet -- push toward the first real measurement (a hypothesis check or a customer touchpoint)."
    if v.mrr is not None and v.monthly_cost is not None and v.mrr < v.monthly_cost:
        return "Review: monthly_cost exceeds mrr -- check against kill_criteria."
    return "Continue: advance the venture's next documented roadmap task."


def work_queue(ventures: list[Venture]) -> list[dict]:
    return [
        {
            "venture": v.name,
            "stage": v.stage,
            "protected": v.protected,
            "task": next_task(v),
            "spend_ceiling_usd": v.monthly_cap,
        }
        for v in rank(ventures)
    ]


def print_table(ventures: list[Venture], queue: list[dict]) -> None:
    later_cap = sum(v.monthly_cap for v in ventures if v.later_stage)
    early_cap = sum(v.monthly_cap for v in ventures if not v.later_stage)
    total_cap = later_cap + early_cap
    print(
        f"Total monthly caps: ${total_cap:.0f} "
        f"(later-stage ${later_cap:.0f}, early-stage ${early_cap:.0f})"
    )
    print(
        f"Target split per README.md: {EXPLORE_SPLIT_LATER:.0%} later-stage / "
        f"{EXPLORE_SPLIT_EARLY:.0%} early-stage\n"
    )
    print(f"{'#':<3}{'venture':<32}{'stage':<12}{'cap':>6}  task")
    for i, item in enumerate(queue, 1):
        print(
            f"{i:<3}{item['venture']:<32}{item['stage']:<12}"
            f"{item['spend_ceiling_usd']:>6.0f}  {item['task']}"
        )


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit JSON instead of a table")
    args = parser.parse_args(argv)

    ventures = load_ventures()
    if not ventures:
        print("No ventures with a VENTURE.yaml found.", file=sys.stderr)
        return 1

    queue = work_queue(ventures)

    if args.json:
        print(json.dumps(queue, indent=2))
    else:
        print_table(ventures, queue)
    return 0


if __name__ == "__main__":
    sys.exit(main())
