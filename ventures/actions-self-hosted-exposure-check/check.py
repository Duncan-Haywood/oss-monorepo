#!/usr/bin/env python3
"""Find GitHub Actions jobs that run on a `self-hosted` runner in a workflow
whose trigger lets a stranger's pull request, comment, or fork influence what
runs -- GitHub's own documented reason not to use self-hosted runners on a
public repository.

    python3 check.py                       # scan .github/workflows under .
    python3 check.py /path/to/repo         # scan a specific checkout
    python3 check.py --format json         # machine-readable
    python3 check.py --fail-on-risk        # exit 2 if any risk exists

## The risk this catches

GitHub's own documentation on self-hosted runner security says, in
substance, that self-hosted runners should not be used on public
repositories, because a fork can open a pull request that runs its own
workflow code directly on your runner machine. A `pull_request` (not
`_target`) workflow executes the workflow file *from the pull request's own
branch* -- so if that workflow's job runs on a `self-hosted` label, the
fork's author decides what your runner executes, not you. `pull_request_target`,
`workflow_run`, and `issue_comment` run the base branch's own workflow file
instead, but still hand a stranger-influenced event (and, for the first two,
the repository's own secrets) to a job that then executes on infrastructure
you own rather than an ephemeral GitHub-hosted VM.

This is the same category of risk the OpenSSF Scorecard project's
`Dangerous-Workflow` check flags for public repositories, not a novel claim.

## What this tool actually does, and does not do

It is a static, read-only line scanner. It reads `.github/workflows/*.yml`
and `*.yaml` files already on disk, extracts each workflow's trigger
(`on:`) events and each job's `runs-on:` labels, and flags a job only when
both are true: the job's `runs-on:` includes the literal label
`self-hosted`, and the workflow's trigger includes one of `pull_request`,
`pull_request_target`, `workflow_run`, or `issue_comment`.

It makes **no network calls of any kind** -- it never checks whether your
repository is actually public, whether required-approval settings gate
first-time contributors, or whether an organization-level runner group
(selected with `runs-on: {group: ...}`, a form this tool cannot classify)
is actually self-hosted. It never claims a workflow is "safe" just because
it was not flagged, and it never claims your repository is compromised just
because one was.

## Classification

  - `fork-exposed`             -- `runs-on:` includes the literal label
                                   `self-hosted`, and the workflow's `on:`
                                   includes `pull_request`,
                                   `pull_request_target`, `workflow_run`, or
                                   `issue_comment`. Flagged.
  - `self-hosted-other-trigger` -- self-hosted, but the workflow's trigger
                                   is not one of the four above (e.g. `push`,
                                   `schedule`, `workflow_dispatch`). Not
                                   flagged by this tool -- a self-hosted
                                   runner triggered only by events your own
                                   collaborators control is a different risk
                                   shape than this checker covers.
  - `github-hosted`            -- `runs-on:` does not include the literal
                                   label `self-hosted`. Not flagged.
  - `runner-group`             -- `runs-on:` selects an organization runner
                                   group by name (`group:`). This tool
                                   cannot tell whether that group is
                                   self-hosted from the workflow file alone.
                                   Not flagged, disclosed as unknown.
  - `dynamic`                  -- `runs-on:` is a `${{ }}` expression (a
                                   matrix `os`, typically). Cannot classify
                                   statically. Not flagged, disclosed as
                                   unknown.
  - `no-runs-on`               -- the job has no `runs-on:` this tool could
                                   find. Not flagged.
  - `no-jobs`                  -- the file has no `jobs:` section this tool
                                   could find. Not flagged.

Exit status: 0 normally (even with findings, unless --fail-on-risk), 2 if
--fail-on-risk was given and at least one `fork-exposed` finding exists.
"""

import argparse
import json
import re
import sys
from pathlib import Path

FORK_EXPOSED = "fork-exposed"
SELF_HOSTED_OTHER_TRIGGER = "self-hosted-other-trigger"
GITHUB_HOSTED = "github-hosted"
RUNNER_GROUP = "runner-group"
DYNAMIC = "dynamic"
NO_RUNS_ON = "no-runs-on"
NO_JOBS = "no-jobs"

RISK_CLASSIFICATIONS = frozenset({FORK_EXPOSED})

# The four triggers that hand a stranger some influence over the event that
# runs a job -- a plain pull_request runs the workflow file *from the PR's
# own branch*; the other three run the base branch's file but still respond
# to fork-influenced input. Documented in GitHub's own "Events that trigger
# workflows" and "Security hardening for GitHub Actions" guidance.
RISKY_TRIGGERS = frozenset(
    {"pull_request", "pull_request_target", "workflow_run", "issue_comment"}
)

