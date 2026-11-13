#!/usr/bin/env python3
"""Flag YYYY-MM-DD validators that trust Date.parse to refuse an impossible day.

`Date.parse("2026-02-30")` is not NaN in V8: it rolls over to 2 March. So
`/^\\d{4}-\\d{2}-\\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))` accepts 30
February, 31 April and 29 February in a common year, and the tool then works
from a different day than the one typed. The red-team run of 2026-11-11 found
this in the FatturaPA checker and in twelve sibling validators.

A line is flagged when it shape-checks a date (the YYYY-MM-DD regex or a
`T00:00:00Z` suffix), tests it with isNaN(Date.parse(...)) or
isNaN(new Date(...).getTime()), and does not round-trip it (toISOString().slice(0, 10),
getUTCDate or getUTCMonth) on the same line.

The second pattern is the hand-rolled range check: a line that tests a month
(`<= 12` or `< 12`) and a day with `d >= 1 && d <= 31`, and no calendar check
(a Date.UTC round trip, a month-length table, a realDay/calDate helper) on that
line or the four after it. Every month then has 31 days. The red-team run of
2026-11-12 found it in the bank-statement converter (02/30 exported as
2026-02-30) and five import checkers and categorizers. Exit 1 lists each hit.
Usage: python3 platform/ci/check_calendar_dates.py [root ...]
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SHAPE = re.compile(r"\\d\{4\}-\\d\{2\}-\\d\{2\}|T00:00:00Z")
NAN_CHECK = re.compile(r"isNaN\((?:Date\.parse\(|new Date\()")
ROUND_TRIP = re.compile(r"toISOString\(\)\.slice\(0, ?10\)|getUTCDate\(\)|getUTCMonth\(\)")
DAY_RANGE = re.compile(r"([\w.+\[\]]+) >= 1 && \1 <= 31\b")
MONTH_RANGE = re.compile(r"<= ?12\b|< ?12\b")
CALENDAR = re.compile(r"getUTCDate\(\)|getDate\(\)|MONTH_DAYS|daysIn\w*\(|realDay\(|calDate\(|validDate\(")
WINDOW = 4
SUFFIXES = {".mjs", ".js", ".cjs", ".ts"}
SKIP_PARTS = {"node_modules", "dist", "build", "vendor"}


def scan_text(text):
    """Line numbers (1-based) of validators that accept a rolled-over day."""
    lines = text.splitlines()
    hits = []
    for i, line in enumerate(lines, 1):
        if SHAPE.search(line) and NAN_CHECK.search(line) and not ROUND_TRIP.search(line):
            hits.append(i)
        elif DAY_RANGE.search(line) and MONTH_RANGE.search(line) \
                and not CALENDAR.search("\n".join(lines[i - 1:i + WINDOW])):
            hits.append(i)
    return hits


def scan(roots):
    hits = []
    for root in roots:
        for p in sorted(pathlib.Path(root).rglob("*")):
            if p.suffix not in SUFFIXES or not p.is_file() or SKIP_PARTS & set(p.parts):
                continue
            if ".test." in p.name or p.name.endswith(".min.js"):
                continue
            try:
                text = p.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            for n in scan_text(text):
                hits.append(f"{p.relative_to(ROOT) if p.is_relative_to(ROOT) else p}:{n}")
    return hits


def main(argv):
    roots = argv or [ROOT / "ventures", ROOT / "platform"]
    hits = scan(roots)
    for h in hits:
        print(f"{h}: this date check accepts 2026-02-30 (Date.parse rolls it over to March, and a 1-31 day range "
              "gives every month 31 days); round-trip it: new Date(Date.UTC(y, m - 1, d)).getUTCDate() === d")
    if hits:
        return 1
    print("check_calendar_dates: no YYYY-MM-DD validator accepts an impossible day")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
