#!/usr/bin/env python3
"""Find two well-documented GitHub Actions cache-poisoning patterns in workflow YAML.

    python3 check.py                       # scan .github/workflows under .
    python3 check.py /path/to/repo         # scan a specific checkout
    python3 check.py --format json         # machine-readable
    python3 check.py --fail-on-risk        # exit 2 if any finding exists

## The two risks this catches

**1. Cache write reachable from an untrusted trigger** — GitHub Actions cache
entries are scoped to the *repository*, not to the workflow, the branch, or
the trust level of whoever triggered the run. A job triggered by
`pull_request_target` or `workflow_run` runs with the base repository's
`GITHUB_TOKEN`, but the event that triggered it is raised by a stranger's
fork. If that job writes to the cache — an `actions/cache@` step (which both
restores and, on a cache miss, saves) or an explicit `actions/cache/save@`
step — the fork controls what gets written into a cache namespace a later,
more privileged workflow may restore from. This is the exact root cause
documented in the TanStack Router incident (May 2026): a fork PR opened
against a `pull_request_target` workflow wrote a poisoned dependency-store
cache entry on every push, and the project's own release pipeline later
restored it and executed the payload. It is the cache equivalent of the
checkout-based "pwn request" this portfolio's `actions-injection-check`
already flags — same trigger gate, different sink.

**2. Unscoped `restore-keys`** — GitHub's own cache docs recommend
`restore-keys` as a fallback list so a cache miss on the exact key still
warms from the most recent related entry. The mechanism that makes this
convenient is what makes it risky: a miss on the exact key can still restore
a *different* entry that only shares the key prefix — described by
independent researchers (AdnaneKhan's `ActionsCacheBlasting` proof-of-concept,
Hive Security's cache-poisoning writeup) as "all keys are restore keys" in
practice. An attacker who can write any cache entry under a shared prefix —
including from an unrelated, unprivileged job — can get a privileged
`restore-keys` fallback to adopt it on the next miss. This finding is not
gated on trigger type, because the risk lives on the *restoring* side: a
`restore-keys` fallback is exactly as risky on a `push`-to-`main` workflow
as anywhere else, if anything in the repository can write a colliding key.

## What this tool actually does, and does not do

A static, read-only, line-oriented scanner over `.github/workflows/*.yml` and
`*.yaml` files already on disk. It makes **no network calls of any kind**. It
is not a YAML parser (a small regex/indentation scan, the same design choice
`actions-injection-check` and `pinned-actions-check` make and document) and it
does not execute anything it finds. A clean scan is not a security audit: it
does not catch a `cache:` input on `actions/setup-node`, `actions/setup-python`,
`actions/setup-java`, or `actions/setup-go` (their built-in caching uses the
same underlying mechanism but a different, action-specific key shape this
scanner does not attempt to model), and it does not correlate a write in one
workflow file with a restore in another — each finding is about what a single
workflow file does on its own.

## Classification

  - `cache-write-on-untrusted-trigger` — a workflow triggered by
    `pull_request_target` or `workflow_run` contains an `actions/cache@`
    (unified action, writes on a miss) or `actions/cache/save@` step.
  - `unscoped-restore-keys` — an `actions/cache@` or `actions/cache/restore@`
    step whose block sets `restore-keys:`.

Exit status: 0 normally (even with findings, unless --fail-on-risk), 2 if
--fail-on-risk was given and at least one finding exists.
"""

import argparse
import json
import re
import sys
from pathlib import Path

CACHE_WRITE_ON_UNTRUSTED_TRIGGER = "cache-write-on-untrusted-trigger"
UNSCOPED_RESTORE_KEYS = "unscoped-restore-keys"

RISK_CLASSIFICATIONS = frozenset({CACHE_WRITE_ON_UNTRUSTED_TRIGGER, UNSCOPED_RESTORE_KEYS})

# Whole-file, not scoped to the `on:` block -- the same deliberate
# simplification actions-injection-check makes with this identical regex.
_UNTRUSTED_TRIGGER_RE = re.compile(r"\bpull_request_target\b|\bworkflow_run\b")

