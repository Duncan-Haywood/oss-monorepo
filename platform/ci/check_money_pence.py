#!/usr/bin/env python3
"""Flag money formatters that print one decimal digit ("GBP 5,955.3").

`toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })`
drops trailing zeros, so 505.80 prints as "505.8" and 0.50 as "0.5". The
red-team run of 2026-11-17 found it in the UK Self Assessment calculator's
headline ("Estimated 2025/26 bill: GBP 2,191.8"), and the 2026-11-17 census
audit saw "Balance £5,955.3" on the live page. The same formatter had been
copied into 55 files across 30 ventures. Each copy now ends
`.replace(/\\.\\d$/, (m) => m + "0")`, which keeps whole amounts bare
("GBP 751") and pads a single pence digit ("GBP 0.50").

A line with `minimumFractionDigits: 0` and `maximumFractionDigits: 2` (either
order) is a hit unless the same line pads the result as above. Lines with no
money sign or word (£ $ € GBP USD EUR money currency) are left alone, since a
share or a rate may read fine as "1.5". Test files are skipped. Exit 1 lists
each hit.

Usage: python3 platform/ci/check_money_pence.py [root ...]
"""
import os
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
MIN0_MAX2 = re.compile(
    r"minimumFractionDigits\s*:\s*0\s*,\s*maximumFractionDigits\s*:\s*2\b"
    r"|maximumFractionDigits\s*:\s*2\s*,\s*minimumFractionDigits\s*:\s*0\b")
PADDED = re.compile(r"""\.replace\(\s*/\\\.\\d\$/\s*,""")
MONEY = re.compile(r"[£$€]|\b(GBP|USD|EUR|money|currency|gbp|usd|eur)\b")
SUFFIXES = {".mjs", ".js", ".html"}
SKIP_PARTS = {"node_modules", ".next", "dist", "build", "vendor"}


def scan_text(text):
    hits = []
    for i, line in enumerate(text.splitlines(), 1):
        if MIN0_MAX2.search(line) and MONEY.search(line) and not PADDED.search(line):
            hits.append(i)
    return hits


def files(roots):
    # os.walk, not rglob: a test elsewhere may create and delete a temp dir under ventures/ mid-walk.
    for root in roots:
        for d, dirs, names in os.walk(root):
            dirs[:] = sorted(x for x in dirs if x not in SKIP_PARTS)
            for name in sorted(names):
                p = pathlib.Path(d) / name
                if p.suffix in SUFFIXES and ".test." not in name and not name.startswith("test_"):
                    yield p


def main(argv):
    roots = argv or [ROOT / d for d in ("ventures", "platform", "research")]
    hits = []
    for p in files(roots):
        try:
            text = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if "maximumFractionDigits" not in text:
            continue
        for n in scan_text(text):
            name = p.relative_to(ROOT) if p.is_relative_to(ROOT) else p
            hits.append(f"{name}:{n}")
    if hits:
        print("check_money_pence: these money formatters print one pence digit (5,955.3); add "
              '.replace(/\\.\\d$/, (m) => m + "0") after toLocaleString:')
        for h in hits:
            print("  " + h)
        return 1
    print("check_money_pence: no money formatter prints a single pence digit")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
