#!/usr/bin/env python3
"""Find venture files that copy an IRS tax table with one figure wrong.

Why this exists
---------------
Dozens of ventures carry their own copy of the 2026 federal bracket table,
standard deductions and capital-gains breakpoints. A copy that is right in
five places and off by $25 in the sixth passes every unit test written from
the same copy, because the test and the code share the typo. The IRS text is
the only independent check, so this script pins the figures from it and looks
for near-miss copies.

Source of the pinned figures
----------------------------
Rev. Proc. 2025-32, section 4 (irs.gov/pub/irs-drop/rp-25-32.pdf), read with
pdftotext on 2026-11-14: .01 tables 1 to 5, .03 capital gains, .14 standard
deduction; and the 2025 tables and capital gains from Rev. Proc. 2024-40
section 3 (irs.gov/pub/irs-drop/rp-24-40.pdf, read the same day). Add a table only from the IRS text, with where it was read.

How a file is flagged
---------------------
A table counts as present in a shipped file (index.html, *.mjs, *.js, *.py;
tests excluded) when more than half its figures, and at least `--min-hits`,
appear in it. Each missing figure of a present table that has a near number
in the file (within 0.5%) is a candidate typo. A near number that is itself a
figure of another pinned table (the single table's $201,775 where the
head-of-household table wants $201,750) is the commonest case: a row copied
across tables. A file holding only the single table does not read as a
broken head-of-household one, because the two share at most three of six figures.
Figures are read as written ($201,750, 201_750, 201750) or as cents
(20175000).

This is a report: exit 0 unless --strict is passed and something is found.

    python3 platform/ci/check_irs_table_figures.py [--json] [--strict] [--min-hits 3]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = "Rev. Proc. 2025-32 section 4 and Rev. Proc. 2024-40 section 3 (irs.gov/pub/irs-drop/, read 2026-11-14)"

# Upper bounds of the 10% .. 35% brackets (the 37% bracket has none).
TABLES = {
    "2026 brackets, married filing jointly (Table 1)": [24800, 100800, 211400, 403550, 512450, 768700],
    "2026 brackets, head of household (Table 2)": [17700, 67450, 105700, 201750, 256200, 640600],
    "2026 brackets, single (Table 3)": [12400, 50400, 105700, 201775, 256225, 640600],
    "2026 brackets, married filing separately (Table 4)": [12400, 50400, 105700, 201775, 256225, 384350],
    "2026 brackets, estates and trusts (Table 5)": [3300, 11700, 16000],
    "2026 capital gains 0%/15% breakpoints (.03)": [98900, 613700, 49450, 306850, 66200, 579600, 545500],
    "2026 standard deduction (.14)": [32200, 24150, 16100],
    # Rev. Proc. 2024-40 section 3.01 and 3.03 (irs.gov/pub/irs-drop/rp-24-40.pdf, read 2026-11-14).
    # The 2025 standard deduction is left out: the 2025 law replaced the Rev. Proc. figures.
    "2025 brackets, married filing jointly (Table 1)": [23850, 96950, 206700, 394600, 501050, 751600],
    "2025 brackets, head of household (Table 2)": [17000, 64850, 103350, 197300, 250500, 626350],
    "2025 brackets, single (Table 3)": [11925, 48475, 103350, 197300, 250525, 626350],
    "2025 brackets, married filing separately (Table 4)": [11925, 48475, 103350, 197300, 250525, 375800],
    "2025 brackets, estates and trusts (Table 5)": [3150, 11450, 15650],
    "2025 capital gains 0%/15% breakpoints (.03)": [96700, 600050, 48350, 300000, 64750, 566700, 533400],
}

NUM = re.compile(r"(?<![\w.$])\$?(\d{1,3}(?:[,_]\d{3})+|\d{4,9})(?![\w])")
# NUM's matches, found faster (perf, 2026-11-20): NUM starts with a
# lookbehind, so `re` tries it at every character (5.8 s over the 148 MB of
# shipped venture files). NUM_FAST starts with the character class `[\d$]`,
# which `re` skips to in C, then asserts the same lookbehind on the character
# before it: a `$` is followed by NUM's number, a digit starts it. The match
# without its `$` is NUM's group 1 (test_check_irs_table_figures pins the two
# against each other; 1.7 s).
NUM_FAST = re.compile(
    r"[\d$](?<![\w.$].)"
    r"(?:(?<=\$)(?:\d{1,3}(?:[,_]\d{3})+|\d{4,9})|(?<=\d)(?:\d{0,2}(?:[,_]\d{3})+|\d{3,8}))(?!\w)"
)
NEAR = 0.005  # a typo or a figure copied from a neighbouring table, not a different rule
EXT = {".html", ".mjs", ".js", ".py"}


def numbers(text: str) -> set[int]:
    found = set()
    for m in NUM_FAST.finditer(text):
        n = int(re.sub(r"[,_]", "", m.group().lstrip("$")))
        found.add(n)
        if n % 100 == 0 and n >= 100000:  # cents
            found.add(n // 100)
    return found


def check_text(text: str, min_hits: int = 3, tables=TABLES):
    nums = numbers(text)
    every = {f for fs in tables.values() for f in fs}
    found = []
    for name, sig in tables.items():
        hits = [f for f in sig if f in nums]
        if len(hits) < max(min(min_hits, len(sig)), len(sig) // 2 + 1) or len(hits) == len(sig):
            continue
        for want in sig:
            if want in nums:
                continue
            near = sorted(n for n in nums if n != want and abs(n - want) <= want * NEAR)
            if near:
                borrowed = [n for n in near if n in every]
                found.append({"table": name, "irs": want, "file_has": near, "from_other_table": borrowed,
                              "matched": len(hits), "of": len(sig)})
    return found


def shipped(root: Path):
    for p in sorted(root.rglob("*")):
        if p.suffix not in EXT or not p.is_file() or "node_modules" in p.parts or "fixture" in p.parts:
            continue
        n = p.name
        if ".test." in n or n.startswith("test_") or n.endswith("_test.py"):
            continue
        yield p


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    ap.add_argument("--min-hits", type=int, default=3)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--strict", action="store_true")
    a = ap.parse_args()
    root = Path(a.root)
    rows = []
    for p in shipped(root):
        try:
            text = p.read_text(errors="ignore")
        except OSError:
            continue
        for f in check_text(text, a.min_hits):
            f["file"] = str(p.relative_to(ROOT) if p.is_relative_to(ROOT) else p)
            rows.append(f)
    if a.json:
        print(json.dumps({"source": SOURCE, "findings": rows}, indent=1))
    else:
        print(f"{len(rows)} near-miss figures against {SOURCE}")
        for r in rows:
            print(f"{r['file']}: {r['table']}: IRS {r['irs']:,}, file has {', '.join(f'{n:,}' for n in r['file_has'])} ({r['matched']}/{r['of']} figures match{'; copied from another table' if r['from_other_table'] else ''})")
    return 1 if (a.strict and rows) else 0


if __name__ == "__main__":
    sys.exit(main())
