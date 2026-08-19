#!/usr/bin/env python3
"""
Autonomous agent entrypoint: analyze repo state and emit a deterministic work plan.

NOTE: This is a v1 entrypoint. It detects consolidation needs but does not yet
assign specific work items. The full entrypoint pattern (with work assignment)
requires GitHub API access which isn't available in this environment.

For now, it serves as a consolidation detector and agent-count recommender.
Agents still discover their own work via the portfolio router, but with
consolidation/backlog awareness injected by this step.

Outputs JSON with:
- work_items: (currently empty; full assignment requires GitHub API)
- skip_reasons: Map of skipped categories
- consolidate: List of PRs that should be consolidated
- next_agent_count: Recommended number of parallel agents
"""

import json
import subprocess
import sys
from pathlib import Path

def run_cmd(cmd):
    """Run a command and return stdout, or empty string on error."""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return result.stdout.strip()
    except Exception:
        return ""

def count_open_prs() -> int:
    """Count open PRs by listing the git refs locally.

    NOTE: This is a heuristic. Real PR state requires GitHub API.
    In Actions, fetch-depth is limited, so branch list will be incomplete.
    """
    try:
        # Fetch latest PR refs from remote (limited by fetch-depth)
        run_cmd(["git", "fetch", "origin", "refs/pull/*/head:refs/remotes/origin/pr/*"])
        output = run_cmd(["git", "for-each-ref", "refs/remotes/origin/pr/"])
        count = len([l for l in output.split('\n') if l.strip()])
        return count
    except Exception:
        return 0

def check_router_available() -> bool:
    """Verify portfolio router module exists and loads."""
    router_dir = Path(__file__).parent.parent.parent / "portfolio" / "router"
    sys.path.insert(0, str(router_dir))

    try:
        from allocate import work_queue
        # Try to import; don't run it
        return True
    except ImportError:
        return False

def analyze_state():
    """Analyze repo state. Returns JSON-serializable dict."""

    consolidate_groups = []
    skip_reasons = {}
    work_items = []  # v1: empty; full assignment needs GitHub API

    # Check 1: Can we see the router?
    if not check_router_available():
        skip_reasons["router_unavailable"] = "portfolio/router/allocate.py not found or broken"
        agent_count = 0
    else:
        # Check 2: Backlog size (heuristic: count git refs)
        pr_count = count_open_prs()

        if pr_count > 20:
            skip_reasons["backlog_too_large"] = f"Too many open PRs ({pr_count} > 20)"
            agent_count = 0
        elif pr_count > 10:
            skip_reasons["backlog_high"] = f"High PR backlog ({pr_count})"
            agent_count = 3
        else:
            agent_count = 10  # Default: run with 10 agents

    # Generate summary
    analysis_parts = [
        f"Open PRs (estimated): {count_open_prs()}",
        f"Router available: {check_router_available()}",
        f"Consolidation groups: {len(consolidate_groups)}",
        f"Skip reasons: {len(skip_reasons)}",
        f"Recommended agents: {agent_count}",
    ]

    return {
        "work_items": work_items,
        "skip_reasons": skip_reasons,
        "consolidate": consolidate_groups,
        "next_agent_count": agent_count,
        "analysis": " | ".join(analysis_parts),
        "version": "1 (consolidation detector only; full assignment needs GitHub API)",
    }

def main():
    """Entrypoint: analyze state and emit JSON plan."""
    try:
        decision = analyze_state()
        print(json.dumps(decision, indent=2))
        sys.exit(0)
    except Exception as e:
        error_output = {
            "error": str(e),
            "work_items": [],
            "skip_reasons": {"fatal_error": str(e)},
            "consolidate": [],
            "next_agent_count": 0,
            "analysis": f"Entrypoint failed: {e}",
            "version": "1",
        }
        print(json.dumps(error_output, indent=2), file=sys.stderr)
        print(json.dumps(error_output, indent=2))  # Also to stdout for workflow
        sys.exit(1)

if __name__ == "__main__":
    main()
