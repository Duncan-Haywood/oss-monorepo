#!/usr/bin/env python3
"""Find GitHub Actions workflows and jobs that never set an explicit
`permissions:` block, so the `GITHUB_TOKEN` they run with falls back to
whatever your repository or organization's default token permissions are --
silently, for as long as no one has changed that setting.

    python3 check.py                       # scan .github/workflows under .
    python3 check.py /path/to/repo         # scan a specific checkout
    python3 check.py --format json         # machine-readable
    python3 check.py --fail-on-risk        # exit 2 if any risk exists

## The risk this catches

By default, a workflow that never sets `permissions:` runs with the
repository (or, if the organization has changed it, the organization) default
`GITHUB_TOKEN` permissions. Many repositories still have that default set to
read-write on every scope -- it was GitHub's own default for repositories
created before 2023-02-02, and organizations that never revisited it keep it.
A workflow triggered by something an outside contributor can influence (a
pull request, an issue comment) then runs with a token that can push
commits, create releases, or modify repository settings, even though the job
itself only needed to read the checkout. This is GitHub's own documented
hardening guidance ("Use the minimum required permissions for the
GITHUB_TOKEN" / "Automatic token permissions") and the same "Token-Permissions"
check the OpenSSF Scorecard project runs against public repositories, not a
novel claim.

`permissions: write-all` makes the same risk explicit rather than ambient: it
grants every scope write access outright, which is broader than almost any
job actually needs.

## What this tool actually does, and does not do

It is a static, read-only line scanner. It reads `.github/workflows/*.yml`
and `*.yaml` files already on disk and looks for a `permissions:` key at the
workflow level and on each job. It makes **no network calls of any kind** --
it never fetches your repository's or organization's actual default token
setting (there is no public API for that), so it cannot tell you whether an
"unspecified" finding is actually dangerous on your account -- only that
nothing in the workflow file itself makes the token's permissions explicit.

This tool never claims a workflow is "secure" or "compliant", and it never
judges whether the scopes a workflow *does* declare are the right ones for
what its jobs do -- only whether a `permissions:` key exists at all, and
whether it grants `write-all`. Deciding the minimum scopes a job actually
needs is a job only you can do; this tool just tells you where nothing has
been decided yet.

## Classification

  - `explicit`     -- the workflow (or this specific job) declares its own
                       `permissions:` block that is not `write-all`. Not
                       flagged, even though the scopes granted may still be
                       broader than necessary -- this tool does not judge
                       that, only whether it was set on purpose.
  - `write-all`     -- `permissions: write-all` appears at workflow level or
                       on a job. Flagged: this grants every scope write
                       access outright.
  - `unspecified`   -- no workflow-level `permissions:`, and this job has no
                       `permissions:` of its own either. It runs with
                       whatever the ambient repository/organization default
                       is. Flagged.

A job inherits an explicit workflow-level grant unless it sets its own, so a
job is only `unspecified` when *neither* level declares one.

Exit status: 0 normally (even with findings, unless --fail-on-risk), 2 if
--fail-on-risk was given and at least one `write-all` or `unspecified`
finding exists.
"""

import argparse
import json
import re
import sys
from pathlib import Path

EXPLICIT = "explicit"
WRITE_ALL = "write-all"
UNSPECIFIED = "unspecified"

RISK_CLASSIFICATIONS = frozenset({WRITE_ALL, UNSPECIFIED})

# Top-level keys start in column 0. A `permissions:` line at column 0 is the
# workflow-level grant; this is a line scanner, not a YAML parser, so it
# assumes conventional two-space-per-level indentation, the same assumption
# pinned-actions-check's classify.mjs makes about `uses:` lines.
_TOP_PERMISSIONS_RE = re.compile(r"^permissions:\s*(.*?)\s*(?:#.*)?$")
_TOP_JOBS_RE = re.compile(r"^jobs:\s*(?:#.*)?$")
_JOB_NAME_RE = re.compile(r"^([A-Za-z0-9_.-]+):\s*(?:#.*)?$")
_PERMISSIONS_KEY_RE = re.compile(r"^(\s+)permissions:\s*(.*?)\s*(?:#.*)?$")


def _line_indent(line):
    return len(line) - len(line.lstrip(" "))


