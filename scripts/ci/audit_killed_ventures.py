#!/usr/bin/env python3
"""
Audit Killed Ventures & Human Decision Routing

Verifies that any venture triggering a kill criterion has an explicit, traceable human decision:
either transitioning stage to 'winding-down' (or 'killed'), or registering a valid human override in
`VENTURE.yaml` under `kill_criteria_overrides` (with owner, reason, and unexpired YYYY-MM-DD date).

Fails closed with exit code 1 if an unaddressed killed venture exists.
"""

import os
import sys
from pathlib import Path

# Ensure repo root is on sys.path so portfolio modules can be imported
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from portfolio.router.allocate import PortfolioRouter


def audit_killed_ventures(repo_root: Path) -> int:
    router = PortfolioRouter(str(repo_root))
    allocation = router.calculate_allocation(total_budget_usd=500.0)

    unaddressed = allocation.get("human_decisions_required", [])
    if not unaddressed:
        print("OK: All ventures are active, winding-down, or operating under valid human decision overrides.")
        return 0

    print("==========================================================================")
    print(" ❌ FAIL-CLOSED AUDIT: UNADDRESSED KILLED VENTURES DETECTED               ")
    print("==========================================================================")
    print("The following venture(s) triggered kill criteria with NO registered human decision:\n")

    for item in unaddressed:
        print(f"  Venture: {item['venture']}")
        print(f"  Stage:   {item['stage']}")
        print(f"  Owner:   {item['owner']}")
        for reason in item.get("kill_reasons", []):
            print(f"  Reason:  {reason}")
        print(f"  Required Action: {item['action']}\n")

    print("To resolve this issue, the venture owner must either:")
    print("  1. Update `stage: winding-down` in ventures/<venture>/VENTURE.yaml")
    print("  2. Register an explicit override under `kill_criteria_overrides` in ventures/<venture>/VENTURE.yaml:")
    print("     kill_criteria_overrides:")
    print("       - criterion: \"<matching criterion description>\"")
    print("         owner: <your_name>")
    print("         reason: \"<business rationale for temporary budget extension>\"")
    print("         expiry: \"YYYY-MM-DD\"")

    return 1


def main():
    repo_root = Path(__file__).resolve().parents[2]
    code = audit_killed_ventures(repo_root)
    sys.exit(code)


if __name__ == "__main__":
    main()
