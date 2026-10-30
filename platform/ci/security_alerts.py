#!/usr/bin/env python3
"""Write open code-scanning alerts out as files, the scheduled agents' security queue.

Scheduled agent sessions cannot read code-scanning alerts: the alerts API
needs a token with `security-events`, and a session's GitHub tools have no
such scope. Files they can read. So `.github/workflows/security-alert-queue.yml`
runs this hourly with the workflow's own token and commits the result to the
data branch `security-alerts` (main needs a PR for every change), and
`prompt.md` ("0. Security alerts first") sends the next scheduled session to
the top of the queue (owner, 2026-10-30: fix "the security scan results from
github as they come up" as "a work distribution thing from the normally
scheduled agents", file based "as it's easier to process"). No model is
called and nothing is billed beyond a few seconds of Actions.

The branch holds, regenerated whole on every run:

  QUEUE.md           open alerts, most severe then oldest first, one line each
  alerts/<n>.md      one file per open alert: rule, location, finding, how to fix

A fixed or dismissed alert's file disappears on the next run after CodeQL
stops reporting it, so the queue empties itself.

Claiming is file based too: a session takes alert <n> by pushing the branch
`security-fix/code-scanning-<n>` before it starts work, and skips any alert
whose branch `git ls-remote origin 'refs/heads/security-fix/*'` already shows.

Only code-scanning alerts are reachable: a workflow token has no permission
that reads Dependabot or secret-scanning alerts. Dependabot's own security
updates (a repository setting) cover the first; a leaked secret needs
rotating by the owner.

`render()` holds the policy and touches no network, so it is unit-tested.

Usage (in Actions; GITHUB_TOKEN and GITHUB_REPOSITORY come from the runner):
    python3 platform/ci/security_alerts.py --out <checkout of security-alerts>
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.github.com"
BRANCH_PREFIX = "security-fix/code-scanning-"
# CodeQL's security-severity first; rule.severity for tools that set no such level.
RANK = {"critical": 0, "high": 1, "error": 1, "medium": 2, "warning": 2,
        "low": 3, "note": 4}
MESSAGE_CHARS = 600


def severity(alert: dict) -> str:
    rule = alert.get("rule") or {}
    return str(rule.get("security_severity_level") or rule.get("severity") or "unknown").lower()


def summarise(alert: dict) -> dict:
    rule = alert.get("rule") or {}
    inst = alert.get("most_recent_instance") or {}
    loc = inst.get("location") or {}
    message = " ".join(str((inst.get("message") or {}).get("text") or "").split())
    return {
        "number": int(alert["number"]),
        "severity": severity(alert),
        "rule": str(rule.get("id") or ""),
        "description": str(rule.get("description") or ""),
        "tool": str((alert.get("tool") or {}).get("name") or ""),
        "path": str(loc.get("path") or ""),
        "line": int(loc.get("start_line") or 0),
        "message": message[:MESSAGE_CHARS],
        "created": str(alert.get("created_at") or "")[:10],
        "url": str(alert.get("html_url") or ""),
    }


def alert_file(s: dict) -> str:
    n = s["number"]
    return "\n".join([
        f"# Code-scanning alert #{n}: {s['rule']}",
        "",
        f"- Severity: {s['severity']}",
        f"- Tool: {s['tool']}",
        f"- Rule: `{s['rule']}`: {s['description']}",
        f"- Location: `{s['path']}:{s['line']}`",
        f"- Finding: {s['message']}",
        f"- Open since: {s['created']}",
        f"- Alert page (write access only): {s['url']}",
        "",
        "## To fix",
        "",
        f"1. Claim it: `git ls-remote origin refs/heads/{BRANCH_PREFIX}{n}` prints nothing,",
        f"   then `git checkout -b {BRANCH_PREFIX}{n} origin/main && git push -u origin HEAD`.",
        "   If the push is rejected or the branch exists, someone has it: take the next alert.",
        "2. Fix the root cause with the smallest change that keeps intended behaviour; add or",
        "   update a nearby test. No suppression comments, no skipped or weakened tests.",
        f"3. Land it as usual (CLAUDE.md), PR titled `security: fix code-scanning alert #{n} ({s['rule']})`.",
        "   This file disappears once CodeQL re-scans main and stops reporting the alert.",
        "",
        "A false positive: change no code, and record why in your run record's `notes` so the",
        "owner can dismiss it. An unused claim branch expires after 48h (branch_cleanup.py),",
        "after which the alert is offered again until it is dismissed.",
        "",
    ])


def render(alerts: list[dict]) -> dict[str, str]:
    """Every file the queue branch should hold, keyed by path."""
    todo = [summarise(a) for a in alerts if a.get("state") == "open"]
    todo.sort(key=lambda s: (RANK.get(s["severity"], 5), s["number"]))
    files = {f"alerts/{s['number']}.md": alert_file(s) for s in todo}
    lines = [
        "# Security queue",
        "",
        "Open code-scanning alerts, most severe then oldest first. Generated hourly by",
        "`.github/workflows/security-alert-queue.yml` from `platform/ci/security_alerts.py`;",
        "do not edit by hand. Take the first one whose claim branch",
        f"(`{BRANCH_PREFIX}<n>`) does not exist; its file says how.",
        "",
    ]
    lines += [f"- [{s['severity']}] #{s['number']} `{s['rule']}` in `{s['path']}:{s['line']}`: "
              f"alerts/{s['number']}.md" for s in todo] or ["Empty: no open alerts."]
    files["QUEUE.md"] = "\n".join(lines) + "\n"
    return files


def write_tree(out: Path, files: dict[str, str]) -> None:
    """Replace the queue files under `out`, leaving `.git` alone."""
    shutil.rmtree(out / "alerts", ignore_errors=True)
    for rel, text in files.items():
        path = out / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


def fetch_alerts(repo: str, token: str) -> list[dict]:
    alerts: list[dict] = []
    for page in range(1, 51):
        req = urllib.request.Request(
            f"{API}/repos/{repo}/code-scanning/alerts?state=open&per_page=100&page={page}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
                     "X-GitHub-Api-Version": "2022-11-28"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            batch = json.load(resp)
        alerts.extend(batch)
        if len(batch) < 100:
            break
    return alerts


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""))
    ap.add_argument("--out", required=True, type=Path, help="checkout of the queue branch")
    args = ap.parse_args(argv)
    token = os.environ.get("GITHUB_TOKEN", "")
    if not (args.repo and token):
        print("GITHUB_REPOSITORY and GITHUB_TOKEN are required", file=sys.stderr)
        return 2
    try:
        alerts = fetch_alerts(args.repo, token)
    except urllib.error.HTTPError as e:
        # 404: code scanning is not enabled; 403: the token lacks security-events.
        # Leave the queue as it is rather than empty it on a read failure.
        print(f"::warning::code-scanning alerts unreadable (HTTP {e.code}); queue left as is")
        return 0
    files = render(alerts)
    write_tree(args.out, files)
    print(files["QUEUE.md"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
