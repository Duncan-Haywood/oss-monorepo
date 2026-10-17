#!/usr/bin/env python3
"""Find GitHub Actions reusable-workflow calls that hand over every secret
with `secrets: inherit` in a way that widens who can reach them.

    python3 check.py                       # scan .github/workflows under .
    python3 check.py /path/to/repo         # scan a specific checkout
    python3 check.py --format json         # machine-readable
    python3 check.py --fail-on-risk        # exit 2 if any finding exists

## The two risks this catches

A reusable-workflow call looks like this:

    jobs:
      call-workflow:
        uses: octo-org/example-repo/.github/workflows/reusable.yml@main
        secrets: inherit

`secrets: inherit` passes *every* secret the calling workflow can see to the
called workflow -- not just the ones it actually needs. GitHub's own docs
name this as something to use with caution; this tool flags the two shapes
where that caution most concretely pays off.

**1. `secrets-inherit-external-workflow`** -- the called workflow lives in a
*different* repository (`uses:` is not a local `./…` path). Every secret this
workflow can see is now reachable by whatever code lives at that other
repository's ref -- a third party, a different team, or simply a codebase
nobody here reviews on the same schedule. A compromised account, a
force-pushed branch, or a maintainer decision at that other repository is
now also a way to walk off with this repository's secrets.

**2. `secrets-inherit-untrusted-trigger`** -- the job is reachable from a
`pull_request_target` or `workflow_run` trigger, which runs with the base
repository's context even though a stranger's fork raised the event. Passing
`secrets: inherit` there hands the *entire* secret set to a job a fork can
cause to run, rather than the handful of named secrets that job might
actually need for, say, posting a PR comment.

Both are checked independently -- a job can trip either, both, or neither.

## What this tool actually does, and does not do

A static, read-only, line-oriented scanner over `.github/workflows/*.yml` and
`*.yaml` files already on disk. It makes **no network calls of any kind** --
it does not resolve what a reusable workflow's ref currently points at and
does not contact GitHub. It is not a YAML parser (a small indentation-aware
line scan, the same design choice `actions-cache-poisoning-check` and
`actions-injection-check` make and document): it does not evaluate whether
the called workflow is actually trustworthy, and it does not follow a local
`./…` reusable workflow to see what it in turn calls. A clean scan is not a
security audit -- it means neither pattern was found in the files scanned.

## Classification

  - `secrets-inherit-external-workflow` -- `secrets: inherit` on a job whose
    `uses:` calls a reusable workflow in another repository.
  - `secrets-inherit-untrusted-trigger` -- `secrets: inherit` on a job whose
    workflow is triggered by `pull_request_target` or `workflow_run`.

Exit status: 0 normally (even with findings, unless --fail-on-risk), 2 if
--fail-on-risk was given and at least one finding exists.
"""

import argparse
import json
import re
import sys
from pathlib import Path

SECRETS_INHERIT_EXTERNAL_WORKFLOW = "secrets-inherit-external-workflow"
SECRETS_INHERIT_UNTRUSTED_TRIGGER = "secrets-inherit-untrusted-trigger"

RISK_CLASSIFICATIONS = frozenset({SECRETS_INHERIT_EXTERNAL_WORKFLOW, SECRETS_INHERIT_UNTRUSTED_TRIGGER})

# Whole-file, not scoped to the `on:` block -- the same deliberate
# simplification actions-cache-poisoning-check and actions-injection-check
# make with this identical regex.
_UNTRUSTED_TRIGGER_RE = re.compile(r"\bpull_request_target\b|\bworkflow_run\b")

# A job-level `uses:` calling a reusable workflow -- local (`./…`) or
# external (`owner/repo/.github/workflows/file.yml@ref`). Both forms contain
# ".github/workflows/"; an ordinary third-party *action* reference never does.
_REUSABLE_USES_RE = re.compile(
    r"^(?P<indent>\s*)(?:-\s*)?uses:\s*[\"']?(?P<value>[^\"'\s#]+)[\"']?\s*(?:#.*)?$"
)

