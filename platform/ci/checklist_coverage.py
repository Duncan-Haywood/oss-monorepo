#!/usr/bin/env python3
"""Fail when a `*.test.mjs` directory exists that CLAUDE.md's merge checklist
does not name.

    python3 platform/ci/checklist_coverage.py

## What this is here to catch

CLAUDE.md's "Ship without review ceremony" section lists the local verification
commands to run while Actions runners are starved. Three of those lines --
`platform/proposal/`, then `platform/privacy/` and `platform/webcheck/` -- were
each added only after the fact, by hand, after a guard in an un-enumerated
directory had already gone unrun for days:

  - `platform/proposal/term-ids.test.mjs` stayed red on `main` while five
    separate sessions shipped the exact bug it exists to catch, each recording
    a clean local verification, because the verification list they ran did not
    mention it.
  - `platform/privacy/` and `platform/webcheck/` were not red, but were found
    the same way: nobody had asked "what else is outside the list?" until
    CLAUDE.md itself said so, in prose, after the fact.

CLAUDE.md's own conclusion from that: "Enumerate the ground instead of
recalling it; the command is faster than the recollection and it cannot be
honestly wrong." This script is that enumeration, run as code instead of
prose, so the next `platform/<new-thing>/*.test.mjs` directory is a failing
check the day it is added rather than a paragraph added to CLAUDE.md after a
bug ships. Unlike the `platform/ci` unittest loop (a glob that auto-discovers
new `test_*.py` modules) and `pytest gitops/tests` (one line running a whole
tree), the `node --test` lines name each directory literally -- there is no
glob covering "every `platform/*` test dir" -- so this is the one place drift
can quietly recur.

`ventures/*` is excluded: the checklist already covers it with a standing
`ventures/<slug>/*.test.mjs` placeholder line, and a fresh venture directory
is not itself a checklist gap.

Exit 0: every `*.test.mjs` directory outside `ventures/` is named somewhere in
the checklist block. Exit 1: prints each directory that is not, with the line
to add.
"""

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# The checklist block opens with the regen.mjs line and is a fenced ``` block
# in CLAUDE.md's "Ship without review ceremony" section.
BLOCK_START_MARKER = "node platform/marketing/regen.mjs"

TEST_MJS_GLOB_RE = re.compile(r"(\S+?)/\*\.test\.mjs")


def read_checklist_block(claude_md_text):
    """Return the fenced code block that contains BLOCK_START_MARKER, or None."""
    idx = claude_md_text.find(BLOCK_START_MARKER)
    if idx == -1:
        return None
    # Walk backward to the opening ``` of the fence this line lives in.
    start_fence = claude_md_text.rfind("```", 0, idx)
    if start_fence == -1:
        return None
    end_fence = claude_md_text.find("```", idx)
    if end_fence == -1:
        return None
    return claude_md_text[start_fence:end_fence]


def checklist_directories(block_text):
    """Directories the checklist names via a `<dir>/*.test.mjs` glob.

    A line may name more than one glob (`node --test a/*.test.mjs b/*.test.mjs`).
    `ventures/<slug>` is returned as the literal string "ventures" -- callers
    that exclude ventures/* from the disk scan don't need to special-case it,
    but it is reported as covered rather than as a real, checkable directory.
    """
    dirs = set()
    for match in TEST_MJS_GLOB_RE.finditer(block_text):
        dirs.add(match.group(1))
    return dirs


def actual_test_mjs_dirs(repo_root):
    """Directories under repo_root holding a `*.test.mjs` file, as repo-root-relative
    POSIX paths, excluding ventures/*, node_modules, and dotdirs."""
    found = set()
    for path in repo_root.rglob("*.test.mjs"):
        rel = path.relative_to(repo_root)
        parts = rel.parts
        if parts[0] in ("node_modules", "ventures") or parts[0].startswith("."):
            continue
        if any(p.startswith(".") or p == "node_modules" for p in parts):
            continue
        found.add(rel.parent.as_posix())
    return found


def find_gaps(claude_md_text, repo_root):
    """Return (gaps, checklist_dirs, disk_dirs). `gaps` is disk_dirs not covered
    by any checklist_dirs entry (a checklist dir covers itself and its
    subdirectories, since a line can glob a parent that contains several test
    files across nested folders)."""
    block = read_checklist_block(claude_md_text)
    if block is None:
        raise ValueError(
            "could not find the merge-checklist code block in CLAUDE.md "
            f"(looked for a fenced block containing {BLOCK_START_MARKER!r})"
        )
    checklist_dirs = checklist_directories(block)
    disk_dirs = actual_test_mjs_dirs(repo_root)

    def covered(d):
        return any(d == c or d.startswith(c + "/") for c in checklist_dirs)

    gaps = sorted(d for d in disk_dirs if not covered(d))
    return gaps, checklist_dirs, disk_dirs


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--claude-md",
        default=str(REPO_ROOT / "CLAUDE.md"),
        help="path to CLAUDE.md (default: repo root)",
    )
    parser.add_argument(
        "--repo-root",
        default=str(REPO_ROOT),
        help="repo root to scan for *.test.mjs files (default: this repo)",
    )
    args = parser.parse_args(argv)

    claude_md_text = Path(args.claude_md).read_text()
    repo_root = Path(args.repo_root)

    try:
        gaps, checklist_dirs, disk_dirs = find_gaps(claude_md_text, repo_root)
    except ValueError as exc:
        print(f"checklist_coverage: {exc}", file=sys.stderr)
        return 2

    if gaps:
        if len(gaps) == 1:
            noun = "1 directory that carries"
        else:
            noun = f"{len(gaps)} directories that carry"
        print(
            "checklist_coverage: CLAUDE.md's merge checklist does not name "
            f"{noun} *.test.mjs files:\n"
        )
        for d in gaps:
            print(f"  {d}/  ->  add: node --test {d}/*.test.mjs")
        print(
            "\nAdd each line to the checklist in CLAUDE.md's \"Ship without "
            "review ceremony\" section, in the same commit as whatever put "
            "tests there -- see the file's own note on platform/proposal, "
            "platform/privacy and platform/webcheck for why this recurs."
        )
        return 1

    print(
        f"checklist_coverage: {len(disk_dirs)} test.mjs "
        f"director{'y' if len(disk_dirs) == 1 else 'ies'} outside ventures/, "
        f"all named in CLAUDE.md's checklist ({len(checklist_dirs)} entries)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