# actions/cache@vX (unified: restores, and saves on a miss),
# actions/cache/save@vX (write-only), actions/cache/restore@vX (read-only).
_CACHE_ACTION_RE = re.compile(
    r"^(?P<indent>\s*)(?:-\s*)?uses:\s*[\"']?actions/cache(?:/(?P<variant>save|restore))?@"
)
_RESTORE_KEYS_RE = re.compile(r"^(?P<indent>\s*)restore-keys:")

_CACHE_WRITE_REMEDIATION = (
    "This job is reachable from a fork (pull_request_target/workflow_run) and writes into "
    "the repository-scoped Actions cache. A later privileged workflow (a push-to-main or "
    "release build, say) that restores from the same cache namespace can pick up the fork's "
    "entry -- the root cause behind the May 2026 TanStack Router incident. Do not cache in a "
    "job reachable from an untrusted trigger, or key it so no privileged job ever restores "
    "from the same namespace (prefix the key with the untrusted run's own run id, never a "
    "branch name or lockfile hash a privileged job also uses)."
)

_RESTORE_KEYS_REMEDIATION = (
    "restore-keys enables prefix-fallback: a miss on the exact key can still restore a "
    "different entry that only shares the prefix, which is what let independent researchers "
    "(AdnaneKhan's ActionsCacheBlasting, Hive Security's cache-poisoning writeup) demonstrate a "
    "near-collision key being adopted. If anything else in this repository -- including an "
    "unprivileged job -- can write a cache entry under the same prefix, narrow this to an "
    "exact key or drop the fallback list."
)


def line_indent(line):
    return len(line) - len(line.lstrip(" "))


def scan_text(text, filename="<workflow>"):
    """Scan one workflow file's text. Returns a list of finding dicts."""
    findings = []
    lines = text.splitlines()
    trigger_is_untrusted = bool(_UNTRUSTED_TRIGGER_RE.search(text))

    cache_step_indent = None
    cache_step_variant = None  # None = unified (reads+writes), "save", "restore"

    for lineno, line in enumerate(lines, start=1):
        if cache_step_indent is not None:
            if line.strip() == "":
                pass
            elif line_indent(line) <= cache_step_indent:
                cache_step_indent = None
                cache_step_variant = None
            else:
                if _RESTORE_KEYS_RE.match(line) and cache_step_variant != "save":
                    label = "actions/cache" + (f"/{cache_step_variant}" if cache_step_variant else "")
                    findings.append(
                        {
                            "file": filename,
                            "line": lineno,
                            "type": UNSCOPED_RESTORE_KEYS,
                            "detail": f"restore-keys on {label}",
                            "remediation": _RESTORE_KEYS_REMEDIATION,
                        }
                    )

        cache_match = _CACHE_ACTION_RE.match(line)
        if cache_match:
            variant = cache_match.group("variant")
            cache_step_indent = len(cache_match.group("indent"))
            cache_step_variant = variant
            if trigger_is_untrusted and variant != "restore":
                label = "actions/cache" + (f"/{variant}" if variant else "")
                findings.append(
                    {
                        "file": filename,
                        "line": lineno,
                        "type": CACHE_WRITE_ON_UNTRUSTED_TRIGGER,
                        "detail": label,
                        "remediation": _CACHE_WRITE_REMEDIATION,
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

    writes = [f for f in findings if f["type"] == CACHE_WRITE_ON_UNTRUSTED_TRIGGER]
    restores = [f for f in findings if f["type"] == UNSCOPED_RESTORE_KEYS]

    lines = []
    for f in writes:
        lines.append(f"!! {f['file']}:{f['line']}  cache-write-on-untrusted-trigger")
        lines.append(f"     step: {f['detail']}")
        lines.append(f"     fix: {f['remediation']}")
        lines.append("")
    for f in restores:
        lines.append(f"!! {f['file']}:{f['line']}  unscoped-restore-keys")
        lines.append(f"     step: {f['detail']}")
        lines.append(f"     fix: {f['remediation']}")
        lines.append("")

    lines.append(
        f"{len(writes)} cache-write-on-untrusted-trigger finding(s), "
        f"{len(restores)} unscoped-restore-keys finding(s)."
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
