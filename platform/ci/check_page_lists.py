#!/usr/bin/env python3
"""Fail if a venture test's hand-kept page list has fallen behind its folder.

Venture page tests often loop a literal list of `*.html` names to assert the
disclaimer, sponsor link, canonical and JSON-LD on "every page". New pages are
added to the folder and forgotten in the list. On 2026-11-12 three ventures had
drifted: wall-framing-takeoff listed 37 of 47 pages, clothing-design-studio 33
of 52, state-residency-day-counter 10 of 11, and 11 of the unlisted pages
failed the checks their siblings pass (a missing sponsor link, og:title,
JSON-LD, or a page absent from llms.txt). The fix there was to read the folder
(`readdirSync(...).filter(f => f.endsWith(".html"))`); this check catches the
next list that drifts.

A list counts when it names at least MIN_NAMES `.html` files that all exist
beside the test, so short per-feature lists ("these three pages have a form")
and lists of generated output are left alone.

    python3 platform/ci/check_page_lists.py            # exit 1 if a list lags
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MIN_NAMES = 8
LIST = re.compile(r"\[((?:\s*[\"'][\w.-]+\.html[\"']\s*,?){%d,})\]" % MIN_NAMES)
NAME = re.compile(r"[\"']([\w.-]+\.html)[\"']")


def lagging_lists(test_file: Path) -> list[tuple[int, list[str]]]:
    """[(line, missing page names)] for each full-looking list that misses pages."""
    src = test_file.read_text(encoding="utf-8", errors="replace")
    folder = test_file.parent
    pages = {p.name for p in folder.glob("*.html")}
    out = []
    for m in LIST.finditer(src):
        names = set(NAME.findall(m.group(1)))
        if not names <= pages:
            continue  # names files that are not here: generated output, other dirs
        missing = sorted(pages - names)
        if missing:
            out.append((src.count("\n", 0, m.start()) + 1, missing))
    return out


def main(root: Path = REPO_ROOT) -> int:
    problems = []
    for t in sorted((root / "ventures").glob("*/**/*.test.mjs")):
        if "node_modules" in t.parts:
            continue
        for line, missing in lagging_lists(t):
            rel = t.relative_to(root)
            shown = ", ".join(missing[:5]) + (" ..." if len(missing) > 5 else "")
            problems.append(f"{rel}:{line}: page list misses {len(missing)} page(s) in its folder: {shown}")
    for p in problems:
        print(p)
    if problems:
        print("Read the folder instead of keeping the list by hand: "
              "readdirSync(new URL('./', import.meta.url)).filter((f) => f.endsWith('.html'))")
        return 1
    print("ok: no venture page list lags its folder")
    return 0


if __name__ == "__main__":
    sys.exit(main())
