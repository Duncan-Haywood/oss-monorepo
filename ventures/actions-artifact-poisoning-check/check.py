#!/usr/bin/env python3
"""Find two documented GitHub Actions "artifact poisoning" patterns in workflow YAML.

    python3 check.py                       # scan .github/workflows under .
    python3 check.py /path/to/repo         # scan a specific checkout
    python3 check.py --format json         # machine-readable
    python3 check.py --fail-on-risk        # exit 2 if any finding exists

## The risk this catches

A workflow triggered by `workflow_run` runs with the base repository's full
`GITHUB_TOKEN` and, on a public repository, whatever secrets that grants —
even though the run it reacts to (typically a `pull_request` build/test
workflow) was raised by a stranger's fork. GitHub's own Actions Security Lab,
and independent write-ups from Wiz, Legit Security and Orca Security, document
"artifact poisoning" as the resulting attack: the fork-triggered workflow
uploads an `actions/upload-artifact`, and the privileged `workflow_run`
handler downloads it with `actions/download-artifact` (or the third-party
`dawidd6/action-download-artifact`, used because the first-party action
cannot cross workflow runs on its own) and treats its contents as trusted —
executing a script from it, or feeding it into a build step — without
realizing the artifact's *contents*, not just the event payload, are
attacker-controlled. This portfolio's `actions-injection-check` already flags
the checkout-based "pwn request" (untrusted git ref) and
`actions-cache-poisoning-check` flags the cache-based variant (untrusted cache
entry); this is the same trigger gate applied to a third sink — a downloaded
artifact's file contents.

This tool catches two instances of that shape:

**1. A downloaded artifact is executed later in the same job** — a
`workflow_run`-triggered job runs `actions/download-artifact` or
`dawidd6/action-download-artifact`, and a *later* step in that same job has a
`run:` block that looks like it executes something from disk (`chmod +x`,
`./something`, or invoking `bash`, `sh`, `source`, `python`/`python3`, `node`,
or `eval`). The artifact's contents came from the untrusted triggering run, so
running anything from it hands that fork code execution in the privileged
context.

**2. An unscoped artifact download** — a `download-artifact` step in a
`workflow_run`-triggered job with no `name:` input, which downloads *every*
artifact the triggering run uploaded rather than one specific, expected one,
widening what untrusted content enters the privileged job even when nothing
in this file executes it directly.

## What this tool actually does, and does not do

A static, read-only, line-oriented scanner over `.github/workflows/*.yml` and
`*.yaml` files already on disk. It makes **no network calls of any kind**. It
is not a YAML parser — the same small indentation-aware line scan
`actions-cache-poisoning-check` and `actions-injection-check` use, and it
carries the same limitation: it tracks step and job boundaries by looking for
a `steps:` key and step-list markers (`- `), not by fully parsing the
document, so an unusually formatted workflow can defeat it. A clean scan is
not a security audit — it does not correlate a download in one workflow file
with an upload in another (it assumes any `workflow_run`-triggered download is
reading the triggering run's own artifacts, which is the overwhelmingly
common case and the one the risk describes), and it does not inspect what an
action *called* by `uses:` does internally with a downloaded path.

## Classification

  - `artifact-executed-after-untrusted-download` — a `workflow_run`-triggered
    job downloads an artifact and a later step in the same job runs something
    that looks like it executes a file from disk.
  - `unscoped-artifact-download` — a `download-artifact` (or
    `dawidd6/action-download-artifact`) step in a `workflow_run`-triggered job
    with no `name:` input.

Exit status: 0 normally (even with findings, unless --fail-on-risk), 2 if
--fail-on-risk was given and at least one finding exists.
"""

import argparse
import json
import re
import sys
from pathlib import Path

ARTIFACT_EXECUTED = "artifact-executed-after-untrusted-download"
UNSCOPED_ARTIFACT_DOWNLOAD = "unscoped-artifact-download"

RISK_CLASSIFICATIONS = frozenset({ARTIFACT_EXECUTED, UNSCOPED_ARTIFACT_DOWNLOAD})

# Whole-file, not scoped to the `on:` block -- the same deliberate
# simplification actions-injection-check and actions-cache-poisoning-check
# make with an equivalent regex.
_WORKFLOW_RUN_RE = re.compile(r"\bworkflow_run\b")

_STEPS_KEY_RE = re.compile(r"^(?P<indent>\s*)steps:\s*(#.*)?$")
_STEP_START_RE = re.compile(r"^(?P<indent>\s*)-\s")
_DOWNLOAD_ARTIFACT_RE = re.compile(
    r"^(?P<indent>\s*)(?:-\s*)?uses:\s*[\"']?"
    r"(?:actions/download-artifact|dawidd6/action-download-artifact)@"
)
_NAME_KEY_RE = re.compile(r"^(?P<indent>\s*)name:\s*\S")
_RUN_KEY_RE = re.compile(r"^(?P<indent>\s*)(?:-\s*)?run:\s*\|?\s*(?P<inline>.*)$")

_EXEC_LOOKING_RE = re.compile(
    r"\bchmod\s+\+x\b"
    r"|(?:^|[\s;&|])\./\S"
    r"|(?:^|[\s;&|])(?:bash|sh|source|python3?|node|eval)\b"
)

_ARTIFACT_EXECUTED_REMEDIATION = (
    "This job is triggered by workflow_run and downloads an artifact, then a later step in "
    "the same job runs something that looks like it executes a file from disk. The artifact's "
    "*contents* came from the fork-triggered run this workflow reacts to, not just its event "
    "payload -- GitHub's Actions Security Lab and independent research (Wiz, Legit Security, "
    "Orca Security) document this as 'artifact poisoning'. Do not execute, source, or interpret "
    "anything from a downloaded artifact as code; read specific, expected data fields from it "
    "instead, and validate their shape before use."
)

