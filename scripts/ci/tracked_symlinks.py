#!/usr/bin/env python3
"""
Fail when a tracked symlink points outside the repository.

A symlink is committed as a blob whose content is the link target, so a link to
`/Users/someone/Projects/monorepo-projects/...` travels in the history as that
literal absolute path. On the machine that made it the tree looks correct; on a
CI runner or another clone the path resolves to nothing, or — worse — to
something else that happens to exist there. Nothing else in this repository
reads link targets, so the defect is invisible to every other control: it is a
regular tracked file to the coverage ratchet, the SAST scan, and the claims
audit alike.

This is not hypothetical. `ventures/real-estate-agent-photo-app/pipeline/
node_modules` was committed on 2026-08-04 as a symlink to an absolute path
under `/Users/duncan/`. It reached a merge because `.gitignore` said
`node_modules/`, and a trailing slash matches directories only — a *symlink*
named node_modules is not a directory, so the ignore rule passed over it. Both
halves are fixed: the pattern lost its slash and this check exists.

Two findings are reported, and they are different failures:

  absolute  the target begins with `/`. Machine-specific by construction; it
            cannot be correct anywhere but the machine that wrote it.
  escaping  the target is relative but climbs out of the repository root.
            Portable-looking and still unresolvable in a fresh clone.

Targets are read from the index rather than the filesystem, so the check
reports what would actually be committed even when the working tree has been
cleaned up but the index has not.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

GIT_SYMLINK_MODE = "120000"


class SymlinkScanError(RuntimeError):
    """The scan could not be performed, which is not the same as a clean scan."""


@dataclass(frozen=True)
class Finding:
    path: str
    target: str
    kind: str  # "absolute" | "escaping"

    @property
    def message(self) -> str:
        if self.kind == "absolute":
            return (
                f"{self.path} is a symlink to the absolute path {self.target!r}, "
                f"which exists only on the machine that committed it"
            )
        return (
            f"{self.path} is a symlink to {self.target!r}, which resolves outside "
            f"the repository"
        )


def _git(args: list[str], repo_root: Path) -> str:
    env = {**os.environ, "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_NOSYSTEM": "1"}
    proc = subprocess.run(
        ["git", *args],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        env=env,
    )
    if proc.returncode != 0:
        raise SymlinkScanError(
            f"git {' '.join(args)} failed in {repo_root}: {proc.stderr.strip()}"
        )
    return proc.stdout


def tracked_symlinks(repo_root: Path = REPO_ROOT) -> list[tuple[str, str]]:
    """Every tracked symlink as (path, target), read from the index."""
    listing = _git(["ls-files", "-s", "-z"], repo_root)
    entries: list[tuple[str, str]] = []
    blobs: list[str] = []
    for record in listing.split("\0"):
        if not record:
            continue
        meta, _, path = record.partition("\t")
        fields = meta.split()
        if len(fields) < 2 or fields[0] != GIT_SYMLINK_MODE:
            continue
        blobs.append(fields[1])
        entries.append((path, fields[1]))

    if not entries:
        return []

    # One batch call: a repository with many links should not cost one fork each.
    env = {**os.environ, "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_NOSYSTEM": "1"}
    proc = subprocess.run(
        ["git", "cat-file", "--batch"],
        cwd=str(repo_root),
        input="\n".join(blobs) + "\n",
        capture_output=True,
        text=True,
        env=env,
    )
    if proc.returncode != 0:
        raise SymlinkScanError(f"git cat-file --batch failed: {proc.stderr.strip()}")

    targets: list[str] = []
    stream = proc.stdout
    cursor = 0
    for _ in blobs:
        header_end = stream.index("\n", cursor)
        header = stream[cursor:header_end]
        size = int(header.split()[2])
        start = header_end + 1
        targets.append(stream[start : start + size])
        cursor = start + size + 1  # trailing newline git appends after the blob

    return [(path, target) for (path, _sha), target in zip(entries, targets)]


def _escapes(path: str, target: str, repo_root: Path) -> bool:
    """Does `target`, read from the directory holding `path`, leave the repo?"""
    link_dir = os.path.dirname(path)
    # normpath, not resolve: resolve() follows symlinks in the repo root's own
    # path, which on macOS turns /tmp into /private/tmp and reports a false
    # escape for every link in a repository under a symlinked directory.
    combined = os.path.normpath(os.path.join(link_dir, target))
    return combined == ".." or combined.startswith("../")


def find_escaping_symlinks(repo_root: Path = REPO_ROOT) -> list[Finding]:
    findings: list[Finding] = []
    for path, target in tracked_symlinks(repo_root):
        if os.path.isabs(target):
            findings.append(Finding(path=path, target=target, kind="absolute"))
        elif _escapes(path, target, repo_root):
            findings.append(Finding(path=path, target=target, kind="escaping"))
    return findings


def format_report(findings: list[Finding]) -> str:
    lines = ["=== Tracked symlinks ==="]
    if not findings:
        lines.append("PASS: no tracked symlink points outside the repository.")
        return "\n".join(lines)
    lines.append(f"FAIL: {len(findings)} tracked symlink(s) point outside the repository.")
    for finding in findings:
        lines.append(f"  [{finding.kind}] {finding.message}")
    lines.append("")
    lines.append(
        "Remove the link with `git rm --cached <path>` and ignore the path, or "
        "replace it with a target inside the repository."
    )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", default=str(REPO_ROOT))
    parser.add_argument("--json", action="store_true")
    parser.add_argument(
        "--report",
        action="store_true",
        help="print findings but always exit 0",
    )
    args = parser.parse_args(argv)
    repo_root = Path(args.repo_root).resolve()

    try:
        findings = find_escaping_symlinks(repo_root)
    except SymlinkScanError as exc:
        # A scan that could not run is not a clean scan.
        if args.json:
            print(json.dumps({"ok": False, "status": "not-measurable", "error": str(exc)}, indent=2))
        else:
            print(f"FAIL: {exc}", file=sys.stderr)
        return 0 if args.report else 1

    if args.json:
        print(
            json.dumps(
                {
                    "ok": not findings,
                    "status": "fail" if findings else "pass",
                    "findings": [asdict(f) for f in findings],
                },
                indent=2,
            )
        )
    else:
        print(format_report(findings))

    if args.report:
        return 0
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
