#!/usr/bin/env python3
"""Find venture text that says 2026 but gives a 2025 retirement or HSA limit.

Why this exists
---------------
Every November the IRS raises the 401(k), IRA, HSA and related dollar limits
for the next year. A page written in 2025 that said "$7,000 for 2025/2026"
or "2026 HSA limit: $4,300" was a reasonable guess then and is wrong now, and
no unit test notices, because the test was written from the same guess. The
IRS notices are the only independent check, so this script pins the 2025 and
2026 figures from them and looks for a sentence that names 2026 and the limit
but carries only the old number.

Source of the pinned figures
----------------------------
Notice 2025-67 (irs.gov/pub/irs-drop/n-25-67.pdf) for the retirement plan and
IRA limits, and Rev. Proc. 2025-19 section 3 (irs.gov/pub/irs-drop/rp-25-19.pdf)
for the HSA and HDHP figures, both read with pdftotext on 2026-11-17. Notice
2025-67 states each 2025 figure next to the 2026 one ("increased from $7,000
to $7,500"), so one source pins both years. The 2025 HSA figures are Rev. Proc.
2024-25's, as Rev. Proc. 2025-19 does not restate them; they are only used to
recognise a stale number, never asserted. Add a limit only from IRS text, with
where it was read.

How a segment is flagged
------------------------
Shipped venture files (*.html, *.mjs, *.js, *.py; tests excluded) are cut into
segments: lines, then sentences and HTML block ends. A segment is flagged for
a limit when it names 2026, matches the limit's keyword, contains the 2025
figure and does not contain the 2026 figure. "$7,000 for 2025/2026" is
flagged; "2025: $7,000; 2026: $7,500" is not. A figure that stayed the same
(the $11,250 age 60 to 63 catch-up, the $160,000 HCE threshold) is not pinned,
since it cannot be stale.

Every hit needs a person to read it: a sentence can name 2026 and a 2025
figure on purpose ("up from $7,000 in 2025"). Words like "up from", "was",
"increased from" or "in 2025" right before the old figure mark it as history
and skip it. A line checked and intended may carry `plan-limits: ok`.

    python3 platform/ci/check_plan_limits_2026.py [--json] [--strict] [root ...]

A report: exit 0 unless --strict is passed and something is found; exit 2
when the roots hold no files to scan.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ("IRS Notice 2025-67 and Rev. Proc. 2025-19 section 3 "
          "(irs.gov/pub/irs-drop/, read 2026-11-17)")

K401 = r"401\s?\(?k\)?|403\s?\(?b\)?|457|elective deferral|402\s?\(g\)|thrift savings|\bTSP\b|deferral"
IRA = r"\bIRA\b|\bIRAs\b|individual retirement"
HSA = r"\bHSA\b|health savings"

# (name, keyword regex, 2025 figure, 2026 figure)
LIMITS = [
    ("402(g) elective deferral (401(k), 403(b), 457, TSP)", K401, 23500, 24500),
    ("age 50+ catch-up (401(k), 403(b), 457)", r"catch[- ]?up", 7500, 8000),
    ("415(c) annual additions", r"415\s?\(?c\)?|annual additions|overall limit|total contributions", 70000, 72000),
    ("401(a)(17) compensation limit", r"401\s?\(a\)\s?\(17\)|compensation limit|compensation cap", 350000, 360000),
    ("SIMPLE deferral", r"\bSIMPLE\b", 16500, 17000),
    ("SIMPLE age 50+ catch-up", r"\bSIMPLE\b", 3500, 4000),
    ("IRA contribution limit", IRA, 7000, 7500),
    ("IRA age 50+ catch-up", IRA, 1000, 1100),
    ("key employee threshold", r"key employee|top[- ]heavy", 230000, 235000),
    ("Roth IRA phase-out start, single", r"\bRoth\b", 150000, 153000),
    ("Roth IRA phase-out end, single", r"\bRoth\b", 165000, 168000),
    ("Roth IRA phase-out start, joint", r"\bRoth\b", 236000, 242000),
    ("Roth IRA phase-out end, joint", r"\bRoth\b", 246000, 252000),
    ("HSA self-only limit", HSA, 4300, 4400),
    ("HSA family limit", HSA, 8550, 8750),
    ("HDHP minimum deductible, self-only", r"HDHP|high[- ]deductible", 1650, 1700),
    ("HDHP minimum deductible, family", r"HDHP|high[- ]deductible", 3300, 3400),
    ("HDHP out-of-pocket maximum, self-only", r"HDHP|high[- ]deductible", 8300, 8500),
    ("HDHP out-of-pocket maximum, family", r"HDHP|high[- ]deductible", 16600, 17000),
]

EXT = {".html", ".mjs", ".js", ".py"}
SPLIT = re.compile(r"(?<=[.!?;])\s+(?=[A-Z$(])|</(?:p|li|td|th|tr|h\d|dd|dt|div|option)>|<br\s*/?>|\\n")
HISTORY = re.compile(r"(?:up from|was|were|increased from|rose from|from|in 2025|for 2025|2025:?|2025\)?\s*(?:limit|figure)?\s*(?:of|was|is)?)\s*$", re.I)
OK = "plan-limits: ok"


def figure(n: int) -> re.Pattern:
    """$7,000 / 7,000 / 7_000 / 7000 as a whole number, not part of 17,000 or 7,000.50."""
    a = f"{n:,}"
    alts = [re.escape(a), a.replace(",", "_"), str(n)]
    if n % 1000 == 0:
        alts.append(rf"{n // 1000}[kK]")
    return re.compile(r"(?<![\w.,])\$?(?:%s)(?![\w]|[.,]\d)" % "|".join(alts))


PINNED = [(name, re.compile(kw, re.I), old, new, figure(old), figure(new)) for name, kw, old, new in LIMITS]
YEAR = re.compile(r"(?<!\d)2026(?!\d)")


def segments(text: str, need: str = ""):
    for lineno, line in enumerate(text.splitlines(), 1):
        if need not in line or OK in line:
            continue
        for seg in SPLIT.split(line):
            if seg and len(seg) <= 1200:
                yield lineno, seg


def scan_text(text: str):
    hits = []
    # A segment can only name 2026 if its line holds "2026", so a file or line
    # without it is skipped before the split (same hits, a fifth of the time:
    # docs/history/ci-perf-2026-11-20-paired-check-prefilters.md).
    if "2026" not in text:
        return hits
    for lineno, seg in segments(text, need="2026"):
        if not YEAR.search(seg):
            continue
        for name, kw, old, new, old_re, new_re in PINNED:
            if not kw.search(seg) or new_re.search(seg):
                continue
            # $7,500 is both the stale 401(k) catch-up and the current IRA limit:
            # a segment that names the other limit is reading its 2026 figure.
            if any(o_new == old and o_kw.search(seg) for _, o_kw, _, o_new, _, _ in PINNED):
                continue
            for m in old_re.finditer(seg):
                if HISTORY.search(seg[max(0, m.start() - 40):m.start()]):
                    continue
                hits.append({"line": lineno, "limit": name, "found": old, "want": new,
                             "text": seg.strip()[:200]})
                break
    return hits


def shipped(roots):
    for root in roots:
        for p in sorted(Path(root).rglob("*")):
            if p.suffix not in EXT or not p.is_file():
                continue
            parts = set(p.parts)
            if parts & {"node_modules", "tests", "test", "__pycache__", "dist"}:
                continue
            if ".test." in p.name or p.name.startswith("test_") or p.name.endswith("_test.py"):
                continue
            yield p


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("roots", nargs="*", default=[str(ROOT / "ventures")])
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--strict", action="store_true")
    a = ap.parse_args(argv)
    found = []
    files = 0
    for p in shipped(a.roots):
        files += 1
        try:
            text = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for h in scan_text(text):
            try:
                h["file"] = str(p.resolve().relative_to(ROOT))
            except ValueError:
                h["file"] = str(p)
            found.append(h)
    if not files:
        print(f"no shipped venture files under {a.roots}: wrong root?", file=sys.stderr)
        return 2
    if a.json:
        print(json.dumps({"source": SOURCE, "hits": found}, indent=1))
    else:
        for h in found:
            print(f"{h['file']}:{h['line']}: {h['limit']}: 2026 with ${h['found']:,} "
                  f"(2026 is ${h['want']:,}): {h['text']}")
        print(f"{len(found)} hit(s); figures from {SOURCE}")
    return 1 if (a.strict and found) else 0


if __name__ == "__main__":
    sys.exit(main())
