#!/usr/bin/env python3
"""Fail if a venture turns a comma-split list straight into numbers.

`text.split(/[\\s,;]+/).map(Number)` reads "6,000 6,500" as four numbers:
6, 0, 6 and 500. On 2026-11-12 the UK VAT registration checker told a trader
with GBP 93,500 of rolling sales (over the GBP 90,000 threshold) that they had
GBP 1,550 and were "below the threshold", because they typed amounts the way
people write them. The usage-pricing simulator and the syndication waterfall
had the same split, and the embroidery quote tool read the break "1,500" as 1
and 500. Each now treats a whitespace- or semicolon-separated "1,500" as one
number and keeps commas as separators only between ungrouped numbers.

This check flags the old one-statement shape: a split on a character class
holding both a comma and whitespace, followed in the same statement by
`Number`. Lists that can never hold a number of 1,000 or more are listed in
ALLOWED with the reason.

    python3 platform/ci/check_thousands_split.py   # exit 1 on a new offender
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SPLIT_THEN_NUMBER = re.compile(
    r"\.split\(/\[(?=[^\]/]*,)(?=[^\]/]*\\s)[^\]/]*\][+*]?/\)[^;{]*?\bNumber\b"
)
# path -> why its list cannot hold a thousands-grouped number.
ALLOWED = {
    "ventures/catholic-shorts/shorts.mjs": "Catechism paragraph numbers, written without commas (max 2865).",
    "ventures/mushroom-fruiting-room-planner/calc.mjs": "lb per block per flush, single digits.",
    "ventures/consignment-markdown-planner/engine.mjs": "discount percentages from 0 to 99.",
}


def offenders(path: Path) -> list[int]:
    src = path.read_text(encoding="utf-8", errors="replace")
    return [src.count("\n", 0, m.start()) + 1 for m in SPLIT_THEN_NUMBER.finditer(src)]


def scan(root: Path = REPO_ROOT) -> list[str]:
    out = []
    for path in sorted((root / "ventures").rglob("*")):
        if path.suffix not in {".mjs", ".js"} or "node_modules" in path.parts or ".test." in path.name:
            continue
        rel = path.relative_to(root).as_posix()
        if rel in ALLOWED:
            continue
        out += [f"{rel}:{line}" for line in offenders(path)]
    return out


def main() -> int:
    bad = scan()
    for b in bad:
        print(f"{b}: comma-split list goes straight to Number; \"6,000\" becomes 6 and 0. "
              "Treat a whitespace-separated \"1,500\" as one number (see ventures/uk-vat-registration-checker/calc.mjs "
              "parseMonths), or add the file to ALLOWED with why it never holds 1,000 or more.")
    print(f"check_thousands_split: {len(bad)} offender(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
