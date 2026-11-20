#!/usr/bin/env python3
"""Fail when a venture that reads CSV adds a number parser that strips every comma.

`Number(s.replace(/[$,\\s]/g, ""))` reads "1,200.50" right and a decimal comma
wrong: "29,99" (how an EU-locale sheet or export writes 29.99) becomes 2999,
and "1.234,56" becomes 1.23456, with no error. A red-team run on 2026-11-20
found it in mrr-pulse's subscription CSV import (a 29,99 plan read as 2,999 a
month) and in etsy-ads-roi-analyzer's parseNumber, which strips "€" so it
expects euro amounts. The fix is to read the comma by its shape:

    /^\\d{1,3}(,\\d{3})+(\\.\\d+)?$/       -> thousands commas: drop them
    /^(\\d+|\\d{1,3}(\\.\\d{3})+),\\d{1,2}$/ -> a decimal comma: dots out, comma to dot
    any other comma                       -> not a number (skip the row with a reason)

(`ventures/mrr-pulse/csv.mjs` toAmount, `ventures/etsy-ads-roi-analyzer/calc.mjs`
parseNumber.)

Only files that mention CSV are scanned (import or export; a typed form field
alone is a smaller risk),
and many of them only ever see US exports, so this is a ratchet like
check_loose_number_pattern.py: `money_comma_baseline.txt` lists each file and
how many comma-stripping replaces it had on 2026-11-20. A file with more fails
(a new parser should read the comma by shape, or bump its line after checking
its data never carries a decimal comma), and so does a file with fewer or gone,
so the list only shrinks.

    python3 platform/ci/check_money_comma.py [--root DIR] [--write-baseline]
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE = Path(__file__).with_name("money_comma_baseline.txt")
# .replace(/[...,...]/g, "") with a comma in a positive character class.
STRIP = re.compile(r"""\.replace\(/\[(?!\^)[^\]\n]*,[^\]\n]*\]/g,\s*(?:""|''|``)\)""")
READS_CSV = re.compile(r"csv", re.I)
SKIP_PARTS = {"node_modules", ".next", "dist", "build", ".git", "vendor"}


def scan(root):
    counts = {}
    for path in sorted((root / "ventures").rglob("*")):
        if path.suffix not in {".mjs", ".js"} or not path.is_file():
            continue
        rel = path.relative_to(root)
        if SKIP_PARTS.intersection(rel.parts) or ".test." in path.name or path.name.endswith(".min.js"):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if "," not in text or not READS_CSV.search(text):
            continue
        n = len(STRIP.findall(text))
        if n:
            counts[rel.as_posix()] = n
    return counts


def read_baseline(path):
    out = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, _, n = line.rpartition(" ")
        out[name] = int(n)
    return out


def compare(found, baseline):
    """Problems: more comma-stripping replaces than the baseline, or a stale baseline line."""
    problems = []
    for name, n in sorted(found.items()):
        had = baseline.get(name, 0)
        if n > had:
            problems.append(f"{name}: {n} replace(s) that strip every comma from a number, baseline {had}. "
                            "'29,99' reads as 2999: read the comma by shape (check_money_comma.py docstring).")
        elif n < had:
            problems.append(f"{name}: {n} comma-stripping replace(s), baseline {had}: lower its line in {BASELINE.name}.")
    for name in sorted(set(baseline) - set(found)):
        problems.append(f"{name}: no comma-stripping replaces left (or file gone): remove its line from {BASELINE.name}.")
    return problems


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    ap.add_argument("--baseline", type=Path, default=BASELINE)
    ap.add_argument("--write-baseline", action="store_true")
    a = ap.parse_args(argv)
    found = scan(a.root)
    if a.write_baseline:
        lines = ["# check_money_comma.py ratchet: CSV-reading venture files and their count of "
                 "replace(/[...,...]/g, \"\") number parsers. Only shrinks."]
        lines += [f"{k} {v}" for k, v in sorted(found.items())]
        a.baseline.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"wrote {len(found)} files to {a.baseline}")
        return 0
    problems = compare(found, read_baseline(a.baseline))
    for p in problems:
        print(p)
    if problems:
        return 1
    print(f"comma-stripping number parsers: {sum(found.values())} in {len(found)} baselined files, none new")
    return 0


if __name__ == "__main__":
    sys.exit(main())
