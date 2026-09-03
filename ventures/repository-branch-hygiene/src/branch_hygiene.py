#!/usr/bin/env python3
"""Read-only branch inventory over a customer-controlled JSON snapshot."""
from __future__ import annotations
import argparse
import csv
import json
import subprocess
import sys
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


def _is_ancestor(repo: Path, commit: str, ref: str) -> bool:
    result = subprocess.run(
        ["git", "-C", str(repo), "merge-base", "--is-ancestor", commit, ref],
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def load_pr_export(path: Path) -> list[dict[str, Any]]:
    """Normalize a `gh pr list --json headRefName,state,baseRefName` export.

    This is the customer's own already-exported pull-request record, read
    from disk; the tool never calls the GitHub API itself.
    """
    records = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        raise ValueError("PR export must be a JSON array of pull request records")
    normalized = []
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get("headRefName"), str) or not isinstance(record.get("state"), str):
            raise ValueError("each PR record requires string headRefName and state")
        state = record["state"].upper()
        base = record.get("baseRefName")
        if base is not None and not isinstance(base, str):
            raise ValueError("baseRefName must be a string when present")
        normalized.append({
            "head": record["headRefName"],
            "base": base,
            "state": "open" if state == "OPEN" else "closed",
            "merged": state == "MERGED",
        })
    # `gh pr list` is newest-first; scan treats the last closed record per
    # head as authoritative, so keep oldest-first order here.
    normalized.reverse()
    return normalized

def snapshot_from_repo(repo: Path, protected: set[str] | None = None, pr_export: Path | None = None) -> dict[str, Any]:
    """Build a read-only snapshot from local refs without contacting a remote.

    When `pr_export` is given, its pull-request records are resolved against
    this same local checkout's own ref ancestry (never a network call) so
    local-mode scans stop defaulting every branch to "uncertain".
    """
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
    tip_by_name = {branch["name"]: branch["tip"] for branch in branches}
    pull_requests = []
    if pr_export is not None:
        for record in load_pr_export(pr_export):
            base = record["base"] or default
            tip = tip_by_name.get(record["head"])
            base_commits = [tip] if tip and _is_ancestor(repo, tip, base) else []
            pull_requests.append({
                "head": record["head"],
                "state": record["state"],
                "merged": record["merged"],
                "base": base,
                "base_commits": base_commits,
            })
    return {
        "default_branch": default,
        "protected_branches": sorted(protected_branches),
        "branches": branches,
        "pull_requests": pull_requests,
    }

def scan(snapshot: dict[str, Any]) -> list[Finding]:
    branches, pull_requests = snapshot.get("branches"), snapshot.get("pull_requests")
    protected = set(snapshot.get("protected_branches", []))
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
        records = by_head.get(name, [])
        # A reused branch name can carry more than one PR record (an old
        # closed/merged PR plus a new open one). An open record always wins,
        # so active work never inherits a stale closed record and lands as a
        # delete candidate; otherwise fall back to the last record, matching
        # prior behavior for the common single-record case.
        related = next((record for record in records if record.get("state") == "open"), records[-1] if records else None)
        if name in protected:
            classification, reason = "protected", "branch is explicitly protected"
        elif len(tips[tip]) > 1:
            classification, reason = "shared", "tip is referenced by multiple branches"
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

# Column order is shared with the `--format csv` stdout writer in main() so the
# file and the stream are the same table; a reader that learns one can parse the
# other.
CSV_COLUMNS = ("branch", "tip", "classification", "review_action", "reason", "commit_count")

def csv_row(finding: Finding) -> tuple:
    """One approval-queue row: descriptive fields only, never an executable command."""
    return (
        finding.branch,
        finding.tip,
        finding.classification,
        finding.review_action,
        finding.reason,
        len(finding.commits),
    )

def write_csv(findings: list[Finding], path: Path) -> None:
    """Write a spreadsheet-friendly approval queue, never executable commands."""
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(CSV_COLUMNS)
        for finding in findings:
            writer.writerow(csv_row(finding))

