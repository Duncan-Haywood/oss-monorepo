#!/usr/bin/env python3
"""Fail if a venture page skips a heading level (h1 straight to h3) or has two h1s.

Screen-reader users navigate by heading; a skipped level reads as missing
content. Script, style, comment and `<template>` text is ignored. Pages with
no h1 at all are listed but allowed (client-rendered app shells fill it in).

    python3 platform/ci/check_heading_order.py [--root DIR]   # exit 1 if any found
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STRIP = re.compile(r"<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->|<template\b.*?</template>", re.S | re.I)
HEADING = re.compile(r"<h([1-6])\b", re.I)


def heading_problems(text: str):
    """Return problem strings for one page: skipped levels and repeated h1."""
    levels = [int(x) for x in HEADING.findall(STRIP.sub("", text))]
    out, prev = [], 0
    for lv in levels:
        if prev and lv > prev + 1:
            out.append(f"h{prev} then h{lv}")
        prev = lv
    if levels.count(1) > 1:
        out.append(f"{levels.count(1)} h1 elements")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    args = ap.parse_args(argv)
    pages = bad = 0
    for page in sorted(Path(args.root).rglob("*.html")):
        if not {"node_modules", ".next"}.isdisjoint(page.parts):
            continue
        try:
            text = page.read_text(encoding="utf8")
        except (OSError, UnicodeDecodeError):
            continue
        pages += 1
        found = heading_problems(text)
        if found:
            bad += 1
            print(f"{page}: {'; '.join(found[:3])}")
    print(f"{pages} pages, {bad} with a heading-order problem")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
