#!/usr/bin/env python3
"""Find GitHub Actions jobs with no `timeout-minutes`, i.e. jobs that can hang
for the 360-minute default and bill every minute of it.

    python3 check.py                       # scan .github/workflows under .
    python3 check.py /path/to/repo         # scan a specific checkout
    python3 check.py ci.yml                # scan one workflow file
    python3 check.py --format json         # machine-readable
    python3 check.py --fail-on-risk        # exit 2 if any finding exists

## The two shapes this catches

A hosted-runner job that never sets `timeout-minutes` is cancelled only after
GitHub's default of 360 minutes (six hours). A test that deadlocks, a
dependency download that stalls or a step waiting on a prompt then costs six
hours of runner time instead of a few minutes -- and on a private repository
those minutes are metered, with documented multipliers for Windows and macOS
runners.

**1. `job-missing-timeout`** -- a job that runs on a runner (`runs-on:`) and
has no job-level `timeout-minutes:` at all.

**2. `job-timeout-at-default`** -- a job whose `timeout-minutes:` is 360 or
more. That is the default restated: it looks like a guard and is not one.

A job that calls a reusable workflow (`uses:` at job level) is skipped --
`timeout-minutes` is not accepted there; the called workflow's own jobs are
the ones that need it. A numeric step-level `timeout-minutes` does not count
as a job-level one.

## What this tool actually does, and does not do

A static, read-only, line-oriented scanner over `.github/workflows/*.yml` and
`*.yaml` files already on disk. It makes **no network calls of any kind**. It
is not a YAML parser (a small indentation-aware line scan, the same design
choice the other actions-* checkers make): block-style `jobs:` mappings only,
and a `timeout-minutes` set through an expression (`${{ ... }}`) is trusted
rather than evaluated. It suggests no particular value for your jobs and
makes no claim about what any run actually costs -- the minute figures in a
finding are an upper bound from GitHub's default limit and documented
multipliers, which you should check against GitHub's current billing page.

Exit status: 0 normally (even with findings, unless --fail-on-risk), 2 if
--fail-on-risk was given and at least one finding exists.
"""

import argparse
import json
import re
import sys
from pathlib import Path

JOB_MISSING_TIMEOUT = "job-missing-timeout"
JOB_TIMEOUT_AT_DEFAULT = "job-timeout-at-default"

RISK_CLASSIFICATIONS = frozenset({JOB_MISSING_TIMEOUT, JOB_TIMEOUT_AT_DEFAULT})

DEFAULT_TIMEOUT_MINUTES = 360

_JOBS_RE = re.compile(r"^jobs:\s*(?:#.*)?$")
_KEY_RE = re.compile(r"^(?P<indent> *)(?P<key>[\"']?[A-Za-z0-9_.-]+[\"']?):\s*(?P<value>.*?)\s*$")
_TIMEOUT_NUMBER_RE = re.compile(r"^[\"']?(\d+)[\"']?\s*(?:#.*)?$")

_REMEDIATION = (
    "Add a job-level timeout-minutes a few times longer than the job normally takes "
    "(for example 15 for a test job, 30 for a build), so a hung run is cancelled in "
    "minutes instead of billing until GitHub's 360-minute default."
)

_AT_DEFAULT_REMEDIATION = (
    "timeout-minutes of 360 or more is GitHub's own default restated, so it limits "
    "nothing. Set it a few times longer than the job normally takes (for example 15 "
    "for a test job, 30 for a build)."
)


def line_indent(line):
    return len(line) - len(line.lstrip(" "))


def _is_blank_or_comment(line):
    stripped = line.strip()
    return stripped == "" or stripped.startswith("#")


def _strip_comment(value):
    return re.sub(r"\s+#.*$", "", value).strip()


def _billing_note(runs_on, job_text):
    """Describe the worst case for one hung job from its runner label."""
    haystack = (runs_on + "\n" + job_text if "${{" in runs_on else runs_on).lower()
    if "self-hosted" in haystack:
        return "self-hosted runner: not metered by GitHub, but a hung run holds that runner for up to 360 min"
    multiplier = 1
    if "macos" in haystack:
        multiplier = 10
    elif "windows" in haystack:
        multiplier = 2
    if multiplier == 1:
        return "up to 360 billed min per hung run"
    return f"up to 360 min x {multiplier} = {360 * multiplier:,} billed min per hung run on private repositories"