def has_unresolved_risk(findings: list[Finding]) -> bool:
    """Return whether the snapshot needs human review before any cleanup."""
    return any(finding.classification in {"shared", "moved-tip", "uncertain"} for finding in findings)

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create a read-only branch review report",
        epilog=(
            "No warranty. This tool is provided free and as-is, without warranty "
            "of any kind. It is not legal, security, or compliance advice and "
            "does not replace a qualified professional. You are responsible for "
            "reviewing and verifying its output before relying on it."
        ),
    )
    parser.add_argument("snapshot", type=Path, nargs="?", help="JSON snapshot (omit when using --repo)")
    parser.add_argument("--repo", type=Path, help="scan local branches from this checkout")
    parser.add_argument("--protect", action="append", default=[], help="additional protected branch name")
    parser.add_argument(
        "--pr-json",
        type=Path,
        help=(
            "gh pr list --json headRefName,state,baseRefName export (requires --repo); "
            "resolves branches against this same local checkout instead of leaving them uncertain"
        ),
    )
    parser.add_argument("--report", type=Path, default=Path("branch-report.txt"))
    parser.add_argument("--manifest", type=Path, default=Path("recovery-manifest.json"))
    parser.add_argument("--csv", dest="csv_path", type=Path, help="write a spreadsheet-friendly approval queue")
    parser.add_argument("--usage-log", type=Path)
    parser.add_argument(
        "--emit-snapshot",
        action="store_true",
        help=(
            "print the snapshot itself to stdout and exit, writing no report or manifest; "
            "this is the portable file the browser reviewer at index.html reads, so a "
            "teammate without the checkout can review the same refs"
        ),
    )
    parser.add_argument("--format", choices=("text", "json", "csv"), default="text", help="print a human or machine-readable summary")
    parser.add_argument("--fail-on-risk", action="store_true", help="exit 2 when shared, moved-tip, or uncertain findings need review")
    args = parser.parse_args()
    if bool(args.snapshot) == bool(args.repo):
        parser.error("provide exactly one of SNAPSHOT or --repo")
    if args.pr_json and not args.repo:
        parser.error("--pr-json requires --repo")
    snapshot = (
        snapshot_from_repo(args.repo, set(args.protect), args.pr_json)
        if args.repo
        else json.loads(args.snapshot.read_text(encoding="utf-8"))
    )
    # Emitting the snapshot is a read-only export, not a scan: it deliberately
    # writes no report and no manifest, so redirecting stdout to a file cannot
    # also leave two stale outputs beside it. `scan` still runs below for every
    # other invocation.
    if args.emit_snapshot:
        print(json.dumps(snapshot, indent=2, sort_keys=True))
        return 0
    findings = scan(snapshot)
    write_outputs(findings, args.report, args.manifest)
    if args.csv_path:
        write_csv(findings, args.csv_path)
    if args.usage_log:
        event = {"event": "scan_completed", "at": datetime.now(timezone.utc).isoformat(), "finding_count": len(findings)}
        with args.usage_log.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event) + "\n")
    summary = {"finding_count": len(findings), "risk": has_unresolved_risk(findings), "classifications": {}}
    for finding in findings:
        summary["classifications"][finding.classification] = summary["classifications"].get(finding.classification, 0) + 1
    if args.format == "json":
        print(json.dumps(summary, sort_keys=True))
    elif args.format == "csv":
        writer = csv.writer(sys.stdout, lineterminator="\n")
        writer.writerow(CSV_COLUMNS)
        for finding in findings:
            writer.writerow(csv_row(finding))
    else:
        status = "review required" if summary["risk"] else "no unresolved risk"
        outputs = f"{args.report}, {args.manifest}"
        if args.csv_path:
            outputs += f", and {args.csv_path}"
        print(f"Wrote {len(findings)} findings to {outputs}; {status}")
    return 2 if args.fail_on_risk and summary["risk"] else 0

if __name__ == "__main__":
    raise SystemExit(main())
