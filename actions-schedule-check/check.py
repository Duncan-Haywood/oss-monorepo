#!/usr/bin/env python3
"""Find GitHub Actions `schedule:` cron entries that are invalid, faster than
GitHub will run them, or pinned to the top of the hour.

    python3 check.py                       # scan .github/workflows under .
    python3 check.py /path/to/repo         # scan a specific checkout
    python3 check.py --format json         # machine-readable
    python3 check.py --fail-on-risk        # exit 2 if any finding exists

## The three shapes this catches

**1. `cron-invalid`** -- an entry that is not five fields, or has a number
outside its field's range (minute 0-59, hour 0-23, day of month 1-31, month
1-12, day of week 0-6). A six-field "seconds" cron, copied from Quartz or
Spring, is the usual cause. GitHub rejects the workflow file or never
schedules the entry.

**2. `cron-faster-than-5-minutes`** -- a minute field of `*` or a step under
5 (`*/1` ... `*/4`). GitHub documents 5 minutes as the shortest interval it
supports, so the entry cannot run as often as written.

**3. `cron-top-of-hour`** -- a minute field of exactly `0`. GitHub documents
that scheduled runs can be delayed, and may be dropped, during periods of high
load, and names the start of every hour as a high-load time. Moving to an odd
minute is the documented mitigation.

## What this tool actually does, and does not do

A static, read-only, line-oriented scanner over `.github/workflows/*.yml` and
`*.yaml` files already on disk. It makes **no network calls of any kind**. It
is not a YAML parser: it reads every `- cron: '<expr>'` line, quoted or not,
and ignores the rest of the file. Only numeric fields are understood, so a name
(`MON`, `JAN`) or an `@daily` macro is reported as invalid; check those by
hand against GitHub's docs. It makes no claim about when a run will actually
start; cron times are UTC, and GitHub's own docs are the authority on delays.

Exit status: 0 normally (even with findings, unless --fail-on-risk), 2 if
--fail-on-risk was given and at least one finding exists.
"""

import argparse
import json
import re
import sys
from pathlib import Path

CRON_INVALID = "cron-invalid"
CRON_TOO_FREQUENT = "cron-faster-than-5-minutes"
CRON_TOP_OF_HOUR = "cron-top-of-hour"

RISK_CLASSIFICATIONS = frozenset({CRON_INVALID, CRON_TOO_FREQUENT, CRON_TOP_OF_HOUR})

MIN_INTERVAL_MINUTES = 5

# (name, low, high) for the five fields, in order.
_FIELDS = (
    ("minute", 0, 59),
    ("hour", 0, 23),
    ("day of month", 1, 31),
    ("month", 1, 12),
    ("day of week", 0, 6),
)

_CRON_LINE_RE = re.compile(r"^\s*-?\s*cron:\s*(?P<value>.*?)\s*$")
_NUMBER_RE = re.compile(r"^\d+$")

_INVALID_REMEDIATION = (
    "Use exactly five space-separated fields: minute hour day-of-month month "
    "day-of-week, each inside its range. GitHub cron has no seconds field."
)
_FREQUENT_REMEDIATION = (
    "GitHub's shortest supported schedule interval is 5 minutes. Use */5 or "
    "slower, or trigger the work another way (workflow_dispatch, a webhook)."
)
_TOP_OF_HOUR_REMEDIATION = (
    "Scheduled runs can be delayed or dropped at the start of the hour, when "
    "load is highest. Pick an off-peak minute such as 17 or 43."
)


def _unquote(value):
    value = re.sub(r"\s+#.*$", "", value).strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    return value.strip()


def _check_number(token, low, high):
    return bool(_NUMBER_RE.match(token)) and low <= int(token) <= high


def _field_problem(field, low, high):
    """Return a short reason string if one cron field is malformed, else None."""
    for part in field.split(","):
        if part == "":
            return "empty list item"
        base, _, step = part.partition("/")
        if "/" in part and not (_NUMBER_RE.match(step) and int(step) >= 1):
            return f"bad step '{step}'"
        if base == "*":
            continue
        for end in base.split("-", 1) if "-" in base else [base]:
            if not _check_number(end, low, high):
                return f"'{end}' is not a number from {low} to {high}"
    return None


def classify_cron(expr):
    """Return (type, detail, remediation) findings for one cron expression."""
    fields = expr.split()
    if len(fields) != 5:
        return [(CRON_INVALID, f"'{expr}' has {len(fields)} field(s), GitHub needs 5", _INVALID_REMEDIATION)]
    problems = []
    for (name, low, high), field in zip(_FIELDS, fields):
        reason = _field_problem(field, low, high)
        if reason:
            problems.append(f"{name} field '{field}': {reason}")
    if problems:
        return [(CRON_INVALID, f"'{expr}': " + "; ".join(problems), _INVALID_REMEDIATION)]

    minute = fields[0]
    base, _, step = minute.partition("/")
    if base == "*" and (not step or int(step) < MIN_INTERVAL_MINUTES):
        every = int(step) if step else 1
        return [(CRON_TOO_FREQUENT, f"'{expr}' asks for every {every} minute(s)", _FREQUENT_REMEDIATION)]
    if "-" in base and step and int(step) < MIN_INTERVAL_MINUTES:
        return [(CRON_TOO_FREQUENT, f"'{expr}' steps every {step} minute(s)", _FREQUENT_REMEDIATION)]
    if minute.lstrip("0") == "":
        return [(CRON_TOP_OF_HOUR, f"'{expr}' runs at minute 0, the busiest minute of the hour", _TOP_OF_HOUR_REMEDIATION)]
    return []


def scan_text(text, filename="<workflow>"):
    """Scan one workflow file's text. Returns a list of finding dicts."""
    findings = []
    for i, line in enumerate(text.splitlines(), start=1):
        match = _CRON_LINE_RE.match(line)
        if not match or line.lstrip().startswith("#"):
            continue
        expr = _unquote(match.group("value"))
        if not expr:
            continue
        for kind, detail, remediation in classify_cron(expr):
            findings.append(
                {"file": filename, "line": i, "type": kind, "detail": detail, "remediation": remediation}
            )
    return findings


def discover_workflow_files(root):
    """`.github/workflows/*.yml` and `*.yaml` under root, sorted for stable output."""
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

    lines = []
    counts = []
    for kind in (CRON_INVALID, CRON_TOO_FREQUENT, CRON_TOP_OF_HOUR):
        group = [f for f in findings if f["type"] == kind]
        counts.append(f"{len(group)} {kind} finding(s)")
        for f in group:
            lines.append(f"!! {f['file']}:{f['line']}  {f['type']}")
            lines.append(f"     cron: {f['detail']}")
            lines.append(f"     fix: {f['remediation']}")
            lines.append("")
    lines.append(", ".join(counts) + ".")
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("path", nargs="?", default=".", help="directory to scan (default: current directory)")
    parser.add_argument("--format", choices=("text", "json"), default="text", help="output format")
    parser.add_argument("--fail-on-risk", action="store_true", help="exit 2 when any finding exists")
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
