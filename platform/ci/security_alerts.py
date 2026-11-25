#!/usr/bin/env python3
"""Write open code-scanning alerts out as files, the scheduled agents' security queue.

Scheduled agent sessions cannot read code-scanning alerts: the alerts API
needs a token with `security-events`, and a session's GitHub tools have no
such scope. Files they can read. So `.github/workflows/priv-security-alert-queue.yml`
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

False positives: sessions cannot dismiss an alert (no security-events scope),
so until 2026-11-25 every run re-read the same top alerts and found them
harmless. `platform/security/codeql-triage.json` on main lists alerts a session
read and judged false positives, each with a reason. Such an alert leaves the
"take next" list for a "Triaged, awaiting dismissal" section of QUEUE.md (its
file stays, with the reason) until the owner dismisses it. An entry applies
only while number, rule and path all match, so a reused number or a moved
finding returns to the queue, and the file changes only through a reviewed PR.

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
import re
import shutil
import sys
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

API = "https://api.github.com"
BRANCH_PREFIX = "security-fix/code-scanning-"
# CodeQL's security-severity first; rule.severity for tools that set no such level.
RANK = {"critical": 0, "high": 1, "error": 1, "medium": 2, "warning": 2,
        "low": 3, "note": 4}
MESSAGE_CHARS = 600
TRIAGE = Path(__file__).resolve().parents[2] / "platform" / "security" / "codeql-triage.json"
TRIAGE_NOTES = "docs/reports/*security-queue*.md"
SAFE_PATH = re.compile(r"[\w./@+\[\]-]+")


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
        # The commit the alert was last seen on. An alert stays open until CodeQL
        # finishes on a newer main, which can be hours after the fix merges.
        "commit": sha if re.fullmatch(r"[0-9a-f]{40}", sha := str(inst.get("commit_sha") or "")) else "",
    }


def load_triage(path: Path) -> list[dict]:
    """The reviewed false-positive list; a missing or unreadable file means none."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    entries = data.get("false_positives") if isinstance(data, dict) else None
    return [e for e in entries or [] if isinstance(e, dict)]


def triage_reason(s: dict, triage: list[dict]) -> str | None:
    """The reason an alert was judged a false positive, if an entry matches it exactly."""
    for e in triage:
        if (e.get("number") == s["number"] and e.get("rule") == s["rule"]
                and e.get("path") == s["path"] and str(e.get("reason") or "").strip()):
            return " ".join(str(e["reason"]).split())[:MESSAGE_CHARS]
    return None


def stale_check(s: dict) -> list[str]:
    """Step 0 of an alert file: is the finding still on main, or did a later merge fix it?"""
    if not s["commit"]:
        return []
    # Sessions paste this into a shell, so the path goes in only when it cannot break out
    # of the quotes (a file name is repository data, and anyone can propose one in a PR).
    path = f" -- '{s['path']}'" if SAFE_PATH.fullmatch(s["path"]) else ""
    return [
        f"0. Check it is still there. CodeQL last saw it on `{s['commit'][:12]}`; queued CodeQL",
        "   runs on main are replaced by newer pushes and one takes about an hour, so a fix",
        "   merged since then stays listed here. Run",
        f"   `git fetch -q --depth=1 origin {s['commit']} main && git diff --stat {s['commit'][:12]} origin/main{path}`",
        "   (fetching main too: a session's origin/main is as old as its clone):",
        "   no output means the file is unchanged and the finding stands; otherwise read the",
        "   line on main first, and if an earlier fix removed it, take the next alert.",
    ]


def alert_file(s: dict, reason: str | None = None) -> str:
    n = s["number"]
    if reason:
        return "\n".join([
            f"# Code-scanning alert #{n}: {s['rule']} (triaged: false positive)",
            "",
            f"- Location: `{s['path']}:{s['line']}`",
            f"- Finding: {s['message']}",
            f"- Alert page (write access only): {s['url']}",
            f"- Why it is a false positive: {reason}",
            "",
            "Listed in `platform/security/codeql-triage.json`; waiting for the owner to dismiss",
            "it on the alert page. If the reason is wrong, remove the entry in a PR and fix it.",
            "",
        ])
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
        f"- Last seen on commit: `{s['commit'] or 'unknown'}`",
        "",
        "## To fix",
        "",
        *stale_check(s),
        f"1. Claim it: `git ls-remote origin refs/heads/{BRANCH_PREFIX}{n}` prints nothing,",
        f"   then `git checkout -b {BRANCH_PREFIX}{n} origin/main && git push -u origin HEAD`.",
        "   If the push is rejected or the branch exists, someone has it: take the next alert.",
        "2. Fix the root cause with the smallest change that keeps intended behaviour; add or",
        "   update a nearby test. No suppression comments, no skipped or weakened tests.",
        "   Batch: fix every queued alert in the same file (and the same rule in sibling files)",
        "   in this PR, claiming each one's branch too. The first scan found 977 alerts, mostly",
        "   a few regex-sanitisation rules repeated, so one alert per session is too slow.",
        f"3. Land it as usual (CLAUDE.md), PR titled `security: fix code-scanning alert #{n} ({s['rule']})`.",
        "   This file disappears once CodeQL re-scans main and stops reporting the alert.",
        "",
        "A false positive: change no code. Add an entry with the reason to",
        "`platform/security/codeql-triage.json` in your PR, so the queue stops offering it and",
        "the owner can dismiss it. An unused claim branch expires after 48h (branch_cleanup.py),",
        "after which the alert is offered again until it is triaged or dismissed.",
        "",
    ])


