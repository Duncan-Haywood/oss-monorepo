#!/usr/bin/env python3
"""Fail if a script does a `--depth` fetch into a named ref without a leading `+`.

A depth-limited fetch keeps no history, so the next fetch cannot tell that the
new tip descends from the one already stored. Git then calls the update
non-fast-forward and, with an unforced refspec, refuses it and exits 1. On
2026-11-14 `platform/counter/usage-data.mjs` fetched
`usage-data:refs/remotes/origin/usage-data` at depth 1. The branch gains a
commit a day, so in any clone that had run it once, every later `status`,
`show` or `sync` failed with "Could not fetch origin/usage-data" (found by a
red-team run; fixed with `+usage-data:...`).

It reads tracked scripts (.py, .mjs, .js, .cjs, .sh) outside `.github/`. A line
counts when it holds `fetch`, a depth flag and a `<src>:<dst>` refspec whose
destination starts `refs/`; it fails when the source lacks the `+`. Workflow
steps are left out: they run in a fresh clone where the ref cannot exist yet.
A refspec split onto a different line from the depth flag is not seen.

    python3 platform/ci/check_shallow_refspec.py      # exit 1 on an unforced refspec
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SUFFIXES = {".py", ".mjs", ".js", ".cjs", ".sh"}
DEPTH = re.compile(r"--depth\b")
# A refspec token: everything back to a quote, backtick, space or bracket.
REFSPEC = re.compile(r"""(?:^|(?<=[\s'"`\[(,]))([^\s'"`\[(,]*?):(refs/[^\s'"`\]),]+)""")


def unforced(line: str) -> list[str]:
    """Refspecs on a depth-fetch line whose source has no leading `+`."""
    if "fetch" not in line or not DEPTH.search(line):
        return []
    return [f"{src}:{dst}" for src, dst in REFSPEC.findall(line) if src and not src.startswith("+")]


def scan(root: Path, files: list[str]) -> list[tuple[str, int, str]]:
    out = []
    for rel in files:
        if rel.startswith(".github/") or Path(rel).suffix not in SUFFIXES:
            continue
        if Path(rel).name.startswith("test_") or ".test." in rel:
            continue  # tests quote the bad form on purpose
        try:
            text = (root / rel).read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for n, line in enumerate(text.splitlines(), 1):
            for spec in unforced(line):
                out.append((rel, n, spec))
    return out


def tracked(root: Path) -> list[str]:
    res = subprocess.run(["git", "ls-files", "-z"], cwd=root, capture_output=True, text=True, check=True)
    return [f for f in res.stdout.split("\0") if f]


def main(root: Path = REPO_ROOT) -> int:
    bad = scan(root, tracked(root))
    for rel, n, spec in bad:
        print(f"{rel}:{n}: `{spec}` is fetched with --depth but not forced; write `+{spec}` "
              "(a shallow ref cannot be fast-forwarded, so the next fetch is refused)")
    if bad:
        return 1
    print("check_shallow_refspec: every --depth fetch into a named ref is forced")
    return 0


if __name__ == "__main__":
    sys.exit(main())
