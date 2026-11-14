#!/usr/bin/env python3
"""Fail when a venture adds a regex that reads a number as `[\\d,]+`.

`[\\d,]+` (and `[\\d.,]+`, `[\\d,.]+`) matches "," alone, "1,,0" and "5,00", so
code that captures it and then does `Number(s.replace(/,/g, ""))` turns a typo
into a silent 0 or a different number instead of an error. A red-team run on
2026-11-14 found that in four places a visitor types into:
ucr-fee-calculator's fee table ("0-2: ," was a $0 bracket),
401k-plan-fee-calculator's benchmark bands ("$,-$,: 1" was a 0-0 band),
texas-electricity-plan-checker's list fields ("$, at ," was a $0 credit from
0 kWh) and its monthly usage lines ("1,,0" was 10 kWh). The fix is a strict
number: `\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?`, or a parser that
rejects what does not fit that shape.

Some uses are fine: MT940 amounts use a decimal comma, and a text scanner may
check the number afterwards. So this is a ratchet, like
check_csv_formula_guard.py: `loose_number_pattern_baseline.txt` lists each file
and how many loose captures it had on 2026-11-14. A file with more than its
count fails (a new copy needs a strict pattern, or a reviewed baseline bump),
and so does a file with fewer or gone, so the list only shrinks.

    python3 platform/ci/check_loose_number_pattern.py [--root DIR] [--write-baseline]
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE = Path(__file__).with_name("loose_number_pattern_baseline.txt")
# A capture group (optionally "-?" or "\$?\s*" first) whose number is a bare
# class of digits and commas, with or without a dot: ([\d,]+  ([\d.,]+  ([\d,.]+
LOOSE = re.compile(r"\((?:-\?|\\\$\?(?:\\s\*)?)?\[\\d(?:,|\.,|,\.)\]\+")
SKIP_PARTS = {"node_modules", ".next", "dist", "build", ".git", "vendor"}


def scan(root):
    counts = {}
    base = root / "ventures"
    for path in sorted(base.rglob("*")):
        if path.suffix not in {".mjs", ".js"} or not path.is_file():
            continue
        rel = path.relative_to(root)
        if SKIP_PARTS.intersection(rel.parts) or ".test." in path.name or path.name.endswith(".min.js"):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        n = len(LOOSE.findall(text))
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
    """Return a list of problems: more loose captures than the baseline, or a stale baseline line."""
    problems = []
    for name, n in sorted(found.items()):
        had = baseline.get(name, 0)
        if n > had:
            problems.append(f"{name}: {n} loose number capture(s) ([\\d,]+), baseline {had}. Use a strict number "
                            r"(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?) so ',' or '1,,0' is an error, not 0 or 10.")
        elif n < had:
            problems.append(f"{name}: {n} loose capture(s), baseline {had}: lower its line in {BASELINE.name}.")
    for name in sorted(set(baseline) - set(found)):
        problems.append(f"{name}: no loose captures left (or file gone): remove its line from {BASELINE.name}.")
    return problems


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    ap.add_argument("--baseline", type=Path, default=BASELINE)
    ap.add_argument("--write-baseline", action="store_true")
    a = ap.parse_args(argv)
    found = scan(a.root)
    if a.write_baseline:
        lines = ["# check_loose_number_pattern.py ratchet: file and count of ([\\d,]+-style captures. Only shrinks."]
        lines += [f"{k} {v}" for k, v in sorted(found.items())]
        a.baseline.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"wrote {len(found)} files to {a.baseline}")
        return 0
    problems = compare(found, read_baseline(a.baseline))
    for p in problems:
        print(p)
    if problems:
        return 1
    print(f"loose number patterns: {sum(found.values())} in {len(found)} baselined files, none new")
    return 0


if __name__ == "__main__":
    sys.exit(main())
