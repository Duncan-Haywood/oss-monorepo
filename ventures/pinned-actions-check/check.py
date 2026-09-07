#!/usr/bin/env python3
"""Find GitHub Actions workflow steps that trust a mutable ref instead of a
pinned commit SHA.

    python3 check.py                       # scan .github/workflows under .
    python3 check.py /path/to/repo         # scan a specific checkout
    python3 check.py --format json         # machine-readable
    python3 check.py --fail-on-risk        # exit 2 if any mutable finding exists

## The risk this catches

A workflow step like:

    - uses: some-org/some-action@v4

trusts whatever commit `v4` points at *right now*. Nothing stops the action's
owner (or an attacker who compromises their account) from moving that tag to
point at different code tomorrow — and the next time your workflow runs, it
runs that new code with whatever permissions and secrets the workflow has.
This is a documented, widely-recommended GitHub Actions hardening practice
(see GitHub's own "Security hardening for GitHub Actions" docs), not a novel
claim: pin third-party actions to a full 40-character commit SHA instead of a
tag or branch name, because a commit SHA cannot be silently repointed.

A real, well-known incident of exactly this shape: `tj-actions/changed-files`
had its `v35`-family tags repointed at a malicious commit in March 2025,
exposing CI secrets in any workflow that referenced it by tag rather than SHA.

## What this tool actually does, and does not do

It is a static, read-only line scanner. It reads `.github/workflows/*.yml`
and `*.yaml` files already on disk and classifies each `uses:` reference. It
makes **no network calls of any kind** — it never fetches a repository, never
resolves a tag to a commit, and never contacts GitHub. When it flags a
mutable ref, it prints the exact `git ls-remote` command *you* can run to
look up what that ref currently resolves to; running that command, and
deciding whether to pin to the SHA it reports, is entirely up to you.

This tool never claims a repository is "secure" or "compliant" — only that a
specific `uses:` line does or does not reference a fixed commit. Supply-chain
risk in CI is broader than ref-pinning alone (compromised runners, malicious
dependencies pulled at build time, etc.); this addresses one specific,
well-documented piece of it.

## Classification

  - `pinned`  — the ref after `@` is a 40-character hex commit SHA.
  - `mutable` — the ref is anything else (a tag like `v4`, a branch like
                `main`) — third-party and not pinned. Flagged.
  - `local`   — the action starts with `./` — a local composite/JS action in
                this same repo, not a third-party supply-chain risk. Skipped.
  - `docker`  — the action starts with `docker://` — a container reference,
                out of scope for this tool (it has its own pinning story via
                the image digest). Skipped.

Exit status: 0 normally (even with mutable findings, unless --fail-on-risk),
2 if --fail-on-risk was given and at least one mutable finding exists.
"""

import argparse
import json
import re
import sys
from pathlib import Path

PINNED = "pinned"
MUTABLE = "mutable"
LOCAL = "local"
DOCKER = "docker"

RISK_CLASSIFICATIONS = frozenset({MUTABLE})

# A commit SHA is exactly 40 hex characters. GitHub also accepts abbreviated
# SHAs in some contexts, but a short SHA is not the thing this check exists to
# reward -- it can collide and it is not what GitHub's own hardening guidance
# recommends -- so only a full 40-character SHA counts as pinned.
_SHA_RE = re.compile(r"^[0-9a-f]{40}$")

# Matches a `uses:` line (top-level "- uses:" or "uses:" nested under it),
# capturing the action reference and the ref after the last "@". This is a
# small regex scanner rather than a YAML parser on purpose: workflow files are
# simple enough that this never disagrees with a real parser in practice, it
# has zero dependencies, and classify.mjs in the browser can use the exact
# same approach with no YAML library, so the CLI and the page never drift.
_USES_RE = re.compile(r"^(?P<indent>\s*)(?:-\s*)?uses:\s*(?P<value>\S+)\s*(?:#.*)?$")


