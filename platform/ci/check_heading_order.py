#!/usr/bin/env python3
"""Report venture pages whose headings skip a level (an h2 followed by an h4).

Screen-reader users navigate by heading level; a jump down of more than one
level (h2 -> h4) reads as missing content. Going back up any distance is fine.

    python3 platform/ci/check_heading_order.py [--root DIR] [--fail]
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STRIP = re.compile(r"<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->|<template\b.*?</template>", re.S | re.I)
HEAD = re.compile(r"<h([1-6])\b", re.I)


def skips(text: str):
    """Return (from_level, to_level) for each downward jump of more than one."""
    out, prev = [], 0
    for m in HEAD.finditer(STRIP.sub("", text)):
        lvl = int(m.group(1))
        if prev and lvl > prev + 1:
            out.append((prev, lvl))
        prev = lvl
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    ap.add_argument("--fail", action="store_true", help="exit 1 if any found")
    args = ap.parse_args(argv)
    pages = bad = 0
    for page in sorted(Path(args.root).rglob("*.html")):
        if "node_modules" in page.parts:
            continue
        try:
            text = page.read_text(encoding="utf8")
        except (OSError, UnicodeDecodeError):
            continue
        pages += 1
        found = skips(text)
        if found:
            bad += 1
            print(f"{page}: {len(found)} skip(s), first h{found[0][0]} -> h{found[0][1]}")
    print(f"{pages} pages, {bad} with a skipped heading level")
    return 1 if (bad and args.fail) else 0


if __name__ == "__main__":
    sys.exit(main())