# Top-level keys start in column 0. Line-scanner assumptions mirror
# actions-permissions-check's check.py on purpose, so the two never disagree
# about what "top level" or "a job's body" means in a workflow file.
_TOP_ON_RE = re.compile(r"^on:\s*(.*?)\s*(?:#.*)?$")
_TOP_JOBS_RE = re.compile(r"^jobs:\s*(?:#.*)?$")
_JOB_NAME_RE = re.compile(r"^([A-Za-z0-9_.-]+):\s*(?:#.*)?$")
_RUNS_ON_KEY_RE = re.compile(r"^(\s+)runs-on:\s*(.*?)\s*(?:#.*)?$")


def _line_indent(line):
    return len(line) - len(line.lstrip(" "))


def _extract_on_events(lines):
    """Returns the set of trigger event names in the file's `on:` key, in
    any of its three forms: scalar (`on: pull_request`), flow sequence
    (`on: [push, pull_request]`), or block mapping (`on:\\n  push:\\n
    pull_request:\\n    branches: [main]`). For the block form, only keys at
    the shallowest indentation under `on:` count as event names -- a nested
    key like `branches:` under `pull_request:` is deeper and is skipped,
    the same indentation-scoping `check.py`'s sibling uses for jobs."""
    for idx, line in enumerate(lines):
        match = _TOP_ON_RE.match(line)
        if not match:
            continue
        inline = match.group(1).strip()
        if inline:
            if inline.startswith("[") and inline.endswith("]"):
                return {x.strip().strip("\"'") for x in inline[1:-1].split(",") if x.strip()}
            return {inline.strip("\"'")}
        events = set()
        event_indent = None
        i = idx + 1
        while i < len(lines):
            l = lines[i]
            stripped = l.strip()
            if not stripped or stripped.startswith("#"):
                i += 1
                continue
            indent = _line_indent(l)
            if indent == 0:
                break
            if event_indent is None:
                event_indent = indent
            if indent == event_indent:
                key_match = re.match(r"^([A-Za-z0-9_.-]+):", stripped)
                if key_match:
                    events.add(key_match.group(1))
            i += 1
        return events
    return set()


def _find_jobs_start(lines):
    for idx, line in enumerate(lines):
        if _TOP_JOBS_RE.match(line):
            return idx
    return None


def _find_jobs(lines, jobs_idx):
    """Returns a list of (job_id, start_idx, end_idx) for each job under a
    `jobs:` key found at `jobs_idx`. `end_idx` is exclusive."""
    jobs = []
    job_indent = None
    i = jobs_idx + 1
    n = len(lines)
    jobs_block_end = n
    while i < n:
        line = lines[i]
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            i += 1
            continue
        indent = _line_indent(line)
        if indent == 0:
            jobs_block_end = i
            break
        if job_indent is None:
            job_indent = indent
        if indent == job_indent:
            match = _JOB_NAME_RE.match(stripped)
            if match:
                jobs.append([match.group(1), i, n])
        i += 1
    for j in range(len(jobs)):
        jobs[j][2] = jobs[j + 1][1] if j + 1 < len(jobs) else jobs_block_end
    return [tuple(j) for j in jobs]


def _find_job_runs_on(lines, start, end):
    """The shallowest-indented `runs-on:` line within [start, end) --
    `runs-on` is only a valid job-level key, never a step input, so the
    shallowest match within a job's own body is its own grant."""
    best = None
    for idx in range(start, end):
        match = _RUNS_ON_KEY_RE.match(lines[idx])
        if not match:
            continue
        indent = len(match.group(1))
        if best is None or indent < best[1]:
            best = (idx, indent)
    return best


def _parse_runs_on(lines, idx):
    """Returns (kind, value) for the `runs-on:` key at lines[idx].
    kind is one of:
      "labels"  -- value is a list[str] of runner labels
      "group"   -- value is None; a `group:`-keyed selection of an
                   organization runner group, which may or may not be
                   self-hosted and cannot be told apart from the workflow
                   file alone
      "dynamic" -- value is None; an unresolved `${{ }}` expression
      "empty"   -- value is None; no labels or group found
    """
    match = _RUNS_ON_KEY_RE.match(lines[idx])
    inline = match.group(2).strip() if match else ""
    key_indent = len(lines[idx]) - len(lines[idx].lstrip(" "))

    if inline:
        if "${{" in inline:
            return "dynamic", None
        if inline.startswith("[") and inline.endswith("]"):
            items = [x.strip().strip("\"'") for x in inline[1:-1].split(",") if x.strip()]
            return "labels", items
        if inline.startswith("{"):
            return "group", None
        return "labels", [inline.strip("\"'")]

    labels = []
    saw_group_key = False
    i = idx + 1
    n = len(lines)
    while i < n:
        line = lines[i]
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            i += 1
            continue
        if _line_indent(line) <= key_indent:
            break
        if stripped.startswith("-"):
            item = stripped[1:].strip().strip("\"'")
            if item:
                labels.append(item)
        elif re.match(r"^group:\s*", stripped):
            saw_group_key = True
        i += 1

    if saw_group_key:
        return "group", None
    if labels:
        return "labels", labels
    return "empty", None