def strip_quotes(value):
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def looks_like_version_tag(ref):
    """Heuristic used only to pick the remediation command's ref type.

    A ref like "v4", "v4.1.0", or "4" reads as a version tag; anything else
    (a branch name like "main", "develop", "release-branch") is more likely a
    head. This never changes the finding's classification -- only which git
    ls-remote form we suggest first.
    """
    return bool(re.match(r"^v?\d+(\.\d+){0,2}$", ref))


def classify_uses(value):
    """Classify one `uses:` value. Returns (classification, action, ref)."""
    value = strip_quotes(value.strip())

    if value.startswith("./") or value.startswith("../"):
        return LOCAL, value, None
    if value.startswith("docker://"):
        return DOCKER, value, None

    if "@" not in value:
        # No ref at all is not classifiable as pinned or mutable in the sense
        # this tool cares about (some third-party actions omit a ref, which
        # GitHub resolves to the default branch -- the most mutable case of
        # all). Treat it as mutable with no ref to report a remediation for.
        return MUTABLE, value, None

    action, ref = value.rsplit("@", 1)
    if _SHA_RE.match(ref.lower()):
        return PINNED, action, ref
    return MUTABLE, action, ref


def remediation_command(action, ref):
    """The exact, read-only command a user can run to look up the current
    commit a mutable ref resolves to. This tool never runs it."""
    if "/" not in action:
        return None
    org_repo = action.split("/", 1)
    # Actions can live in a subdirectory of a repo (org/repo/subpath@ref);
    # git ls-remote only needs the repo itself.
    repo_parts = action.split("/")
    if len(repo_parts) >= 2:
        org, repo = repo_parts[0], repo_parts[1]
    else:
        org, repo = org_repo[0], ""
    if not repo:
        return None
    url = f"https://github.com/{org}/{repo}"
    if ref is None:
        return f"git ls-remote {url}"
    ref_path = f"refs/tags/{ref}" if looks_like_version_tag(ref) else f"refs/heads/{ref}"
    return f"git ls-remote {url} {ref_path}"


def scan_text(text, filename="<workflow>"):
    """Scan one workflow file's text. Returns a list of finding dicts."""
    findings = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        match = _USES_RE.match(line)
        if not match:
            continue
        classification, action, ref = classify_uses(match.group("value"))
        if classification not in (PINNED, MUTABLE):
            continue  # local/docker: not third-party, not this tool's concern
        finding = {
            "file": filename,
            "line": lineno,
            "action": action,
            "ref": ref,
            "classification": classification,
        }
        if classification == MUTABLE:
            finding["remediation"] = remediation_command(action, ref)
        findings.append(finding)
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


def has_unresolved_risk(findings):
    return any(f["classification"] in RISK_CLASSIFICATIONS for f in findings)


def render_text(findings, root):
    if not findings:
        files = discover_workflow_files(root)
        if not files:
            return "No .github/workflows/*.yml or *.yaml files found under " + str(root)
        return f"Scanned {len(files)} workflow file(s); no third-party `uses:` references found."

    mutable = [f for f in findings if f["classification"] == MUTABLE]
    pinned = [f for f in findings if f["classification"] == PINNED]

    lines = []
    for f in mutable:
        ref_display = f["ref"] if f["ref"] is not None else "(no ref given — resolves to the default branch)"
        lines.append(f"!! {f['file']}:{f['line']}  {f['action']}@{f['ref'] if f['ref'] else ''}".rstrip("@"))
        lines.append(f"     ref: {ref_display}")
        if f.get("remediation"):
            lines.append(f"     fix: {f['remediation']}")
        lines.append("")

    lines.append(
        f"{len(mutable)} mutable reference(s) found, {len(pinned)} already pinned to a commit SHA."
    )
    if mutable:
        lines.append(
            "A mutable ref (a tag or branch) can be repointed at different code by "
            "its owner at any time. Run the ls-remote command above for each finding, "
            "then replace @<ref> with @<the commit SHA it printed> (keep the ref as a "
            "trailing comment, e.g. `@<sha> # v4`)."
        )
    else:
        lines.append("Every third-party action reference is pinned to a commit SHA.")
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
        help="exit 2 when any mutable (unpinned) third-party action reference is found",
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
