#!/usr/bin/env python3
"""Report backticked repo paths in steering Markdown that point at nothing.

`check_md_links.py` only sees `[text](target)` links. The steering documents
mostly name files in backticks (`platform/ci/foo.py`), and those rot silently
when a file moves. This checks inline-code tokens that look like repo paths:
they contain a `/`, start at a top-level tracked directory (or a tracked
top-level file), and use no placeholders (`<slug>`, `*`, `{}`, `...`, `$`).
A trailing `:line`, `#anchor` or ` --flag` is ignored.

Usage:
    python3 platform/ci/check_code_refs.py [--root DIR] [PATH ...]

Default files: the steering documents (see DEFAULT_GLOBS). Exit 0: none
missing. Exit 1: printed as file:line: token.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

CODE_SPAN_RE = re.compile(r"``(.+?)``|`([^`\n]+)`")
FENCE_RE = re.compile(r"^\s*(```|~~~)")
PLACEHOLDER_RE = re.compile(r"[<>*{}$|\[\]()=,;\"'~]|\.\.\.|\\|\bN\b|\bX\b|YYYY|MM-DD")
PATH_RE = re.compile(r"^[A-Za-z0-9_.\-]+(?:/[A-Za-z0-9_.\-]+)+/?$")
DEFAULT_GLOBS = (
    "CLAUDE.md", "AGENTS.md", "README.md", "prompt.md", "PRODUCT_PLAYBOOK.md",
    "prompts/*.md", "prompts/*/*.md", ".github/prompts/*.md",
)
# experiments.md is a dated log: it names files as they were when written.
ARCHIVE_DIRS = ("docs/history/", "prompts/experiments.md")


def tracked(root: Path) -> list[str]:
    out = subprocess.run(
        ["git", "-C", str(root), "ls-files"],
        capture_output=True, text=True, check=True,
    ).stdout
    return [p for p in out.split("\n") if p]


def default_files(root: Path) -> list[Path]:
    seen: dict[Path, None] = {}
    for g in DEFAULT_GLOBS:
        for p in sorted(root.glob(g)):
            if p.is_file():
                seen[p] = None
    return list(seen)


def candidate(token: str) -> str | None:
    """Normalise a code span to a repo-relative path, or None if not one."""
    tok = token.strip()
    tok = re.split(r"\s", tok, maxsplit=1)[0]
    tok = re.sub(r"#.*$", "", tok)
    tok = re.sub(r":\d+(-\d+)?$", "", tok)
    if not tok or PLACEHOLDER_RE.search(tok) or "://" in tok:
        return None
    if tok.startswith(("/", "./", "../", "-")):
        return None
    return tok if PATH_RE.match(tok) else None


def refs_in(text: str):
    in_fence = False
    for n, line in enumerate(text.split("\n"), 1):
        if FENCE_RE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        for m in CODE_SPAN_RE.finditer(line):
            c = candidate(m.group(1) or m.group(2))
            if c:
                yield n, c


def missing_refs(path: Path, root: Path, tops: set[str], known: set[str] = frozenset()):
    for n, c in refs_in(path.read_text(encoding="utf-8", errors="replace")):
        if c.split("/", 1)[0] not in tops:
            continue  # not rooted at a repo top-level name (e.g. `owner/repo`)
        if not (root / c.rstrip("/")).exists() and c.rstrip("/") not in known:
            yield n, c


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=".")
    ap.add_argument("paths", nargs="*")
    a = ap.parse_args(argv)
    root = Path(a.root).resolve()
    files_tracked = tracked(root)
    tops = {p.split("/", 1)[0] for p in files_tracked if "/" in p}
    known = set(files_tracked)
    for p in files_tracked:  # directories too: a sparse checkout may omit them
        while "/" in p:
            p = p.rpartition("/")[0]
            known.add(p)
    files = [Path(p).resolve() for p in a.paths] if a.paths else default_files(root)
    bad = 0
    for f in files:
        rel = f.relative_to(root).as_posix()
        if rel.startswith(ARCHIVE_DIRS):
            continue
        for n, c in missing_refs(f, root, tops, known):
            print(f"{rel}:{n}: {c}")
            bad += 1
    if bad:
        print(f"{bad} backticked path(s) point at nothing", file=sys.stderr)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
