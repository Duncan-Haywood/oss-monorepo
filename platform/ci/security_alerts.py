#!/usr/bin/env python3
"""Pick the open code-scanning alerts an agent should fix next.

Feeds `.github/workflows/security-alert-fix.yml`, which hands each picked
alert to a Claude Code run that fixes it on its own branch and opens a PR
(owner, 2026-10-30: "can we get agents to fix the security scan results from
github as they come up?").

An alert is skipped while work on it is already in flight: the fix branch
`security-fix/code-scanning-<number>` exists. That branch is the only state
the loop keeps, so it is idempotent across scheduled runs without a ledger:

  branch exists           -> a PR is open or about to be; leave it.
  PR merged               -> the next CodeQL run on main closes the alert,
                             and branch_cleanup.py deletes the branch.
  PR closed unmerged      -> branch_cleanup.py deletes the branch after its
                             grace period and the alert comes back here.
                             Dismiss the alert in GitHub to stop that.

Alerts are fixed most severe first, a few per run, so one bad CodeQL upload
cannot start dozens of paid sessions at once.

Only code-scanning alerts are reachable: a workflow's GITHUB_TOKEN can read
them with `security-events: read`, but has no permission that reads
Dependabot or secret-scanning alerts. Dependabot's own security updates
(a repository setting) cover the first; a leaked secret needs rotating by
the owner, which no agent can do.

`pick()` holds the policy and touches no network, so it is unit-tested.

Usage (in Actions; GITHUB_TOKEN and GITHUB_REPOSITORY come from the runner):
    python3 platform/ci/security_alerts.py --max 3 --github-output "$GITHUB_OUTPUT"
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.github.com"
BRANCH_PREFIX = "security-fix/code-scanning-"
# CodeQL's security-severity first; rule.severity for tools that set no such level.
RANK = {"critical": 0, "high": 1, "error": 1, "medium": 2, "warning": 2,
        "low": 3, "note": 4}
MESSAGE_CHARS = 600


def branch_for(number: int) -> str:
    return f"{BRANCH_PREFIX}{number}"


def severity(alert: dict) -> str:
    rule = alert.get("rule") or {}
    return str(rule.get("security_severity_level") or rule.get("severity") or "unknown").lower()


def summarise(alert: dict) -> dict:
    """The fields the fixing agent needs, flattened for a job matrix."""
    rule = alert.get("rule") or {}
    inst = alert.get("most_recent_instance") or {}
    loc = inst.get("location") or {}
    message = " ".join(str((inst.get("message") or {}).get("text") or "").split())
    return {
        "number": int(alert["number"]),
        "branch": branch_for(int(alert["number"])),
        "severity": severity(alert),
        "rule": str(rule.get("id") or ""),
        "description": str(rule.get("description") or ""),
        "tool": str((alert.get("tool") or {}).get("name") or ""),
        "path": str(loc.get("path") or ""),
        "line": int(loc.get("start_line") or 0),
        "message": message[:MESSAGE_CHARS],
        "url": str(alert.get("html_url") or ""),
    }


def pick(alerts: list[dict], in_flight: set[str], limit: int) -> tuple[list[dict], list[str]]:
    """Open alerts not already being fixed, most severe then oldest first, capped at `limit`.

    Returns the picked summaries and one line per alert left out, with why.
    """
    skipped: list[str] = []
    todo: list[dict] = []
    for alert in alerts:
        if alert.get("state") != "open":
            continue
        s = summarise(alert)
        if s["branch"] in in_flight:
            skipped.append(f"#{s['number']} {s['rule']}: {s['branch']} exists (fix in flight)")
            continue
        todo.append(s)
    todo.sort(key=lambda s: (RANK.get(s["severity"], 5), s["number"]))
    for s in todo[limit:]:
        skipped.append(f"#{s['number']} {s['rule']}: over this run's cap of {limit}")
    return todo[:limit], skipped


def _get(url: str, token: str):
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def fetch_alerts(repo: str, token: str) -> list[dict]:
    alerts: list[dict] = []
    for page in range(1, 51):
        batch = _get(f"{API}/repos/{repo}/code-scanning/alerts?state=open&per_page=100&page={page}", token)
        alerts.extend(batch)
        if len(batch) < 100:
            break
    return alerts


def fetch_in_flight(repo: str, token: str) -> set[str]:
    prefix = urllib.parse.quote(BRANCH_PREFIX, safe="")
    refs = _get(f"{API}/repos/{repo}/git/matching-refs/heads/{prefix}", token)
    return {r["ref"].removeprefix("refs/heads/") for r in refs}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--max", type=int, default=3, help="alerts to hand out per run")
    ap.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""))
    ap.add_argument("--github-output", help="append `alerts=<json>` and `count=<n>` here")
    args = ap.parse_args(argv)
    token = os.environ.get("GITHUB_TOKEN", "")
    if not (args.repo and token):
        print("GITHUB_REPOSITORY and GITHUB_TOKEN are required", file=sys.stderr)
        return 2
    try:
        alerts = fetch_alerts(args.repo, token)
    except urllib.error.HTTPError as e:
        # 404: code scanning is not enabled; 403: the token lacks security-events.
        print(f"::warning::code-scanning alerts unreadable (HTTP {e.code}); nothing to fix")
        alerts = []
    picked, skipped = pick(alerts, fetch_in_flight(args.repo, token) if alerts else set(), args.max)
    print(f"{len(alerts)} open alert(s); handing out {len(picked)}.")
    for s in picked:
        print(f"  fix  #{s['number']} [{s['severity']}] {s['rule']} at {s['path']}:{s['line']}")
    for line in skipped:
        print(f"  skip {line}")
    if args.github_output:
        with open(args.github_output, "a", encoding="utf-8") as fh:
            fh.write(f"alerts={json.dumps(picked)}\ncount={len(picked)}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