_SECRETS_INHERIT_RE = re.compile(r"^(?P<indent>\s*)secrets:\s*inherit\s*(?:#.*)?$")

_EXTERNAL_REMEDIATION = (
    "secrets: inherit hands every secret this repository's workflow can see to a reusable "
    "workflow hosted in a different repository -- code you may not review on the same "
    "schedule as your own. Name only the specific secrets that workflow actually needs "
    "(secrets: { TOKEN: ${{ secrets.TOKEN }} }) instead of inheriting the whole set, and pin "
    "the call to a full commit SHA rather than a mutable branch or tag."
)

_UNTRUSTED_TRIGGER_REMEDIATION = (
    "This job is reachable from a fork (pull_request_target/workflow_run) and "
    "secrets: inherit hands it every secret this workflow can see, not just what it needs. "
    "A fork-raised event should reach at most the specific secrets required for that job "
    "(secrets: { TOKEN: ${{ secrets.TOKEN }} }), or the job should run on the unprivileged "
    "pull_request trigger instead."
)


def strip_quotes(value):
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def line_indent(line):
    return len(line) - len(line.lstrip(" "))


def is_reusable_workflow_call(value):
    return ".github/workflows/" in value


def is_external_call(value):
    return not (value.startswith("./") or value.startswith("../"))


def scan_text(text, filename="<workflow>"):
    """Scan one workflow file's text. Returns a list of finding dicts."""
    findings = []
    lines = text.splitlines()
    trigger_is_untrusted = bool(_UNTRUSTED_TRIGGER_RE.search(text))

    job_indent = None
    job_is_external_call = False
    job_call_value = None

    for lineno, line in enumerate(lines, start=1):
        if job_indent is not None:
            if line.strip() == "":
                pass
            elif line_indent(line) < job_indent:
                job_indent = None
                job_is_external_call = False
                job_call_value = None
            elif line_indent(line) == job_indent and _SECRETS_INHERIT_RE.match(line):
                if job_is_external_call:
                    findings.append(
                        {
                            "file": filename,
                            "line": lineno,
                            "type": SECRETS_INHERIT_EXTERNAL_WORKFLOW,
                            "detail": f"secrets: inherit on {job_call_value}",
                            "remediation": _EXTERNAL_REMEDIATION,
                        }
                    )
                if trigger_is_untrusted:
                    findings.append(
                        {
                            "file": filename,
                            "line": lineno,
                            "type": SECRETS_INHERIT_UNTRUSTED_TRIGGER,
                            "detail": f"secrets: inherit on {job_call_value}",
                            "remediation": _UNTRUSTED_TRIGGER_REMEDIATION,
                        }
                    )

        uses_match = _REUSABLE_USES_RE.match(line)
        if uses_match:
            value = strip_quotes(uses_match.group("value"))
            if is_reusable_workflow_call(value):
                job_indent = len(uses_match.group("indent"))
                job_is_external_call = is_external_call(value)
                job_call_value = value
            else:
                job_indent = None
                job_is_external_call = False
                job_call_value = None

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

    external = [f for f in findings if f["type"] == SECRETS_INHERIT_EXTERNAL_WORKFLOW]
    untrusted = [f for f in findings if f["type"] == SECRETS_INHERIT_UNTRUSTED_TRIGGER]

    lines = []
    for f in external:
        lines.append(f"!! {f['file']}:{f['line']}  secrets-inherit-external-workflow")
        lines.append(f"     step: {f['detail']}")
        lines.append(f"     fix: {f['remediation']}")
        lines.append("")
    for f in untrusted:
        lines.append(f"!! {f['file']}:{f['line']}  secrets-inherit-untrusted-trigger")
        lines.append(f"     step: {f['detail']}")
        lines.append(f"     fix: {f['remediation']}")
        lines.append("")

    lines.append(
        f"{len(external)} secrets-inherit-external-workflow finding(s), "
        f"{len(untrusted)} secrets-inherit-untrusted-trigger finding(s)."
    )
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "path", nargs="?", default=".", help="directory to scan (default: current directory)"
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
