#!/usr/bin/env python3
"""
Autonomous agent entrypoint: analyze repo state and emit a deterministic work plan.

Runs once sequentially before parallel agents start. Outputs JSON with:
- work_items: List of specific work to do, in priority order
- skip_reasons: Map of skipped categories to reasons
- consolidate: List of overlapping PRs that should be consolidated
- next_agent_count: Recommended number of parallel agents to spawn (0 if no work)

This prevents the race condition where agents independently discover duplicate
work. Instead, one step reads global state; agents are stateless executors.
"""

import json
import subprocess
import sys
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Optional

@dataclass
class WorkItem:
    priority: int
    venture: str
    description: str
    category: str  # "dependency", "fix", "feature", "research"
    estimated_effort: str  # "small", "medium", "large"

@dataclass
class EntrypointDecision:
    work_items: list
    skip_reasons: dict
    consolidate: list
    next_agent_count: int
    analysis: str  # Human-readable summary

def run_cmd(cmd: list) -> str:
    """Run a command and return stdout, suppress on error."""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return result.stdout.strip()
    except Exception as e:
        return f"ERROR: {e}"

def get_open_prs() -> list:
    """Fetch open PRs using git (GitHub CLI not available in this environment)."""
    # In a real environment with GitHub API access, this would call the API.
    # For now, return empty list and detect from git refs instead.
    prs = []
    try:
        # Try to list remote branches that look like PR branches
        branches_output = run_cmd(["git", "branch", "-r"])
        for line in branches_output.split('\n'):
            branch = line.strip()
            if 'origin/claude/' in branch or 'origin/opencode/' in branch:
                prs.append(branch.replace('origin/', ''))
    except:
        pass
    return prs

def get_router_allocation() -> list:
    """Run portfolio router to get work queue."""
    router_dir = Path(__file__).parent.parent.parent / "portfolio" / "router"
    sys.path.insert(0, str(router_dir))

    try:
        # Import and run the router
        from allocate import allocate_work
        work_queue = allocate_work()
        return work_queue if work_queue else []
    except Exception as e:
        return []

def analyze_state() -> EntrypointDecision:
    """Analyze current repo state and emit work plan."""

    open_prs = get_open_prs()
    router_work = get_router_allocation()

    # Detect problematic patterns
    consolidate_groups = []
    skip_reasons = {}
    work_items = []

    # Count open PRs by type (heuristic)
    next_upgrade_prs = [p for p in open_prs if 'next' in p.lower() or 'upgrade' in p.lower()]
    candidate_prs = [p for p in open_prs if 'candidate' in p.lower() or 'pipeline' in p.lower()]
    research_prs = [p for p in open_prs if 'research' in p.lower() or 'reachability' in p.lower()]

    # If >3 PRs of same type, flag for consolidation
    if len(next_upgrade_prs) > 3:
        consolidate_groups.append({
            "type": "next_upgrades",
            "prs": next_upgrade_prs,
            "reason": f"{len(next_upgrade_prs)} overlapping Next.js upgrade PRs"
        })

    if len(candidate_prs) > 2:
        consolidate_groups.append({
            "type": "candidates",
            "prs": candidate_prs,
            "reason": f"{len(candidate_prs)} overlapping candidate screening PRs"
        })

    # Skip categories with consolidation in flight
    if consolidate_groups:
        skip_reasons["consolidation_in_flight"] = "Consolidate overlapping PRs before new work"

    # If PR backlog > 5, reduce agent count
    agent_count = 0 if len(open_prs) > 8 else 3 if len(open_prs) > 5 else 10

    # Generate summary
    analysis_parts = [
        f"Open PRs: {len(open_prs)}",
        f"Next upgrades in flight: {len(next_upgrade_prs)}",
        f"Candidate/research PRs: {len(candidate_prs) + len(research_prs)}",
        f"Consolidation needed: {len(consolidate_groups)} groups" if consolidate_groups else "No consolidation needed",
        f"Recommended agents: {agent_count} (backlog management)"
    ]

    decision = EntrypointDecision(
        work_items=work_items,
        skip_reasons=skip_reasons,
        consolidate=consolidate_groups,
        next_agent_count=agent_count,
        analysis=" | ".join(analysis_parts)
    )

    return decision

def main():
    """Entrypoint: analyze state and emit JSON work plan."""
    try:
        decision = analyze_state()
        output = {
            "work_items": decision.work_items,
            "skip_reasons": decision.skip_reasons,
            "consolidate": decision.consolidate,
            "next_agent_count": decision.next_agent_count,
            "analysis": decision.analysis,
        }
        print(json.dumps(output, indent=2))
        sys.exit(0)
    except Exception as e:
        error_output = {
            "error": str(e),
            "work_items": [],
            "skip_reasons": {"error": str(e)},
            "consolidate": [],
            "next_agent_count": 0,
            "analysis": f"Entrypoint failed: {e}"
        }
        print(json.dumps(error_output, indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()