_UNSCOPED_DOWNLOAD_REMEDIATION = (
    "This download-artifact step has no name: input, so it pulls in every artifact the "
    "triggering (fork-controlled) run uploaded rather than one specific, expected one -- "
    "widening what untrusted content enters this privileged job even if nothing here executes "
    "it directly. Pin name: to the exact artifact this job expects."
)


def line_indent(line):
    return len(line) - len(line.lstrip(" "))


def scan_text(text, filename="<workflow>"):
    """Scan one workflow file's text. Returns a list of finding dicts."""
    findings = []
    lines = text.splitlines()
    trigger_is_workflow_run = bool(_WORKFLOW_RUN_RE.search(text))

    # --- state for unscoped-artifact-download (per download step) ---
    dl_step_indent = None
    dl_line = None
    dl_has_name = False

    # --- state for artifact-executed-after-untrusted-download (per job) ---
    download_line_in_job = None
    run_block_indent = None
    run_block_lines = []
    run_block_start_line = None

    # Indent of the most recent step-list "- " marker. A step's own keys
    # (name, uses, with, run, ...) are conventionally either on the same line
    # as the dash ("- uses: ...") or indented two spaces past it ("- name:
    # ...\n  uses: ..."). `step_indent_for` resolves either form to the
    # dash's own indent, so a sibling key like `with:` is never mistaken for
    # the end of the step just because it does not itself start with "-".
    last_step_dash_indent = None

    def step_indent_for(raw_indent):
        if last_step_dash_indent is not None and raw_indent == last_step_dash_indent + 2:
            return last_step_dash_indent
        return raw_indent

    def finalize_download():
        nonlocal dl_step_indent, dl_line, dl_has_name
        if dl_step_indent is not None and trigger_is_workflow_run and not dl_has_name:
            findings.append(
                {
                    "file": filename,
                    "line": dl_line,
                    "type": UNSCOPED_ARTIFACT_DOWNLOAD,
                    "detail": "download-artifact with no name:",
                    "remediation": _UNSCOPED_DOWNLOAD_REMEDIATION,
                }
            )
        dl_step_indent = None
        dl_line = None
        dl_has_name = False

    def finalize_run_block():
        nonlocal run_block_indent, run_block_lines, run_block_start_line
        if (
            run_block_indent is not None
            and trigger_is_workflow_run
            and download_line_in_job is not None
        ):
            body = "\n".join(run_block_lines)
            if _EXEC_LOOKING_RE.search(body):
                findings.append(
                    {
                        "file": filename,
                        "line": run_block_start_line,
                        "type": ARTIFACT_EXECUTED,
                        "detail": f"run step at line {run_block_start_line} follows "
                        f"download-artifact at line {download_line_in_job}",
                        "remediation": _ARTIFACT_EXECUTED_REMEDIATION,
                    }
                )
        run_block_indent = None
        run_block_lines = []
        run_block_start_line = None

    for lineno, line in enumerate(lines, start=1):
        blank = line.strip() == ""

        if run_block_indent is not None and not blank and line_indent(line) <= run_block_indent:
            finalize_run_block()

        if dl_step_indent is not None:
            if blank:
                pass
            elif line_indent(line) <= dl_step_indent:
                finalize_download()
            elif _NAME_KEY_RE.match(line):
                dl_has_name = True

        if _STEPS_KEY_RE.match(line):
            # A fresh job's step list starts here -- forget any download seen
            # in a previous job so a run: step never gets attributed across a
            # job boundary.
            download_line_in_job = None

        step_start_match = _STEP_START_RE.match(line)
        if step_start_match:
            last_step_dash_indent = len(step_start_match.group("indent"))

        dl_match = _DOWNLOAD_ARTIFACT_RE.match(line)
        if dl_match:
            finalize_download()
            dl_step_indent = step_indent_for(len(dl_match.group("indent")))
            dl_line = lineno
            dl_has_name = False
            download_line_in_job = lineno

        run_match = _RUN_KEY_RE.match(line)
        if run_match:
            finalize_run_block()
            run_block_indent = step_indent_for(len(run_match.group("indent")))
            run_block_start_line = lineno
            run_block_lines = [run_match.group("inline")]
        elif run_block_indent is not None and line_indent(line) > run_block_indent:
            run_block_lines.append(line)

    finalize_download()
    finalize_run_block()

    findings.sort(key=lambda f: f["line"])
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

    executed = [f for f in findings if f["type"] == ARTIFACT_EXECUTED]
    unscoped = [f for f in findings if f["type"] == UNSCOPED_ARTIFACT_DOWNLOAD]

    lines = []
    for f in executed:
        lines.append(f"!! {f['file']}:{f['line']}  artifact-executed-after-untrusted-download")
        lines.append(f"     detail: {f['detail']}")
        lines.append(f"     fix: {f['remediation']}")
        lines.append("")
    for f in unscoped:
        lines.append(f"!! {f['file']}:{f['line']}  unscoped-artifact-download")
        lines.append(f"     detail: {f['detail']}")
        lines.append(f"     fix: {f['remediation']}")
        lines.append("")

    lines.append(
        f"{len(executed)} artifact-executed-after-untrusted-download finding(s), "
        f"{len(unscoped)} unscoped-artifact-download finding(s)."
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
