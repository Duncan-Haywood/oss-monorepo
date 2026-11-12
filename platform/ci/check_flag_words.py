#!/usr/bin/env python3
"""Fail if a venture engine reads an unknown checkbox word as "yes".

Sixty-four bid calculators shared one `flag(value)` helper that ended in
`return Boolean(value);`. The page passes real booleans, but the same engines
are called by agents through `platform/agents/tools.mjs` (the MCP server), by
CLIs and from shared links, where a checkbox arrives as a word. Boolean("no")
and Boolean("off") are true, so on 2026-11-12 `calculateBid({sodDemo: "no",
geotextile: "off"})` on the artificial-turf calculator priced sod demo and
fabric the caller had turned off ($175.50 on a 600 sq ft lawn). The fix maps
yes/no/on/off words and throws on anything else; this check catches the next
copy of the old helper.

    python3 platform/ci/check_flag_words.py      # exit 1 on a Boolean(value) fallback
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
# A one-argument helper whose last statement turns whatever is left into a
# boolean: every string it did not list, "no" included, becomes true.
FALLBACK = re.compile(
    r"function\s+(\w+)\s*\((\w+)\)\s*\{(?:(?!\n\}).)*?\n\s*return\s+Boolean\(\2\);\s*\n\}",
    re.S,
)


def offenders(path: Path) -> list[tuple[int, str]]:
    src = path.read_text(encoding="utf-8", errors="replace")
    out = []
    for m in FALLBACK.finditer(src):
        body = m.group(0)
        # Only helpers that already special-case words like 'false' are
        # parsing user text; a plain truthiness helper is left alone.
        if re.search(r"""['"](?:false|0)['"]""", body):
            out.append((src.count("\n", 0, m.start()) + 1, m.group(1)))
    return out


def main(root: Path = REPO_ROOT) -> int:
    problems = []
    for f in sorted((root / "ventures").glob("**/*.mjs")):
        if "node_modules" in f.parts or f.name.endswith(".test.mjs"):
            continue
        for line, name in offenders(f):
            problems.append(f"{f.relative_to(root)}:{line}: {name}() reads any unlisted word, 'no' and 'off' included, as true")
    for p in problems:
        print(p)
    if problems:
        print("Map the words you accept and throw on the rest (see ventures/artificial-turf-bid-calculator/calc.mjs, flag()).")
        return 1
    print("ok: no venture flag helper reads 'no' as yes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
