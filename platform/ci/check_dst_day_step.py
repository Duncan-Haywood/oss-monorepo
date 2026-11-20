#!/usr/bin/env python3
"""Flag day arithmetic done in 24-hour blocks on dates held at local midnight.

A date read as local midnight (`new Date(`${s}T00:00:00`)`, `new Date(y, m, d)`
or `setHours(0, 0, 0, 0)`) and then moved with
`new Date(d.getTime() - n * 86400000)` skips or repeats an hour whenever the
span crosses a daylight-saving change, so it lands at 23:00 the day before (or
01:00, harmless) and every local reader (getDate, toLocaleDateString, a
YYYY-MM-DD formatter) shows the wrong calendar day. The explore run of
2026-11-15 found it in saas-seat-true-up: a 1 April 2026 renewal with 30 days'
notice showed a 1 March deadline in New York instead of 2 March. In UTC, where
CI runs, the bug cannot show, so a test suite never sees it.

The fix is to step calendar days, `new Date(y, m, d + n)` or
`d.setDate(d.getDate() + n)`, or to keep the whole tool in UTC (`T00:00:00Z`,
Date.UTC, getUTC*), which has no daylight saving.

A line is flagged when its file builds a local-midnight date and the line
makes a Date (`new Date(...)` or `.setTime(...)`) from millisecond arithmetic
(`getTime()`, `valueOf()`, `+d`, `Date.now()`) that adds or subtracts a day
constant (86400000, 864e5, 24 * 60 * 60 * 1000, MS_PER_DAY, DAY_MS and the
like). Differences divided by a day and rounded are not flagged: rounding
absorbs the hour. Files that never build a local-midnight date are skipped,
since a UTC date has no daylight saving.

A line checked and intended may carry `dst-day-step: ok` (on the line itself
or the one before). Exit 1 lists each hit.
Usage: python3 platform/ci/check_dst_day_step.py [root ...]
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SUFFIXES = {".js", ".mjs", ".html"}
SKIP_PARTS = {"node_modules", "dist", "vendor", ".git"}
ALLOW = "dst-day-step: ok"

_DAY_NUMBERS = (r"86_?400_?000|864e5", r"8\.64e7", r"24 ?\* ?60 ?\* ?60 ?\* ?1000|24 ?\* ?3600 ?\* ?1000",
                r"3_?600_?000 ?\* ?24")
_DAY_NAMES = (r"\b(?:MS_PER_DAY|DAY_MS|MS_DAY|ONE_DAY(?:_MS)?|DAY_IN_MS|MS_IN_DAY|"
              r"msPerDay|MSDAY|dayMs|DAY)\b")
DAY_CONST = re.compile("|".join(_DAY_NUMBERS + (_DAY_NAMES,)))
# The same alternatives one at a time: each numeric one starts with a literal,
# which sre scans for quickly, and every name holds "DAY", "msPerDay" or
# "dayMs". The joined pattern has no literal prefix and tries every position,
# 2.9 s over the ventures tree against 0.4 s for these
# (docs/history/ci-perf-2026-11-20-paired-check-prefilters.md).
_DAY_PARTS = tuple(re.compile(p) for p in _DAY_NUMBERS)
_DAY_NAME_RE = re.compile(_DAY_NAMES)


def has_day_const(text):
    """Same answer as bool(DAY_CONST.search(text)), faster on a whole file."""
    if any(r.search(text) for r in _DAY_PARTS):
        return True
    return ("DAY" in text or "msPerDay" in text or "dayMs" in text) and bool(_DAY_NAME_RE.search(text))
MS_SOURCE = re.compile(r"\.getTime\(\)|\.valueOf\(\)|Date\.now\(\)|\(\s*\+[A-Za-z_$]|new Date\(\s*\+")
MAKES_DATE = re.compile(r"new Date\(|\.setTime\(")
# A local wall-clock midnight: an ISO date with a T00:00 time and no zone,
# the three-argument local constructor, or a reset to midnight.
LOCAL_MIDNIGHT = re.compile(
    r"T00:00(?::00)?(?:\.000)?['\"`]|"
    r"(?<!UTC\()(?<![\w.])new Date\(\s*[\w.$\[\]]+(?:\([^()]*\))?\s*,\s*[^,()]+(?:\([^()]*\))?\s*,|"
    r"\.setHours\(\s*0\s*,\s*0"
)


def _arith_hit(line):
    code = line.split("//")[0] if "://" not in line else line
    if not MAKES_DATE.search(code) or not MS_SOURCE.search(code) or not DAY_CONST.search(code):
        return False
    # A rounded difference ("/ DAY" inside Math.round) is a day count, not a date.
    m = DAY_CONST.search(code)
    before = code[:m.start()].rstrip()
    if before.endswith("/"):
        return False
    return bool(re.search(r"(?<![-+])[-+](?![-+=])", code))


def _is_local(text, m):
    # `"T00:00:00") + "Z"` appends the zone a few characters on: that is UTC.
    return not re.match(r"[^;\n]{0,12}['\"`]Z['\"`]", text[m.end():])


def scan_text(text):
    """Line numbers (1-based) of 24-hour day steps in a file that holds local midnights."""
    if not has_day_const(text) or not any(_is_local(text, m) for m in LOCAL_MIDNIGHT.finditer(text)):
        return []
    lines = text.splitlines()
    hits = []
    for i, line in enumerate(lines):
        if ALLOW in line or (i and ALLOW in lines[i - 1]):
            continue
        if _arith_hit(line):
            hits.append(i + 1)
    return hits


def iter_files(roots):
    for root in roots:
        root = pathlib.Path(root)
        paths = [root] if root.is_file() else sorted(root.rglob("*"))
        for path in paths:
            if path.suffix not in SUFFIXES or not path.is_file():
                continue
            if SKIP_PARTS.intersection(path.parts) or ".test." in path.name or path.name.startswith("test_"):
                continue
            yield path


def main(argv):
    roots = argv or [str(ROOT / "ventures")]
    total = 0
    for path in iter_files(roots):
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for n in scan_text(text):
            rel = path.relative_to(ROOT) if path.is_absolute() and ROOT in path.parents else path
            print(f"{rel}:{n}: day step in 24-hour blocks on a local-midnight date (crosses DST a day off)")
            total += 1
    if total:
        print(f"{total} hit(s). Step calendar days (new Date(y, m, d + n)) or keep the tool in UTC.")
        return 1
    print("check_dst_day_step: no 24-hour day steps on local-midnight dates")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
