#!/usr/bin/env python3
"""Read-only branch inventory over a customer-controlled JSON snapshot."""
from __future__ import annotations
import argparse
import json
import subprocess
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

@dataclass(frozen=True)
class Finding:
    branch: str
    tip: str
    classification: str
    reason: str
    commits: tuple[str, ...]

    @property
    def review_action(self) -> str:
        """Return a review instruction, never an executable Git operation."""
        return {
            "merged": "review-delete-candidate",
            "moved-tip": "preserve-and-review",
            "active": "preserve-active-work",
            "protected": "do-not-delete",
            "shared": "preserve-shared-ref",
            "uncertain": "investigate-missing-pr-record",
        }[self.classification]

def _git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def snapshot_from_repo(repo: Path, protected: set[str] | None = None) -> dict[str, Any]:
    """Build a read-only snapshot from local refs without contacting a remote."""
    repo = repo.resolve()
    names = [
        line
        for line in _git(repo, "for-each-ref", "--format=%(refname:short)", "refs/heads").splitlines()
        if line
    ]
    if not names:
        raise ValueError("repository has no local branches")
    default = _git(repo, "symbolic-ref", "--short", "HEAD").strip()
    branches = []
    for name in names:
        commits = _git(repo, "rev-list", "--max-count=100", name).splitlines()
        if commits:
            branches.append({"name": name, "tip": commits[0], "commits": commits})
    protected_branches = {default, *(protected or set())}
    protected_commits = {
        commit
        for name in protected_branches
        if name in names
        for commit in _git(repo, "rev-list", "--max-count=100", name).splitlines()
    }
    return {
        "default_branch": default,
        "protected_branches": sorted(protected_branches),
        "branches": branches,
        "pull_requests": [],
        "protected_commits": sorted(protected_commits),
    }

def scan(snapshot: dict[str, Any]) -> list[Finding]:
    branches, pull_requests = snapshot.get("branches"), snapshot.get("pull_requests")
    protected = set(snapshot.get("protected_branches", []))
    protected_commits = set(snapshot.get("protected_commits", []))
    if not isinstance(branches, list) or not isinstance(pull_requests, list):
        raise ValueError("snapshot requires branches and pull_requests arrays")
    by_head: dict[str, list[dict[str, Any]]] = {}
    for pr in pull_requests:
        if isinstance(pr, dict) and isinstance(pr.get("head"), str):
            by_head.setdefault(pr["head"], []).append(pr)
    tips: dict[str, list[str]] = {}
    for branch in branches:
        if not isinstance(branch, dict) or not all(isinstance(branch.get(k), str) for k in ("name", "tip")):
            raise ValueError("each branch requires string name and tip")
        commits = branch.get("commits", [])
        if not isinstance(commits, list) or not all(isinstance(commit, str) for commit in commits):
            raise ValueError(f"invalid commits for {branch['name']}")
        tips.setdefault(branch["tip"], []).append(branch["name"])
    findings = []
    for branch in branches:
        name, tip = branch["name"], branch["tip"]
        commits = tuple(branch.get("commits", []))
        related = by_head.get(name, [])[-1] if by_head.get(name) else None
        if name in protected:
            classification, reason = "protected", "branch is explicitly protected"
        elif len(tips[tip]) > 1:
            classification, reason = "shared", "tip is referenced by multiple branches"
        elif protected_commits and tip in protected_commits:
            classification, reason = "merged", "branch tip is in the recorded protected branch history"
        elif related and related.get("state") == "closed" and related.get("merged"):
            if tip in set(related.get("base_commits", [])):
                classification, reason = "merged", "closed pull request was merged and tip is in its base history"
            else:
                classification, reason = "moved-tip", "merged pull request branch tip is outside the recorded base history"
        elif related and related.get("state") == "closed":
            classification, reason = "moved-tip", "closed pull request is not merged; preserve until reviewed"
        elif related and related.get("state") == "open":
            classification, reason = "active", "pull request is still open"
        else:
            classification, reason = "uncertain", "no pull request record was supplied"
        findings.append(Finding(name, tip, classification, reason, commits))
    return findings

def write_outputs(findings: list[Finding], report_path: Path, manifest_path: Path) -> None:
    counts: dict[str, int] = {}
    for finding in findings:
        counts[finding.classification] = counts.get(finding.classification, 0) + 1
    lines = ["Repository branch hygiene report", "", "Approval queue: review every finding before any Git operation.", "", "Counts: " + ", ".join(f"{key}={counts[key]}" for key in sorted(counts))]
    lines.extend(f"- [{f.classification}] {f.branch} ({f.tip}): {f.reason}; action={f.review_action}" for f in findings)
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    manifest = {
        "format": 2,
        "read_only": True,
        "approval_required": True,
        "findings": [dict(asdict(f), review_action=f.review_action) for f in findings],
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

def has_unresolved_risk(findings: list[Finding]) -> bool:
    """Return whether the snapshot needs human review before any cleanup."""
    return any(finding.classification in {"shared", "moved-tip", "uncertain"} for finding in findings)

def main() -> int:
    parser = argparse.ArgumentParser(description="Create a read-only branch review report")
    parser.add_argument("snapshot", type=Path, nargs="?", help="JSON snapshot (omit when using --repo)")
    parser.add_argument("--repo", type=Path, help="scan local branches from this checkout")
    parser.add_argument("--protect", action="append", default=[], help="additional protected branch name")
    parser.add_argument("--report", type=Path, default=Path("branch-report.txt"))
    parser.add_argument("--manifest", type=Path, default=Path("recovery-manifest.json"))
    parser.add_argument("--usage-log", type=Path)
    parser.add_argument("--format", choices=("text", "json"), default="text", help="print a human or machine-readable summary")
    parser.add_argument("--fail-on-risk", action="store_true", help="exit 2 when shared, moved-tip, or uncertain findings need review")
    args = parser.parse_args()
    if bool(args.snapshot) == bool(args.repo):
        parser.error("provide exactly one of SNAPSHOT or --repo")
    snapshot = (
        snapshot_from_repo(args.repo, set(args.protect))
        if args.repo
        else json.loads(args.snapshot.read_text(encoding="utf-8"))
    )
    findings = scan(snapshot)
    write_outputs(findings, args.report, args.manifest)
    if args.usage_log:
        event = {"event": "scan_completed", "at": datetime.now(timezone.utc).isoformat(), "finding_count": len(findings)}
        with args.usage_log.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event) + "\n")
    summary = {"finding_count": len(findings), "risk": has_unresolved_risk(findings), "classifications": {}}
    for finding in findings:
        summary["classifications"][finding.classification] = summary["classifications"].get(finding.classification, 0) + 1
    if args.format == "json":
        print(json.dumps(summary, sort_keys=True))
    else:
        status = "review required" if summary["risk"] else "no unresolved risk"
        print(f"Wrote {len(findings)} findings to {args.report} and {args.manifest}; {status}")
    return 2 if args.fail_on_risk and summary["risk"] else 0

if __name__ == "__main__":
    raise SystemExit(main())
