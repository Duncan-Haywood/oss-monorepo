#!/usr/bin/env python3
"""Report relative links in tracked Markdown files that point at nothing.

The steering documents (CLAUDE.md, AGENTS.md, prompts/, PRODUCT_PLAYBOOK.md)
route agents to each other by relative link. A moved or deleted file leaves a
dead pointer that costs every later run a failed read. `check_pages_links.py`
covers the served HTML; this covers the Markdown nobody serves.

Checks local file targets only. Skipped: anchors, external URLs, site-absolute
`/paths`, docs/history snapshots, fenced code blocks and inline code.

Usage:
    python3 platform/ci/check_md_links.py [--root DIR] [PATH ...]

Exit 0: no dead links. Exit 1: dead links printed as file:line: target.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote

_TARGET_BODY = r"(?:[^()\s>]|\([^()\s]*\))+"
_TITLE = r"(?:\s+\"[^\"]*\")?"
_TARGET = r"<?(" + _TARGET_BODY + r")>?" + _TITLE
_IMG = r"!\[[^\]\n]*\]\(\s*" + _TARGET + r"\s*\)"
# Link text may hold one nested image (a badge): [![alt](img)](href).
_NESTED_IMG = r"!\[[^\]\n]*\]\(\s*<?" + _TARGET_BODY + r">?" + _TITLE + r"\s*\)"
LINK_RE = re.compile(r"(?<!\!)\[(?:[^\[\]\n]|" + _NESTED_IMG + r")*\]\(\s*" + _TARGET + r"\s*\)")
IMG_RE = re.compile(_IMG)
CODE_SPAN_RE = re.compile(r"``.*?``|`[^`\n]*`")
FENCE_RE = re.compile(r"^\s*(```|~~~)")
SKIP = ("http://", "https://", "//", "mailto:", "tel:", "data:", "#", "/")
# Verbatim snapshots of other files; their links were relative to the original.
ARCHIVE_DIRS = ("docs/history/",)


def tracked_markdown(root: Path) -> list[Path]:
    out = subprocess.run(
        ["git", "-C", str(root), "ls-files", "*.md"],
        capture_output=True, text=True, check=True,
    ).stdout.split("\n")
    return [root / p for p in out if p and not p.startswith(ARCHIVE_DIRS)]


def links_in(text: str):
    """Yield (line_number, target) for each link outside code."""
    in_fence = False
    for n, line in enumerate(text.split("\n"), 1):
        if FENCE_RE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        line = CODE_SPAN_RE.sub("", line)
        for rx in (LINK_RE, IMG_RE):
            for m in rx.finditer(line):
                yield n, m.group(1)


def dead_links(path: Path, root: Path):
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return
    for n, target in links_in(text):
        if target.startswith(SKIP):
            continue
        local = unquote(target.split("#", 1)[0].split("?", 1)[0])
        if not local:
            continue
        base = root if local.startswith("/") else path.parent
        if not (base / local.lstrip("/")).exists():
            yield n, target


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=".", help="repository root (default: cwd)")
    ap.add_argument("paths", nargs="*", help="markdown files (default: all tracked)")
    args = ap.parse_args(argv)
    root = Path(args.root).resolve()
    files = [Path(p).resolve() for p in args.paths] or tracked_markdown(root)
    bad = 0
    for f in files:
        for n, target in dead_links(f, root):
            print(f"{f.relative_to(root)}:{n}: {target}")
            bad += 1
    if bad:
        print(f"{bad} dead link(s)", file=sys.stderr)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
