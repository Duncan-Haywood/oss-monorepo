#!/usr/bin/env python3
"""Find `actions/checkout` steps that leave the GitHub token in `.git/config`.

    python3 check.py                       # scan .github/workflows under .
    python3 check.py /path/to/repo         # scan a specific checkout
    python3 check.py --format json         # machine-readable
    python3 check.py --fail-on-risk        # exit 2 if any finding exists

## What this catches

`actions/checkout` writes the job's GITHUB_TOKEN into `.git/config` unless the
step sets `persist-credentials: false`. Anything later in the job that copies
the workspace somewhere can then carry the token with it. The best-known case
is `actions/upload-artifact` on a path that includes `.git` (the "artipacked"
pattern: the artifact is downloadable by anyone who can read the run).

**1. `checkout-persists-credentials-with-upload`** -- a checkout step with no
`persist-credentials: false`, in a job that also runs `actions/upload-artifact`
(or `actions/cache`). Higher risk: the workspace is being exported.

**2. `checkout-persists-credentials`** -- the same checkout in a job that does
not export the workspace. Lower risk, but the token sits on disk for every
later step, including third-party actions, for no benefit unless the job runs
`git push` itself.

A step that sets `persist-credentials: true` explicitly is treated as a
deliberate choice and reported as the lower-risk shape only if the job has no
upload. Checkout of a different `repository:` is scanned the same way.

## What this tool does not do

A static, read-only, line-oriented scan over `.github/workflows/*.yml|yaml`
already on disk. No network calls. It is not a YAML parser: block-style
`jobs:` and `steps:` only; an expression value (`${{ ... }}`) for
`persist-credentials` is trusted. It cannot tell whether a job really needs
the credential to push, so findings are prompts to look, not verdicts, and it
says nothing about a workflow beyond this one pattern.

Exit status: 0 normally, 2 with --fail-on-risk and at least one finding.
"""

import argparse
import json
import re
import sys
from pathlib import Path

WITH_UPLOAD = "checkout-persists-credentials-with-upload"
PERSISTS = "checkout-persists-credentials"
RISK_CLASSIFICATIONS = frozenset({WITH_UPLOAD, PERSISTS})

_CHECKOUT_RE = re.compile(r"^\s*-?\s*uses:\s*[\"']?actions/checkout(?:@\S*)?[\"']?\s*(?:#.*)?$")
_EXPORT_RE = re.compile(r"uses:\s*[\"']?actions/(?:upload-artifact|cache)(?:/\w+)?(?:@|\s|[\"']|$)")
_JOBS_RE = re.compile(r"^jobs:\s*(?:#.*)?$")
_KEY_RE = re.compile(r"^(?P<indent> *)(?P<key>[\"']?[A-Za-z0-9_.-]+[\"']?):\s*(?P<value>.*?)\s*$")
_PERSIST_RE = re.compile(r"^\s*-?\s*persist-credentials:\s*[\"']?(\w+|\$\{\{.*\}\})[\"']?\s*(?:#.*)?$")

_FIX = (
    "Add `with: persist-credentials: false` to this checkout. If a later step must "
    "`git push`, pass the token to that step only (for example via an env var) instead "
    "of leaving it in .git/config for the whole job."
)


def _indent(line):
    return len(line) - len(line.lstrip(" "))


def _skip(line):
    s = line.strip()
    return s == "" or s.startswith("#")


def _job_blocks(lines):
    start = next((i for i, l in enumerate(lines) if _JOBS_RE.match(l)), None)
    if start is None:
        return []
    body = []
    for i in range(start + 1, len(lines)):
        if not _skip(lines[i]) and _indent(lines[i]) == 0:
            break
        body.append((i + 1, lines[i]))
    job_indent = next((_indent(l) for _, l in body if not _skip(l)), None)
    if job_indent is None:
        return []
    blocks, cur = [], None
    for no, line in body:
        m = _KEY_RE.match(line)
        if not _skip(line) and _indent(line) == job_indent and m:
            cur = {"name": m.group("key").strip("\"'"), "lines": []}
            blocks.append(cur)
        elif cur is not None:
            cur["lines"].append((no, line))
    return blocks


def _step_span(lines, idx):
    """Index range of the `- ` list item containing lines[idx]."""
    here = _indent(lines[idx][1])
    start = idx
    if not lines[idx][1].lstrip().startswith("- "):
        for j in range(idx - 1, -1, -1):
            l = lines[j][1]
            if not _skip(l) and l.lstrip().startswith("- ") and _indent(l) < here:
                start = j
                break
    item_indent = _indent(lines[start][1])
    end = len(lines)
    for j in range(start + 1, len(lines)):
        l = lines[j][1]
        if not _skip(l) and (_indent(l) < item_indent or (_indent(l) == item_indent and l.lstrip().startswith("- "))):
            end = j
            break
    return start, end


def scan_text(text, filename="<workflow>"):
    findings = []
    for block in _job_blocks(text.splitlines()):
        lines = block["lines"]
        exports = any(_EXPORT_RE.search(l) for _, l in lines if not _skip(l))
        for idx, (no, line) in enumerate(lines):
            if _skip(line) or not _CHECKOUT_RE.match(line):
                continue
            start, end = _step_span(lines, idx)
            value = None
            for _, l in lines[start:end]:
                m = _PERSIST_RE.match(l)
                if m:
                    value = m.group(1)
            if value is not None and (value.lower() == "false" or value.startswith("${{")):
                continue
            kind = WITH_UPLOAD if exports else PERSISTS
            detail = f"job '{block['name']}': actions/checkout leaves the token in .git/config"
            if exports:
                detail += "; the same job runs actions/upload-artifact or actions/cache"
            findings.append(
                {"file": filename, "line": no, "type": kind, "detail": detail, "remediation": _FIX}
            )
    return findings


def discover_workflow_files(root):
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
    ordered = sorted(findings, key=lambda f: f["type"] != WITH_UPLOAD)
    for f in ordered:
        out += [f"!! {f['file']}:{f['line']}  {f['type']}", f"     {f['detail']}", f"     fix: {f['remediation']}", ""]
    n_up = sum(f["type"] == WITH_UPLOAD for f in findings)
    out.append(f"{n_up} with-upload finding(s), {len(findings) - n_up} other finding(s).")
    return "\n".join(out)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("path", nargs="?", default=".", help="directory to scan (default: .)")
    p.add_argument("--format", choices=("text", "json"), default="text")
    p.add_argument("--fail-on-risk", action="store_true", help="exit 2 when any finding exists")
    args = p.parse_args(argv)
    findings = scan_path(args.path)
    print(json.dumps(findings, indent=2) if args.format == "json" else render_text(findings, args.path))
    return 2 if args.fail_on_risk and has_risk(findings) else 0


if __name__ == "__main__":
    sys.exit(main())
