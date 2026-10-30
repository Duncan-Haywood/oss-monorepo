#!/usr/bin/env python3
"""Fail if any tracked file still carries a merge-conflict marker.

Why this exists
---------------
On 2026-08-26 a merge of #1032 was resolved carefully in the four files the
venture's own test suite loads, then committed with `git add -A`. Two files
that the suite never imports -- `ventures/cut-list-optimizer/VENTURE.yaml` and
the append-only `portfolio/ledger/2026-08.yaml` -- went in with their markers
intact. Every test stayed green. `main` was red on `router/validate.py` for
the next several minutes, on a check that runs on every portfolio PR, so
unrelated branches showed a red check that read as their own fault.

That failure mode is structural, not careless. A test suite can only catch a
bad resolution in a file it loads, and most of this repo's YAML, Markdown, and
ledger files are loaded by nothing. Several sessions merge here per hour, so
this will happen again. The check costs milliseconds and covers every tracked
file at once.

Run it locally the same way CI does:

    python3 platform/ci/check_conflict_markers.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# Built by concatenation so this file does not match its own check.
OPEN_MARKER = "<" * 7
CLOSE_MARKER = ">" * 7
BASE_MARKER = "|" * 7
SPLIT_MARKER = "=" * 7

# `<<<<<<<`, `>>>>>>>` and `|||||||` at the start of a line are what git writes
# and effectively never occur in real content. A bare `=======` line does occur
# legitimately -- Markdown setext headings, decorative rules -- so it is only
# reported in a file that already has one of the unambiguous markers.
DEFINITE = (OPEN_MARKER, CLOSE_MARKER, BASE_MARKER)


def tracked_files() -> list[Path]:
    """Every file git knows about. Keeps build output and vendored trees out."""
    listing = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return [REPO_ROOT / name for name in listing.split("\0") if name]


# Formats whose files always carry a NUL byte in their first 8 KB, so git
# treats them as binary and never writes conflict markers into them: it keeps
# one side and reports a binary conflict instead. The CI job leaves these out
# of its sparse checkout (P048: the MP3s alone are half the tree's bytes), and
# only these may be missing from the working tree. Any other tracked file that
# is absent fails the check, so a narrower checkout cannot pass by scanning
# less.
BINARY_SUFFIXES = frozenset({".mp3", ".png", ".zip", ".webp", ".woff2", ".ttf", ".ico", ".gif"})


def absent_text_files(paths: list[Path]) -> list[Path]:
    """Tracked files missing from the working tree that could hold a marker."""
    return [
        p for p in paths
        if p.suffix.lower() not in BINARY_SUFFIXES and not p.exists() and not p.is_symlink()
    ]


def markers_in(path: Path) -> list[tuple[int, str]]:
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        # Binary, or a symlink to nothing. Neither can carry a marker that a
        # human would ever be asked to resolve.
        return []

    lines = text.split("\n")
    definite = [
        (number, line)
        for number, line in enumerate(lines, start=1)
        if line.startswith(DEFINITE)
    ]
    if not definite:
        return []

    ambiguous = [
        (number, line)
        for number, line in enumerate(lines, start=1)
        if line.rstrip() == SPLIT_MARKER
    ]
    return sorted(definite + ambiguous)


def main() -> int:
    this_file = Path(__file__).resolve()
    tracked = tracked_files()
    missing = absent_text_files(tracked)
    if missing:
        print(f"{len(missing)} tracked file(s) that could hold a marker are not in the working tree:\n")
        for path in missing[:20]:
            print(f"  {path.relative_to(REPO_ROOT)}")
        print(
            "\nOnly BINARY_SUFFIXES may be left out of a sparse checkout. Widen the"
            "\ncheckout, or this check would pass by reading less than it reports."
        )
        return 1
    findings: list[tuple[Path, int, str]] = []

    for path in tracked:
        if path.resolve() == this_file:
            continue
        for number, line in markers_in(path):
            findings.append((path, number, line))

    if not findings:
        print("No merge-conflict markers in any tracked file.")
        return 0

    files = sorted({path for path, _, _ in findings})
    print(f"{len(findings)} conflict marker(s) across {len(files)} file(s):\n")
    for path, number, line in findings:
        print(f"  {path.relative_to(REPO_ROOT)}:{number}: {line.rstrip()[:80]}")
    print(
        "\nA conflict was committed unresolved. Resolve it in the file, keeping"
        "\nboth sides where both are additive -- an append-only ledger or a"
        "\nfeature list is almost never a case where one side supersedes the"
        "\nother -- then commit again."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
