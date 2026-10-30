#!/usr/bin/env python3
"""Report relative links in tracked Markdown files that point at nothing.

The steering documents (CLAUDE.md, AGENTS.md, prompts/, PRODUCT_PLAYBOOK.md)
route agents to each other by relative link. A moved or deleted file leaves a
dead pointer that costs every later run a failed read. `check_pages_links.py`
covers the served HTML; this covers the Markdown nobody serves.

Checks local file targets, and the `#anchor` on a link to a Markdown file
(GitHub's heading slugs, duplicates numbered -1, -2). Skipped: external URLs,
site-absolute `/paths`, docs/history snapshots, fenced code blocks and inline
code, and anchors on non-Markdown targets.

Usage:
    python3 platform/ci/check_md_links.py [--root DIR] [PATH ...]

Exit 0: no dead links. Exit 1: dead links printed as file:line: target.
"""

from __future__ import annotations

import argparse
import os
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
SKIP = ("http://", "https://", "//", "mailto:", "tel:", "data:", "/")
# Verbatim snapshots of other files; their links were relative to the original.
ARCHIVE_DIRS = ("docs/history/",)
# GitHub's blob view of another file accepts #L10 / #L10-L20 as a line anchor.
LINE_ANCHOR_RE = re.compile(r"L\d+(?:-L\d+)?", re.I)


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


HEADING_RE = re.compile(r"^ {0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$")
_LINK_TEXT_RE = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")


def heading_slugs(text: str) -> set[str]:
    """GitHub's anchors for the headings in `text` (fenced code excluded)."""
    slugs: set[str] = set()
    seen: dict[str, int] = {}
    in_fence = False
    for line in text.split("\n"):
        if FENCE_RE.match(line):
            in_fence = not in_fence
            continue
        m = None if in_fence else HEADING_RE.match(line)
        if not m:
            continue
        title = _LINK_TEXT_RE.sub(r"\1", m.group(1)).replace("`", "")
        slug = re.sub(r"[^\w\- ]", "", title.lower()).replace(" ", "-")
        n = seen.get(slug, 0)
        seen[slug] = n + 1
        slugs.add(slug if n == 0 else f"{slug}-{n}")
    return slugs


def tracked_paths(root: Path) -> set[str]:
    """Every tracked file and directory, so a sparse checkout that omits a
    PNG or MP3 still sees the link target as present."""
    try:
        out = subprocess.run(
            ["git", "-C", str(root), "ls-files"],
            capture_output=True, text=True, check=True,
        ).stdout.split("\n")
    except (OSError, subprocess.CalledProcessError):
        return set()
    paths = set()
    for p in out:
        while p and p not in paths:
            paths.add(p)
            p = p.rpartition("/")[0]
    return paths


def dead_links(path: Path, root: Path, known: frozenset | set = frozenset()):
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return
    for n, target in links_in(text):
        if target.startswith(SKIP):
            continue
        before, _, frag = target.partition("#")
        local = unquote(before.split("?", 1)[0])
        if not local and not frag:
            continue
        base = root if local.startswith("/") else path.parent
        dest = base / local.lstrip("/") if local else path
        try:
            rel = os.path.normpath(dest.relative_to(root)).replace(os.sep, "/")
        except ValueError:
            rel = None
        if not dest.exists() and rel not in known:
            yield n, target
        elif frag and dest.suffix == ".md" and dest.is_file():
            try:
                slugs = heading_slugs(dest.read_text(encoding="utf-8"))
            except (OSError, UnicodeDecodeError):
                continue
            if unquote(frag).lower() not in slugs and not (
                dest != path and LINE_ANCHOR_RE.fullmatch(frag)
            ):
                yield n, target


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=".", help="repository root (default: cwd)")
    ap.add_argument("paths", nargs="*", help="markdown files (default: all tracked)")
    args = ap.parse_args(argv)
    root = Path(args.root).resolve()
    files = [Path(p).resolve() for p in args.paths] or tracked_markdown(root)
    known = tracked_paths(root)
    bad = 0
    for f in files:
        for n, target in dead_links(f, root, known):
            print(f"{f.relative_to(root)}:{n}: {target}")
            bad += 1
    if bad:
        print(f"{bad} dead link(s)", file=sys.stderr)
    else:
        print(f"ok: no dead links in {len(files)} markdown file(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
