#!/usr/bin/env python3
"""Create a safe branch cleanup queue from a read-only repository export."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


STATUSES = {"protected", "shared", "moved-tip", "duplicate", "unique-work", "uncertain"}


def classify_branch(branch: dict[str, Any], default_commits: set[str]) -> str:
    """Classify conservatively; incomplete evidence always wins over cleanup."""
    name = branch.get("name")
    tip = branch.get("tip")
    commits = branch.get("commits")
    pr = branch.get("pull_request")
    if not isinstance(name, str) or not name or not isinstance(tip, str) or not tip:
        return "uncertain"
    if branch.get("protected") is True:
        return "protected"
    if not isinstance(commits, list) or not commits or any(not isinstance(c, str) for c in commits):
        return "uncertain"
    if not isinstance(branch.get("shared_by", []), list):
        return "uncertain"
    if branch.get("shared_by"):
        return "shared"
    if not isinstance(pr, dict):
        return "uncertain"
    if pr.get("tip_moved_after_close") is True:
        return "moved-tip"
    if pr.get("state") not in {"open", "closed"}:
        return "uncertain"
    if pr.get("state") == "closed" and pr.get("merged") is True and set(commits) <= default_commits:
        return "duplicate"
    if set(commits) - default_commits:
        return "unique-work"
    return "uncertain"


def scan(snapshot: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(snapshot.get("repository"), str) or not snapshot["repository"]:
        raise ValueError("repository must be a non-empty string")
    branches = snapshot.get("branches")
    default_commits = snapshot.get("default_commits")
    if not isinstance(branches, list) or not isinstance(default_commits, list):
        raise ValueError("branches and default_commits must be arrays")
    if any(not isinstance(commit, str) for commit in default_commits):
        raise ValueError("default_commits must contain strings")

    queue = []
    for branch in branches:
        if not isinstance(branch, dict):
            raise ValueError("each branch must be an object")
        status = classify_branch(branch, set(default_commits))
        pr = branch.get("pull_request")
        queue.append(
            {
                "branch": branch.get("name"),
                "tip": branch.get("tip"),
                "status": status,
                "pull_request": pr.get("number") if isinstance(pr, dict) else None,
                "commits": branch.get("commits", []),
                "recovery_command": (
                    f"git branch recover/{branch.get('name', 'unknown')} {branch.get('tip', '<tip>')}"
                ),
                "action": "review-only" if status != "duplicate" else "candidate-for-review",
            }
        )
    counts = {status: sum(item["status"] == status for item in queue) for status in STATUSES}
    return {
        "repository": snapshot["repository"],
        "default_branch": snapshot.get("default_branch", "main"),
        "event": "branch_hygiene_scan_completed",
        "branch_count": len(queue),
        "counts": counts,
        "queue": queue,
        "notice": "Read-only evidence report. No branch is deleted or certified safe to remove.",
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Branch hygiene report: `{report['repository']}`",
        "",
        f"Scanned **{report['branch_count']}** branches. This is a read-only approval queue; it does not certify deletion safety.",
        "",
        "## Counts",
        "",
        " | ".join(["Status", "Branches"]),
        " | ".join(["---", "---:"]),
    ]
    lines.extend(f" | ".join([f"`{status}`", str(report["counts"][status])]) for status in sorted(STATUSES))
    lines.extend(["", "## Queue", "", "| Branch | Status | PR | Tip | Recovery |", "| --- | --- | ---: | --- | --- |"])
    for item in report["queue"]:
        lines.append(
            f"| `{item['branch']}` | `{item['status']}` | {item['pull_request'] or '-'} | `{item['tip'] or '-'}` | `{item['recovery_command']}` |"
        )
    lines.extend(["", report["notice"], ""])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--markdown", type=Path)
    parser.add_argument("--manifest", type=Path)
    args = parser.parse_args()
    report = scan(json.loads(args.snapshot.read_text(encoding="utf-8")))
    if args.markdown:
        args.markdown.write_text(markdown(report), encoding="utf-8")
    if args.manifest:
        args.manifest.write_text(json.dumps(report["queue"], indent=2) + "\n", encoding="utf-8")
    if not args.markdown and not args.manifest:
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