def render(alerts: list[dict], triage: list[dict] | None = None) -> dict[str, str]:
    """Every file the queue branch should hold, keyed by path."""
    open_ = [summarise(a) for a in alerts if a.get("state") == "open"]
    open_.sort(key=lambda s: (RANK.get(s["severity"], 5), s["number"]))
    reasons = {s["number"]: triage_reason(s, triage or []) for s in open_}
    todo = [s for s in open_ if not reasons[s["number"]]]
    triaged = [s for s in open_ if reasons[s["number"]]]
    files = {f"alerts/{s['number']}.md": alert_file(s, reasons[s["number"]]) for s in open_}
    lines = [
        "# Security queue",
        "",
        "Open code-scanning alerts, most severe then oldest first. Generated hourly by",
        "`.github/workflows/priv-security-alert-queue.yml` from `platform/ci/security_alerts.py`;",
        "do not edit by hand. Take the first one whose claim branch",
        f"(`{BRANCH_PREFIX}<n>`) does not exist; its file says how.",
        "",
        # Runs re-triaged the same false positives (#7, #12, #42 ...) because nothing here
        # said an earlier run had already read them (2026-11-25 run record, doc_friction).
        f"Triaged already: alerts listed in `platform/security/codeql-triage.json` are moved to the "
        f"section at the end; `{TRIAGE_NOTES}` on main has the longer notes (and alerts already "
        "fixed on main). Skip those; only the owner can dismiss them.",
        "",
    ]
    # The alerts mirror the last *completed* analysis of main, which lags merges by about
    # an hour (a full scan takes that long and newer pushes queue behind it). On
    # 2026-11-25 the queue listed 1,243 alerts, 1,189 in files PR 18676 had already changed
    # (PR 18806 first named the commit; docs/reports/2026-11-25-security-queue-stale-scan.md).
    seen = Counter(s["commit"] for s in todo if s["commit"])
    if seen:
        sha, _ = seen.most_common(1)[0]
        lines += [f"Scanned commit: `{sha[:12]}` (the commit most open alerts were last seen on). "
                  "Fixes merged after it are still listed until CodeQL finishes on a newer main: "
                  f"`git diff --stat {sha[:12]} origin/main -- <path>` before fixing (each alert file says how).",
                  ""]
    lines += [f"- [{s['severity']}] #{s['number']} `{s['rule']}` in `{s['path']}:{s['line']}`: "
              f"alerts/{s['number']}.md" for s in todo] or [
        "Empty: no open alerts awaiting a fix." if triaged else "Empty: no open alerts."]
    if triaged:
        lines += ["", "## Triaged, awaiting dismissal", "",
                  "Read and judged false positives (`platform/security/codeql-triage.json`): not work",
                  "for a session. The owner dismisses each on its alert page.", ""]
        lines += [f"- [{s['severity']}] #{s['number']} `{s['rule']}` in `{s['path']}:{s['line']}`: "
                  f"alerts/{s['number']}.md" for s in triaged]
    files["QUEUE.md"] = "\n".join(lines) + "\n"
    return files


UNAVAILABLE = "Unavailable:"


def unavailable(code: int, detail: str, previous: str) -> str:
    """QUEUE.md when the alerts API cannot be read: a notice, then the last known alerts."""
    cause = {404: "no code-scanning analysis exists, so CodeQL is not running or has not "
                  "finished a first analysis (`.github/workflows/priv-codeql.yml`)",
             403: "the workflow token cannot read code-scanning alerts"}.get(code, "the API refused the read")
    lines = ["# Security queue", "",
             f"{UNAVAILABLE} the alerts API answered HTTP {code}"
             + (f" ({detail})" if detail else "") + f": {cause}. "
             "This is not an empty queue. Fixing the cause is the top security task; "
             "the last known alerts, if any, follow.", ""]
    lines += [ln for ln in previous.split("\n## Triaged", 1)[0].splitlines() if ln.startswith("- [")]
    return "\n".join(lines) + "\n"


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
    ap.add_argument("--triage", type=Path, default=TRIAGE, help="reviewed false-positive list")
    args = ap.parse_args(argv)
    token = os.environ.get("GITHUB_TOKEN", "")
    if not (args.repo and token):
        print("GITHUB_REPOSITORY and GITHUB_TOKEN are required", file=sys.stderr)
        return 2
    try:
        alerts = fetch_alerts(args.repo, token)
    except urllib.error.HTTPError as e:
        # 404: no code-scanning analysis exists (CodeQL is not running); 403: the token
        # lacks security-events. Keep the alert files (a failed read is not a fix) but
        # say so at the top of QUEUE.md and fail the job. Until 2026-11-24 this was a
        # warning on a green job, and the queue sat empty for 581 hourly runs while no
        # analysis existed at all (docs/reports/2026-11-24-codeql-never-ran.md).
        detail = ""
        try:
            detail = str(json.loads(e.read() or b"{}").get("message") or "")
        except (ValueError, AttributeError, OSError):
            pass
        queue = args.out / "QUEUE.md"
        previous = queue.read_text(encoding="utf-8") if queue.exists() else ""
        args.out.mkdir(parents=True, exist_ok=True)
        queue.write_text(unavailable(e.code, detail, previous), encoding="utf-8")
        print(f"::error::code-scanning alerts unreadable (HTTP {e.code}: {detail or e.reason}); "
              "QUEUE.md marked unavailable")
        return 1
    files = render(alerts, load_triage(args.triage))
    write_tree(args.out, files)
    print(files["QUEUE.md"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
