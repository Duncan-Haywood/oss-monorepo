#!/usr/bin/env python3
"""Find GitHub Actions steps that use a first-party action version running on a
deprecated or ageing JavaScript runtime (Node 12, 16 or 20).

    python3 check.py                       # scan .github/workflows under .
    python3 check.py /path/to/repo         # scan a specific checkout
    python3 check.py --format json         # machine-readable
    python3 check.py --fail-on-risk        # exit 2 if a deprecated-runtime step exists

## What it catches

GitHub deprecates the Node runtime that JavaScript actions run on, and when it
does, every workflow pinned to an old major version gets warnings and, later,
a forced runtime switch or a hard failure. This tool reads `uses:
actions/<name>@<ref>` lines and looks the major version up in a small table of
which runtime each major ships with.

* `deprecated-runtime` -- the major runs on Node 12 or Node 16, both end of
  life. Counts as a risk (exit 2 with --fail-on-risk).
* `ageing-runtime` -- the major runs on Node 20. Works today; GitHub has
  announced moving the runner default to Node 24. Reported, never a risk.
* `shut-down-version` -- a major GitHub has stopped serving
  (`actions/upload-artifact` and `download-artifact` v1-v3, `actions/cache`
  v1-v2). Jobs using it fail. Counts as a risk.

## What it does not do

A static, read-only, line scan of `.github/workflows/*.yml|yaml`. No network
calls. It covers only the `actions/*` actions listed in RUNTIMES; third-party
actions, pinned-SHA refs and branch refs (`@main`) cannot be mapped to a major
and are skipped. The table is a snapshot written from GitHub's published
release notes (see TABLE_AS_OF); runtimes keep moving, so confirm against the
action's own `action.yml` (`runs.using`) before acting on a finding.

Exit status: 0 normally, 2 if --fail-on-risk and a risk finding exists.
"""

import argparse
import json
import re
import sys
from pathlib import Path

DEPRECATED_RUNTIME = "deprecated-runtime"
AGEING_RUNTIME = "ageing-runtime"
SHUT_DOWN_VERSION = "shut-down-version"
RISK_CLASSIFICATIONS = frozenset({DEPRECATED_RUNTIME, SHUT_DOWN_VERSION})

TABLE_AS_OF = "2026-10"

# action -> {major: node runtime}. First-party actions only.
RUNTIMES = {
    "checkout": {1: 12, 2: 12, 3: 16, 4: 20, 5: 24},
    "setup-node": {1: 12, 2: 12, 3: 16, 4: 20, 5: 24},
    "setup-python": {1: 12, 2: 12, 3: 12, 4: 16, 5: 20, 6: 24},
    "setup-go": {1: 12, 2: 12, 3: 12, 4: 16, 5: 20, 6: 24},
    "setup-java": {1: 12, 2: 12, 3: 16, 4: 20, 5: 24},
    "upload-artifact": {1: 12, 2: 12, 3: 16, 4: 20, 5: 20, 6: 24},
    "download-artifact": {1: 12, 2: 12, 3: 16, 4: 20, 5: 20, 6: 24},
    "cache": {1: 12, 2: 12, 3: 16, 4: 20, 5: 24},
    "github-script": {5: 16, 6: 16, 7: 20, 8: 24},
}
LATEST = {name: max(table) for name, table in RUNTIMES.items()}

# Majors GitHub no longer serves at all.
SHUT_DOWN = {
    "upload-artifact": 3,
    "download-artifact": 3,
    "cache": 2,
}

_USES_RE = re.compile(
    r"""^\s*(?:-\s+)?uses:\s*["']?actions/(?P<name>[A-Za-z0-9_.-]+)(?:/[^@\s"']*)?@(?P<ref>[^\s"'#]+)"""
)
_MAJOR_RE = re.compile(r"^v?(\d+)(?:\.\d+)*$")


def _finding(filename, lineno, kind, name, ref, runtime, detail, fix):
    return {
        "file": filename,
        "line": lineno,
        "type": kind,
        "action": f"actions/{name}@{ref}",
        "node": runtime,
        "detail": detail,
        "remediation": fix,
    }


def scan_text(text, filename="<workflow>"):
    """Scan one workflow file's text. Returns a list of finding dicts."""
    findings = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        if line.lstrip().startswith("#"):
            continue
        match = _USES_RE.match(line)
        if not match:
            continue
        name, ref = match.group("name"), match.group("ref")
        table = RUNTIMES.get(name)
        major_match = _MAJOR_RE.match(ref)
        if table is None or major_match is None:
            continue  # unknown action, SHA or branch ref: cannot map to a major
        major = int(major_match.group(1))
        runtime = table.get(major)
        if runtime is None:
            continue
        latest = LATEST[name]
        fix = f"Move to actions/{name}@v{latest} (check its release notes for breaking changes first)."
        if major <= SHUT_DOWN.get(name, 0):
            findings.append(
                _finding(
                    filename, lineno, SHUT_DOWN_VERSION, name, ref, runtime,
                    f"actions/{name} v{major} has been shut down by GitHub; jobs using it fail.",
                    fix,
                )
            )
        elif runtime <= 16:
            findings.append(
                _finding(
                    filename, lineno, DEPRECATED_RUNTIME, name, ref, runtime,
                    f"actions/{name} v{major} runs on Node {runtime}, which is end of life; "
                    "GitHub warns on it and forces a newer runtime.",
                    fix,
                )
            )
        elif runtime == 20 and major < latest:
            findings.append(
                _finding(
                    filename, lineno, AGEING_RUNTIME, name, ref, runtime,
                    f"actions/{name} v{major} runs on Node 20; GitHub has announced moving "
                    "the runner default to Node 24.",
                    fix,
                )
            )
    return findings


def discover_workflow_files(root):
    workflows_dir = Path(root) / ".github" / "workflows"
    if not workflows_dir.is_dir():
        return []
    return sorted(list(workflows_dir.glob("*.yml")) + list(workflows_dir.glob("*.yaml")))


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
    order = (SHUT_DOWN_VERSION, DEPRECATED_RUNTIME, AGEING_RUNTIME)
    lines = []
    for kind in order:
        for f in (x for x in findings if x["type"] == kind):
            mark = "!!" if kind in RISK_CLASSIFICATIONS else "--"
            lines.append(f"{mark} {f['file']}:{f['line']}  {f['type']}  {f['action']}")
            lines.append(f"     {f['detail']}")
            lines.append(f"     fix: {f['remediation']}")
            lines.append("")
    counts = ", ".join(
        f"{sum(1 for f in findings if f['type'] == k)} {k}" for k in order
    )
    lines.append(f"{counts}. Runtime table as of {TABLE_AS_OF}; confirm against the action's action.yml.")
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("path", nargs="?", default=".", help="directory to scan (default: .)")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--fail-on-risk", action="store_true",
                        help="exit 2 when a deprecated-runtime or shut-down-version finding exists")
    args = parser.parse_args(argv)
    findings = scan_path(args.path)
    if args.format == "json":
        print(json.dumps(findings, indent=2))
    else:
        print(render_text(findings, args.path))
    return 2 if args.fail_on_risk and has_risk(findings) else 0


if __name__ == "__main__":
    sys.exit(main())