def _classify_job(lines, start, end, events):
    found = _find_job_runs_on(lines, start + 1, end)
    if found is None:
        return NO_RUNS_ON, "no runs-on: found for this job"
    idx, _indent = found
    kind, value = _parse_runs_on(lines, idx)

    if kind == "dynamic":
        return DYNAMIC, "runs-on is a `${{ }}` expression (e.g. a matrix) -- cannot classify statically"
    if kind == "group":
        return RUNNER_GROUP, "runs-on selects a runner group by name -- cannot tell whether that group is self-hosted from this file alone"
    if kind == "empty":
        return NO_RUNS_ON, "runs-on: has no labels or group listed"

    labels = value
    if not any(label == "self-hosted" for label in labels):
        return GITHUB_HOSTED, f"runs-on: {', '.join(labels)}"

    risky = sorted(events & RISKY_TRIGGERS)
    if risky:
        return FORK_EXPOSED, (
            f"self-hosted runner in a workflow triggered by {', '.join(risky)} -- "
            "a stranger's fork, comment, or pull request can influence this run"
        )
    trigger_desc = ", ".join(sorted(events)) if events else "no `on:` trigger found"
    return SELF_HOSTED_OTHER_TRIGGER, (
        f"self-hosted runner, but this workflow's trigger ({trigger_desc}) is not "
        f"one of {', '.join(sorted(RISKY_TRIGGERS))}"
    )


def scan_text(text, filename="<workflow>"):
    """Scan one workflow file's text. Returns a list of finding dicts, one
    per job, covering every classification (not just risky ones) so the
    output shows everything considered."""
    lines = text.splitlines()
    findings = []

    events = _extract_on_events(lines)
    jobs_idx = _find_jobs_start(lines)

    if jobs_idx is None:
        return [
            {
                "file": filename,
                "line": 1,
                "scope": "workflow",
                "classification": NO_JOBS,
                "detail": "no `jobs:` section found",
            }
        ]

    jobs = _find_jobs(lines, jobs_idx)
    if not jobs:
        return [
            {
                "file": filename,
                "line": jobs_idx + 1,
                "scope": "workflow",
                "classification": NO_JOBS,
                "detail": "`jobs:` section has no jobs this tool could find",
            }
        ]

    for job_id, start, end in jobs:
        classification, detail = _classify_job(lines, start, end, events)
        findings.append(
            {
                "file": filename,
                "line": start + 1,
                "scope": f"job:{job_id}",
                "classification": classification,
                "detail": detail,
            }
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
    findings = []
    for path in discover_workflow_files(root):
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            print(f"warning: could not read {path}: {exc}", file=sys.stderr)
            continue
        findings.extend(scan_text(text, filename=str(path)))
    return findings


def has_unresolved_risk(findings):
    return any(f["classification"] in RISK_CLASSIFICATIONS for f in findings)


def render_text(findings, root):
    if not findings:
        files = discover_workflow_files(root)
        if not files:
            return "No .github/workflows/*.yml or *.yaml files found under " + str(root)
        return f"Scanned {len(files)} workflow file(s); no jobs found."

    risky = [f for f in findings if f["classification"] in RISK_CLASSIFICATIONS]
    other = [f for f in findings if f["classification"] not in RISK_CLASSIFICATIONS]

    lines = []
    for f in risky:
        lines.append(f"!! {f['file']}:{f['line']}  {f['scope']}  [{f['classification']}]")
        lines.append(f"     {f['detail']}")
        lines.append(
            "     fix: move this job off the self-hosted runner, restrict the "
            "trigger to events a fork cannot raise, or require manual approval "
            "for every run from an outside collaborator"
        )
        lines.append("")

    lines.append(f"{len(risky)} fork-exposed finding(s), {len(other)} not flagged.")
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
        help="exit 2 when any fork-exposed finding exists",
    )
    args = parser.parse_args(argv)

    findings = scan_path(args.path)

    if args.format == "json":
        print(json.dumps(findings, indent=2))
    else:
        print(render_text(findings, args.path))

    if args.fail_on_risk and has_unresolved_risk(findings):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