def _classify_permissions_value(lines, key_idx, key_indent):
    """`lines[key_idx]` is a `permissions:` key at `key_indent`. Return
    (classification, detail) -- detail is a short human-readable string
    describing what was granted, for display only."""
    match = re.match(r"^\s*permissions:\s*(.*?)\s*(?:#.*)?$", lines[key_idx])
    inline = match.group(1).strip() if match else ""

    if inline:
        if inline == WRITE_ALL:
            return WRITE_ALL, "write-all"
        return EXPLICIT, inline

    # No inline value: gather the block-mapping lines that follow, each more
    # indented than the `permissions:` key itself.
    scopes = []
    i = key_idx + 1
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            i += 1
            continue
        if _line_indent(line) <= key_indent:
            break
        scopes.append(stripped)
        i += 1
    return EXPLICIT, (", ".join(scopes) if scopes else "(no scopes)")


def _find_top_level_permissions(lines):
    for idx, line in enumerate(lines):
        match = _TOP_PERMISSIONS_RE.match(line)
        if match:
            return idx
    return None


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
            jobs_block_end = i  # dedented past the jobs: block entirely
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
    return job_indent, [tuple(j) for j in jobs]


def _find_job_permissions(lines, start, end):
    """The shallowest-indented `permissions:` line within [start, end) --
    `permissions` is only a valid job-level key in the workflow schema, never
    a step input, so the shallowest match within a job's own body is its
    job-level grant."""
    best = None
    for idx in range(start, end):
        match = _PERMISSIONS_KEY_RE.match(lines[idx])
        if not match:
            continue
        indent = len(match.group(1))
        if best is None or indent < best[1]:
            best = (idx, indent)
    return best


def scan_text(text, filename="<workflow>"):
    """Scan one workflow file's text. Returns a list of finding dicts -- one
    per workflow-level grant (if any) and one per job, covering both risky
    and already-explicit cases so the output shows everything considered."""
    lines = text.splitlines()
    findings = []

    top_idx = _find_top_level_permissions(lines)
    top_classification = None
    if top_idx is not None:
        top_classification, detail = _classify_permissions_value(lines, top_idx, 0)
        findings.append(
            {
                "file": filename,
                "line": top_idx + 1,
                "scope": "workflow",
                "classification": top_classification,
                "detail": detail,
            }
        )

    jobs_idx = _find_jobs_start(lines)
    jobs = []
    if jobs_idx is not None:
        _job_indent, jobs = _find_jobs(lines, jobs_idx)

    for job_id, start, end in jobs:
        found = _find_job_permissions(lines, start + 1, end)
        if found is not None:
            perm_idx, indent = found
            classification, detail = _classify_permissions_value(lines, perm_idx, indent)
            findings.append(
                {
                    "file": filename,
                    "line": perm_idx + 1,
                    "scope": f"job:{job_id}",
                    "classification": classification,
                    "detail": detail,
                }
            )
        elif top_classification is None:
            findings.append(
                {
                    "file": filename,
                    "line": start + 1,
                    "scope": f"job:{job_id}",
                    "classification": UNSPECIFIED,
                    "detail": "no permissions block on this job or the workflow",
                }
            )
        else:
            findings.append(
                {
                    "file": filename,
                    "line": start + 1,
                    "scope": f"job:{job_id}",
                    "classification": top_classification,
                    "detail": "inherited from the workflow-level permissions",
                }
            )

    if top_idx is None and not jobs:
        findings.append(
            {
                "file": filename,
                "line": 1,
                "scope": "workflow",
                "classification": UNSPECIFIED,
                "detail": "no `permissions:` key and no `jobs:` section found",
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
        return f"Scanned {len(files)} workflow file(s); every workflow and job has an explicit permissions grant."

    risky = [f for f in findings if f["classification"] in RISK_CLASSIFICATIONS]
    explicit = [f for f in findings if f["classification"] == EXPLICIT]

    lines = []
    for f in risky:
        lines.append(f"!! {f['file']}:{f['line']}  {f['scope']}  [{f['classification']}]")
        if f["classification"] == WRITE_ALL:
            lines.append(
                "     fix: replace `permissions: write-all` with an explicit minimal set, "
                "e.g. `permissions:\\n  contents: read`"
            )
        else:
            lines.append(
                "     fix: add a `permissions:` block (workflow-level, or on this job) listing "
                "only the scopes it needs, e.g. `permissions:\\n  contents: read`"
            )
        lines.append("")

    lines.append(f"{len(risky)} risky finding(s), {len(explicit)} already explicit.")
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
        help="exit 2 when any write-all or unspecified permissions finding exists",
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
