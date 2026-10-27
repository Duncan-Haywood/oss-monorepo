#!/usr/bin/env python3
"""Find GitHub Actions jobs and steps that set `continue-on-error: true`, i.e.
places where a failure is swallowed and the workflow run still goes green.

    python3 check.py                       # scan .github/workflows under .
    python3 check.py /path/to/repo         # scan a specific checkout
    python3 check.py ci.yml                # scan one workflow file
    python3 check.py --format json         # machine-readable
    python3 check.py --fail-on-risk        # exit 2 if any finding exists

## The two shapes this catches

**1. `job-continue-on-error`** -- a job with a literal job-level
`continue-on-error: true`. The job can fail and the workflow run is still
reported as successful, so a required status check built on it never blocks.

**2. `step-continue-on-error`** -- a step with a literal
`continue-on-error: true`. The step's failure is recorded as a warning-level
outcome and the job carries on to a green result.

Both are sometimes right (an experimental matrix leg, a best-effort upload).
The tool lists them so each one is a decision, not an accident. An expression
(`continue-on-error: ${{ matrix.experimental }}`) is trusted, not evaluated,
and not flagged.

## What this tool actually does, and does not do

A static, read-only, line-oriented scanner over `.github/workflows/*.yml` and
`*.yaml` files already on disk. No network calls. It is not a YAML parser
(block-style mappings only, the same design as the other actions-* checkers).
It does not judge whether a given use is wrong.

Exit status: 0 normally, 2 if --fail-on-risk was given and a finding exists.
"""

import argparse
import json
import re
import sys
from pathlib import Path

JOB_COE = "job-continue-on-error"
STEP_COE = "step-continue-on-error"
RISK_CLASSIFICATIONS = frozenset({JOB_COE, STEP_COE})

_JOBS_RE = re.compile(r"^jobs:\s*(?:#.*)?$")
_KEY_RE = re.compile(r"^(?P<indent> *)(?:- +)?(?P<key>[\"']?[A-Za-z0-9_.-]+[\"']?):\s*(?P<value>.*?)\s*$")
_TRUE_RE = re.compile(r"^[\"']?true[\"']?$", re.IGNORECASE)

_JOB_FIX = (
    "Remove it, or scope it to the one leg that may fail (continue-on-error on a matrix "
    "entry via an expression). A required check on this job can never go red while it is set."
)
_STEP_FIX = (
    "Remove it and let the step fail, or keep it and say why in a comment. If the step is "
    "best-effort, nothing downstream should rely on its output."
)


def line_indent(line):
    return len(line) - len(line.lstrip(" "))


def _blank(line):
    s = line.strip()
    return s == "" or s.startswith("#")


def _strip_comment(value):
    return re.sub(r"\s+#.*$", "", value).strip()


def scan_text(text, filename="<workflow>"):
    findings = []
    lines = text.splitlines()
    jobs_at = next((i for i, l in enumerate(lines) if _JOBS_RE.match(l)), None)
    if jobs_at is None:
        return findings

    body = []
    for i in range(jobs_at + 1, len(lines)):
        if not _blank(lines[i]) and line_indent(lines[i]) == 0:
            break
        body.append((i + 1, lines[i]))

    job_indent = next((line_indent(l) for _, l in body if not _blank(l)), None)
    if job_indent is None:
        return findings

    blocks, current = [], None
    for lineno, line in body:
        if _blank(line):
            if current is not None:
                current["lines"].append((lineno, line))
            continue
        m = _KEY_RE.match(line)
        if line_indent(line) == job_indent and m and not line.lstrip().startswith("- "):
            current = {"name": m.group("key").strip("\"'"), "line": lineno, "lines": []}
            blocks.append(current)
        elif current is not None:
            current["lines"].append((lineno, line))

    for block in blocks:
        prop_indent = next((line_indent(l) for _, l in block["lines"] if not _blank(l)), None)
        if prop_indent is None or prop_indent <= job_indent:
            continue
        for lineno, line in block["lines"]:
            if _blank(line):
                continue
            m = _KEY_RE.match(line)
            if not m or m.group("key") != "continue-on-error":
                continue
            if not _TRUE_RE.match(_strip_comment(m.group("value"))):
                continue
            if line_indent(line) == prop_indent and not line.lstrip().startswith("- "):
                kind, fix, where = JOB_COE, _JOB_FIX, f"job '{block['name']}'"
            elif line_indent(line) > prop_indent:
                kind, fix, where = STEP_COE, _STEP_FIX, f"a step in job '{block['name']}'"
            else:
                continue
            findings.append(
                {
                    "file": filename,
                    "line": lineno,
                    "type": kind,
                    "detail": f"{where}: continue-on-error: true",
                    "remediation": fix,
                }
            )
    return findings


def discover_workflow_files(root):
    if Path(root).is_file() and Path(root).suffix in (".yml", ".yaml"):
        return [Path(root)]
    d = Path(root) / ".github" / "workflows"
    if not d.is_dir():
        return []
    return sorted(list(d.glob("*.yml")) + list(d.glob("*.yaml")))


def scan_path(root):
    findings = []
    for path in discover_workflow_files(root):
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            print(f"warning: could not read {path}: {exc}", file=sys.stderr)
            continue
        findings.extend(scan_text(text, filename=str(path)))
    return findings


def has_risk(findings):
    return any(f["type"] in RISK_CLASSIFICATIONS for f in findings)


def render_text(findings, root):
    if not findings:
        files = discover_workflow_files(root)
        if not files:
            return "No .github/workflows/*.yml or *.yaml files found under " + str(root)
        return f"Scanned {len(files)} workflow file(s); no findings."
    out = []
    for f in sorted(findings, key=lambda f: (f["type"] != JOB_COE, f["file"], f["line"])):
        out += [f"!! {f['file']}:{f['line']}  {f['type']}", f"     {f['detail']}", f"     fix: {f['remediation']}", ""]
    jobs = sum(f["type"] == JOB_COE for f in findings)
    out.append(f"{jobs} job-continue-on-error finding(s), {len(findings) - jobs} step-continue-on-error finding(s).")
    return "\n".join(out)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("path", nargs="?", default=".", help="repo directory, or one workflow file")
    p.add_argument("--format", choices=("text", "json"), default="text")
    p.add_argument("--fail-on-risk", action="store_true", help="exit 2 when any finding exists")
    args = p.parse_args(argv)
    findings = scan_path(args.path)
    print(json.dumps(findings, indent=2) if args.format == "json" else render_text(findings, args.path))
    return 2 if args.fail_on_risk and has_risk(findings) else 0


if __name__ == "__main__":
    sys.exit(main())