def scan_text(text, filename="<workflow>"):
    """Scan one workflow file's text. Returns a list of finding dicts."""
    findings = []
    lines = text.splitlines()

    jobs_at = None
    for i, line in enumerate(lines):
        if _JOBS_RE.match(line):
            jobs_at = i
            break
    if jobs_at is None:
        return findings

    # Collect the lines belonging to the jobs mapping.
    body = []
    for i in range(jobs_at + 1, len(lines)):
        line = lines[i]
        if _is_blank_or_comment(line):
            body.append((i + 1, line))
            continue
        if line_indent(line) == 0:
            break
        body.append((i + 1, line))

    job_indent = None
    for _, line in body:
        if not _is_blank_or_comment(line):
            job_indent = line_indent(line)
            break
    if job_indent is None:
        return findings

    # Split into per-job blocks.
    blocks = []
    current = None
    for lineno, line in body:
        if _is_blank_or_comment(line):
            if current is not None:
                current["lines"].append((lineno, line))
            continue
        indent = line_indent(line)
        match = _KEY_RE.match(line)
        if indent == job_indent and match:
            current = {"name": match.group("key").strip("\"'"), "line": lineno, "lines": []}
            blocks.append(current)
        elif current is not None:
            current["lines"].append((lineno, line))

    for block in blocks:
        prop_indent = None
        for _, line in block["lines"]:
            if not _is_blank_or_comment(line):
                prop_indent = line_indent(line)
                break
        if prop_indent is None or prop_indent <= job_indent:
            continue

        runs_on = None
        timeout = None
        is_call = False
        for _, line in block["lines"]:
            if _is_blank_or_comment(line) or line_indent(line) != prop_indent:
                continue
            match = _KEY_RE.match(line)
            if not match:
                continue
            key = match.group("key")
            value = _strip_comment(match.group("value"))
            if key == "runs-on":
                runs_on = value
            elif key == "timeout-minutes":
                timeout = value
            elif key == "uses":
                is_call = True

        if is_call or runs_on is None:
            continue

        job_text = "\n".join(line for _, line in block["lines"])
        detail_head = f"job '{block['name']}'" + (f" (runs-on: {runs_on})" if runs_on else "")

        if timeout is None:
            findings.append(
                {
                    "file": filename,
                    "line": block["line"],
                    "type": JOB_MISSING_TIMEOUT,
                    "detail": f"{detail_head}: no timeout-minutes; {_billing_note(runs_on, job_text)}",
                    "remediation": _REMEDIATION,
                }
            )
            continue

        number = _TIMEOUT_NUMBER_RE.match(timeout)
        if number and int(number.group(1)) >= DEFAULT_TIMEOUT_MINUTES:
            findings.append(
                {
                    "file": filename,
                    "line": block["line"],
                    "type": JOB_TIMEOUT_AT_DEFAULT,
                    "detail": f"{detail_head}: timeout-minutes: {number.group(1)}; {_billing_note(runs_on, job_text)}",
                    "remediation": _AT_DEFAULT_REMEDIATION,
                }
            )

    return findings


def discover_workflow_files(root):
    """`.github/workflows/*.yml` and `*.yaml` under root, sorted for stable output.

    A path to a single `.yml`/`.yaml` file scans just that file.
    """
    if Path(root).is_file() and Path(root).suffix in (".yml", ".yaml"):
        return [Path(root)]
    workflows_dir = Path(root) / ".github" / "workflows"
    if not workflows_dir.is_dir():
        return []
    files = list(workflows_dir.glob("*.yml")) + list(workflows_dir.glob("*.yaml"))
    return sorted(files)


def scan_path(root):
    """Scan every workflow file under root. Returns a flat list of findings."""
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

    missing = [f for f in findings if f["type"] == JOB_MISSING_TIMEOUT]
    at_default = [f for f in findings if f["type"] == JOB_TIMEOUT_AT_DEFAULT]

    lines = []
    for group in (missing, at_default):
        for f in group:
            lines.append(f"!! {f['file']}:{f['line']}  {f['type']}")
            lines.append(f"     job: {f['detail']}")
            lines.append(f"     fix: {f['remediation']}")
            lines.append("")

    lines.append(
        f"{len(missing)} job-missing-timeout finding(s), "
        f"{len(at_default)} job-timeout-at-default finding(s)."
    )
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "path", nargs="?", default=".", help="repo directory, or one workflow .yml/.yaml file (default: current directory)"
    )
    parser.add_argument(
        "--format", choices=("text", "json"), default="text", help="output format"
    )
    parser.add_argument(
        "--fail-on-risk",
        action="store_true",
        help="exit 2 when any finding exists",
    )
    args = parser.parse_args(argv)

    findings = scan_path(args.path)

    if args.format == "json":
        print(json.dumps(findings, indent=2))
    else:
        print(render_text(findings, args.path))

    if args.fail_on_risk and has_risk(findings):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
