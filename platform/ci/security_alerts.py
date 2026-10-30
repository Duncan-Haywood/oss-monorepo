#!/usr/bin/env python3
"""Mirror open code-scanning alerts into `security-alert` issues for the agent queue.

Scheduled agent sessions cannot read code-scanning alerts: the alerts API
needs a token with `security-events`, and a session's GitHub tools have no
such scope. Issues they can read. So `.github/workflows/security-alert-queue.yml`
runs this hourly with the workflow's own token, and `prompt.md` ("0. Security
alerts first") sends the next scheduled session to the oldest, most severe
open one (owner, 2026-10-30: fix "the security scan results from github as
they come up" as "a work distribution thing from the normally scheduled
agents"). No model is called and nothing is billed beyond a few seconds of
Actions.

One issue per alert, found again by the marker `<!-- code-scanning-alert:<n> -->`
in its body:

  alert open, no issue      -> open one, labelled `security-alert`.
  issue open, alert closed  -> close it (completed when fixed, not planned
                               when dismissed), so the queue empties itself
                               once a fix lands and CodeQL re-scans main.

Only code-scanning alerts are reachable: a workflow token has no permission
that reads Dependabot or secret-scanning alerts. Dependabot's own security
updates (a repository setting) cover the first; a leaked secret needs
rotating by the owner.

`plan()` holds the policy and touches no network, so it is unit-tested.

Usage (in Actions; GITHUB_TOKEN and GITHUB_REPOSITORY come from the runner):
    python3 platform/ci/security_alerts.py [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

API = "https://api.github.com"
LABEL = "security-alert"
MARKER_RE = re.compile(r"<!-- code-scanning-alert:(\d+) -->")
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
        "url": str(alert.get("html_url") or ""),
    }


def issue_title(s: dict) -> str:
    return f"security: code-scanning alert #{s['number']} [{s['severity']}] {s['rule']} in {s['path']}"


def issue_body(s: dict) -> str:
    return "\n".join([
        f"<!-- code-scanning-alert:{s['number']} -->",
        f"**{s['tool']}** rule `{s['rule']}` ({s['severity']}): {s['description']}",
        "",
        f"- Location: `{s['path']}:{s['line']}`",
        f"- Finding: {s['message']}",
        f"- Alert: {s['url']} (visible to people with write access)",
        "",
        "Queued for the next scheduled agent session (`prompt.md`, \"0. Security alerts first\").",
        "To take it: search open PRs for `code-scanning alert #%d` in:title; if none, fix the root"
        % s["number"],
        "cause, open a PR titled `security: fix code-scanning alert #%d (%s)` right after your first"
        % (s["number"], s["rule"]),
        "push, and write `Fixes #<this issue>` in its body. No suppression comments, no skipped tests.",
        "A false positive: say why in a comment here and leave the dismissal to the owner.",
        "",
        "This issue closes itself once CodeQL stops reporting the alert "
        "(`.github/workflows/security-alert-queue.yml`).",
    ])


def plan(alerts: list[dict], issues: list[dict]) -> tuple[list[dict], list[tuple[dict, str]]]:
    """Alerts that need an issue opened (most severe, then oldest, first) and
    issues to close with their state_reason."""
    by_alert: dict[int, dict] = {}
    for issue in issues:
        m = MARKER_RE.search(issue.get("body") or "")
        if m:
            by_alert[int(m.group(1))] = issue
    open_alerts = {int(a["number"]): a for a in alerts if a.get("state") == "open"}
    to_open = [summarise(a) for n, a in open_alerts.items() if n not in by_alert]
    to_open.sort(key=lambda s: (RANK.get(s["severity"], 5), s["number"]))
    states = {int(a["number"]): a.get("state") for a in alerts}
    to_close = [(issue, "not_planned" if states.get(n) == "dismissed" else "completed")
                for n, issue in sorted(by_alert.items()) if n not in open_alerts]
    return to_open, to_close


def _call(method: str, url: str, token: str, data: dict | None = None):
    req = urllib.request.Request(url, method=method, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }, data=json.dumps(data).encode() if data is not None else None)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def _paged(url: str, token: str) -> list[dict]:
    out: list[dict] = []
    for page in range(1, 51):
        batch = _call("GET", f"{url}&per_page=100&page={page}", token)
        out.extend(batch)
        if len(batch) < 100:
            break
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    token = os.environ.get("GITHUB_TOKEN", "")
    if not (args.repo and token):
        print("GITHUB_REPOSITORY and GITHUB_TOKEN are required", file=sys.stderr)
        return 2
    base = f"{API}/repos/{args.repo}"
    try:
        # All states, so a closed issue can say whether its alert was fixed or dismissed.
        alerts = _paged(f"{base}/code-scanning/alerts?sort=created", token)
    except urllib.error.HTTPError as e:
        # 404: code scanning is not enabled; 403: the token lacks security-events.
        print(f"::warning::code-scanning alerts unreadable (HTTP {e.code}); queue left as is")
        return 0
    issues = [i for i in _paged(f"{base}/issues?state=open&labels={LABEL}", token)
              if "pull_request" not in i]
    to_open, to_close = plan(alerts, issues)
    print(f"{sum(a.get('state') == 'open' for a in alerts)} open alert(s); "
          f"opening {len(to_open)} issue(s), closing {len(to_close)}.")
    if args.dry_run:
        for s in to_open:
            print("  open ", issue_title(s))
        for issue, reason in to_close:
            print(f"  close #{issue['number']} ({reason})")
        return 0
    if to_open:
        try:
            _call("POST", f"{base}/labels", token, {"name": LABEL, "color": "b60205",
                  "description": "Open code-scanning alert queued for an agent"})
        except urllib.error.HTTPError as e:
            if e.code != 422:  # 422: the label already exists
                raise
    for s in to_open:
        made = _call("POST", f"{base}/issues", token,
                     {"title": issue_title(s), "body": issue_body(s), "labels": [LABEL]})
        print(f"  opened #{made['number']}: {issue_title(s)}")
    for issue, reason in to_close:
        _call("PATCH", f"{base}/issues/{issue['number']}", token,
              {"state": "closed", "state_reason": reason})
        print(f"  closed #{issue['number']} ({reason})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
