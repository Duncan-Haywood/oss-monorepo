#!/usr/bin/env python3
"""Find GitHub Actions `uses:` references that are not pinned to a full commit SHA.

    python3 unpinned-action.py [path] [--format json] [--fail-on-risk]

A tag or branch (`@v4`, `@main`) is mutable: whoever controls that repository
can move it to new code, and your workflow runs it with your token and secrets
on the next trigger. Only a full 40-character commit SHA is immutable.

Rules:
  unpinned-third-party-action  owner/repo@ref where the owner is not GitHub's
                               own `actions` or `github` organisation, and ref
                               is not a 40-hex SHA.
  unpinned-first-party-action  the same for `actions/*` and `github/*`
                               (lower risk, same mechanism).
  unpinned-docker-action       `docker://image` without an `@sha256:` digest.

Skipped: local actions (`./path`) and refs that are a full SHA. A `uses:` whose
ref is an expression (`${{ ... }}`) is skipped, not evaluated.

Line-oriented, read-only, no network calls. It does not resolve what a ref
points to and cannot tell you the pinned SHA is trustworthy; it only flags
mutable references. Exit 0 normally; 2 with --fail-on-risk and any finding.
"""
import argparse
import json
import re
import sys
from pathlib import Path

THIRD = "unpinned-third-party-action"
FIRST = "unpinned-first-party-action"
DOCKER = "unpinned-docker-action"

_USES_RE = re.compile(r"""^\s*(?:-\s+)?uses:\s*(?P<q>["']?)(?P<ref>[^\s"'#]+)(?P=q)\s*(?:#.*)?$""")
_SHA_RE = re.compile(r"^[0-9a-f]{40}$", re.I)
_FIRST_PARTY = {"actions", "github"}

_FIX = (
    "Pin to the full commit SHA of the release you reviewed and keep the tag in a "
    "comment, e.g. `uses: owner/repo@<40-hex-sha> # v1.2.3`. Dependabot or Renovate "
    "can keep pinned SHAs current."
)
_DOCKER_FIX = "Pin the image by digest: `docker://image@sha256:<digest>`."


def scan_text(text, filename="<workflow>"):
    findings = []
    for n, line in enumerate(text.splitlines(), 1):
        m = _USES_RE.match(line)
        if not m:
            continue
        ref = m.group("ref")
        if ref.startswith("./") or ref.startswith("../") or "${{" in ref:
            continue
        if ref.startswith("docker://"):
            if "@sha256:" not in ref:
                findings.append({"file": filename, "line": n, "type": DOCKER,
                                 "detail": f"{ref} has no digest", "remediation": _DOCKER_FIX})
            continue
        if "@" not in ref:
            continue
        target, _, version = ref.rpartition("@")
        if _SHA_RE.match(version):
            continue
        owner = target.split("/", 1)[0].lower()
        kind = FIRST if owner in _FIRST_PARTY else THIRD
        findings.append({"file": filename, "line": n, "type": kind,
                         "detail": f"{target}@{version} is a mutable ref, not a commit SHA",
                         "remediation": _FIX})
    return findings


def scan_path(root):
    d = Path(root) / ".github" / "workflows"
    files = sorted(list(d.glob("*.yml")) + list(d.glob("*.yaml"))) if d.is_dir() else []
    out = []
    for p in files:
        try:
            out.extend(scan_text(p.read_text(encoding="utf-8"), filename=str(p)))
        except OSError as exc:
            print(f"warning: could not read {p}: {exc}", file=sys.stderr)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("path", nargs="?", default=".")
    ap.add_argument("--format", choices=("text", "json"), default="text")
    ap.add_argument("--fail-on-risk", action="store_true")
    a = ap.parse_args(argv)
    findings = scan_path(a.path)
    if a.format == "json":
        print(json.dumps(findings, indent=2))
    elif not findings:
        print("No unpinned action references found.")
    else:
        for f in findings:
            print(f"!! {f['file']}:{f['line']}  {f['type']}\n     {f['detail']}\n     fix: {f['remediation']}\n")
        print(f"{len(findings)} unpinned reference(s).")
    return 2 if (a.fail_on_risk and findings) else 0


if __name__ == "__main__":
    sys.exit(main())
