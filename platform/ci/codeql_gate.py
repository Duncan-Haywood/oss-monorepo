#!/usr/bin/env python3
"""Fail a pull request whose own lines carry a CodeQL security finding.

Owner, 2026-11-24: "fix new ones before they hit main". `.github/workflows/codeql.yml`
runs CodeQL on every pull request, writes its SARIF output to disk, and then runs this
script on the PR's merge commit. A finding fails the job when both hold:

  * it is serious enough: CodeQL's `security-severity` is 4.0 or more (medium, high,
    critical), or the rule has no such score and its level is `error`;
  * it sits on a line the PR adds or changes (`git diff -U0 <base> HEAD`).

Findings on lines the PR did not touch are printed as warnings and do not fail: they
predate the PR, are already on main, and reach the scheduled agents through the
`security-alerts` queue (`platform/ci/security_alerts.py`). Blocking unrelated work on
them would stall every session without getting them fixed any sooner.

Why a script and not only GitHub's own PR check: agent sessions cannot read
code-scanning alerts (their tokens lack `security-events`), but they can read job logs.
So every failing finding is printed with its rule, file, line, message and what to do,
as an `::error` annotation and in the job summary. The `code_scanning` rule in
`.github/rulesets/main.json` is the platform-side half of the same gate.

`evaluate()` is pure and unit-tested (`test_codeql_gate.py`).

Usage (in Actions, after github/codeql-action/analyze with `output: sarif`):
    python3 platform/ci/codeql_gate.py --sarif sarif --base HEAD^1
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

FAIL_SCORE = 4.0  # CVSS-style: 4.0 medium, 7.0 high, 9.0 critical
HUNK = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")


def changed_lines(diff: str) -> dict[str, set[int]]:
    """Map each file in a `git diff -U0` to the line numbers it adds or changes."""
    out: dict[str, set[int]] = {}
    path = None
    for line in diff.splitlines():
        if line.startswith("+++ "):
            target = line[4:]
            path = None if target == "/dev/null" else target[2:] if target.startswith("b/") else target
            if path is not None:
                out.setdefault(path, set())
        elif path is not None and (m := HUNK.match(line)):
            start, count = int(m.group(1)), int(m.group(2) or 1)
            out[path].update(range(start, start + count))
    return out


def _rules(run: dict) -> dict[str, dict]:
    tool = run.get("tool") or {}
    rules: dict[str, dict] = {}
    for comp in [tool.get("driver") or {}] + list(tool.get("extensions") or []):
        for rule in comp.get("rules") or []:
            if rule.get("id"):
                rules[rule["id"]] = rule
    return rules


def score(rule: dict) -> float | None:
    raw = (rule.get("properties") or {}).get("security-severity")
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def label(s: float | None) -> str:
    if s is None:
        return "no score"
    return "critical" if s >= 9 else "high" if s >= 7 else "medium" if s >= 4 else "low"


def findings(sarif: dict) -> list[dict]:
    """Flatten a SARIF document into one dict per result with a location."""
    out = []
    for run in sarif.get("runs") or []:
        rules = _rules(run)
        for res in run.get("results") or []:
            if res.get("suppressions"):
                continue
            rule_id = res.get("ruleId") or (res.get("rule") or {}).get("id") or ""
            rule = rules.get(rule_id, {})
            locs = res.get("locations") or []
            phys = (locs[0].get("physicalLocation") or {}) if locs else {}
            path = (phys.get("artifactLocation") or {}).get("uri") or ""
            line = int((phys.get("region") or {}).get("startLine") or 0)
            level = res.get("level") or (rule.get("defaultConfiguration") or {}).get("level") or "warning"
            name = rule.get("shortDescription", {}).get("text") or rule.get("name") or rule_id
            out.append({
                "rule": rule_id, "name": name, "path": path, "line": line, "level": level,
                "score": score(rule), "message": " ".join(str((res.get("message") or {}).get("text") or "").split()),
                "help": (rule.get("helpUri") or ""),
            })
    return out


def blocking(f: dict) -> bool:
    if f["score"] is not None:
        return f["score"] >= FAIL_SCORE
    return f["level"] == "error"


def evaluate(results: list[dict], changed: dict[str, set[int]]) -> tuple[list[dict], list[dict]]:
    """(failures, warnings): serious findings on changed lines fail; the rest warn."""
    fail, warn = [], []
    for f in results:
        if not blocking(f):
            continue
        (fail if f["line"] in changed.get(f["path"], ()) else warn).append(f)
    key = lambda f: (-(f["score"] or 0), f["path"], f["line"])  # noqa: E731
    return sorted(fail, key=key), sorted(warn, key=key)


def esc_data(text: str) -> str:
    """Escape a workflow-command message."""
    return text.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def esc(text: str) -> str:
    """Escape a workflow-command property value."""
    return esc_data(text).replace(",", "%2C").replace(":", "%3A")


def report(fail: list[dict], warn: list[dict]) -> str:
    lines = ["## CodeQL gate", ""]
    if fail:
        lines += [f"**{len(fail)} security finding(s) on lines this PR adds or changes. Fix them before merging.**", "",
                  "Fix the root cause (validate, escape, parameterise, pin); add a test where one fits. "
                  "No `codeql[...]`/`lgtm` suppression comments and no weakened tests. A false positive: "
                  "say why in the PR body and the run record's `notes`; the owner dismisses it.", ""]
        lines += [f"- [{label(f['score'])}] `{f['rule']}` at `{f['path']}:{f['line']}`: {f['message']}"
                  + (f" ({f['help']})" if f['help'] else "") for f in fail]
    else:
        lines.append("No medium-or-worse CodeQL finding on lines this PR adds or changes.")
    if warn:
        lines += ["", f"{len(warn)} older finding(s) in files outside this PR's changed lines "
                  "(already on main; queued on the `security-alerts` branch):", ""]
        lines += [f"- [{label(f['score'])}] `{f['rule']}` at `{f['path']}:{f['line']}`" for f in warn[:50]]
        if len(warn) > 50:
            lines.append(f"- ... and {len(warn) - 50} more")
    return "\n".join(lines) + "\n"


def load_sarif(path: Path) -> list[dict]:
    files = sorted(path.glob("*.sarif")) if path.is_dir() else [path]
    out: list[dict] = []
    for p in files:
        out.extend(findings(json.loads(p.read_text(encoding="utf-8"))))
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--sarif", required=True, type=Path, help="SARIF file or directory of them")
    ap.add_argument("--base", default="HEAD^1", help="commit to diff against (default: the merge commit's base parent)")
    args = ap.parse_args(argv)
    diff = subprocess.run(["git", "diff", "-U0", "--no-color", "--no-ext-diff", args.base, "HEAD"],
                          check=True, capture_output=True, text=True).stdout
    fail, warn = evaluate(load_sarif(args.sarif), changed_lines(diff))
    text = report(fail, warn)
    print(text)
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(text)
    for f in fail:
        print(f"::error file={esc(f['path'])},line={f['line']},title={esc('CodeQL ' + f['rule'])}::{esc_data(f['message'])}")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
