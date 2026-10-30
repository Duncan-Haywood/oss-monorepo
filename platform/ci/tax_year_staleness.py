#!/usr/bin/env python3
"""Report ventures whose tax figures are labelled for a year that has ended.

Why this exists
---------------
A calculator that applies "2025" brackets, limits or rates in late 2026 is
wrong in a way no unit test sees: the arithmetic is right and the constants
are a year old. This is a report, not a gate: whether a figure is stale
depends on the rule (a 2025 estate-tax exemption is not stale in a 2025
return tool), so it lists candidates for a person or agent to check against
the IRS text.

What is flagged
---------------
A product directory whose shipped files (index.html, *.mjs, *.js, *.py,
excluding tests) name a tax authority (IRS, HMRC, Rev. Proc., Notice) and
whose newest tax year mentioned next to a tax word is older than the current
year. Products that mention the current year anywhere near a tax word are
not flagged. Pass --year to pick the year; default is today's.

    python3 platform/ci/tax_year_staleness.py [--year 2026] [--json] [--limit 40]
"""
from __future__ import annotations

import argparse
import datetime
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUTH = re.compile(r"\b(IRS|HMRC|Rev\.? ?Proc|Notice 20\d\d|Form 1040|Schedule C|FICA|W-2)\b")
TAXWORD = re.compile(r"(tax|bracket|deduction|limit|wage base|mileage|threshold|rate|exempt|contribution)", re.I)
YEAR = re.compile(r"(?<![\d.$,/-])(20[12]\d)(?![\d,%])")
EXT = {".html", ".mjs", ".js", ".py"}


def shipped(d: Path):
    for p in d.rglob("*"):
        if p.suffix not in EXT or not p.is_file() or "node_modules" in p.parts:
            continue
        n = p.name
        if ".test." in n or n.startswith("test_") or n.endswith("_test.py") or "fixture" in p.parts:
            continue
        yield p


def scan(d: Path, year: int):
    newest, auth, where = 0, 0, ""
    for p in shipped(d):
        try:
            text = p.read_text(errors="ignore")
        except OSError:
            continue
        auth += len(AUTH.findall(text))
        for line in text.splitlines():
            if not TAXWORD.search(line) or len(line) > 600:
                continue
            for m in YEAR.finditer(line):
                y = int(m.group(1))
                if y <= year + 1 and y > newest:
                    newest, where = y, f"{p.relative_to(d)}: {line.strip()[:110]}"
    return newest, auth, where


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=datetime.date.today().year)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--limit", type=int, default=40)
    a = ap.parse_args()
    rows = []
    for d in sorted((ROOT / "ventures").iterdir()):
        if not d.is_dir():
            continue
        newest, auth, where = scan(d, a.year)
        if auth >= 3 and 0 < newest < a.year:
            rows.append({"product": d.name, "newest_year": newest, "authority_mentions": auth, "evidence": where})
    rows.sort(key=lambda r: (r["newest_year"], -r["authority_mentions"]))
    if a.json:
        print(json.dumps(rows, indent=1))
    else:
        print(f"{len(rows)} products name a tax authority but show no {a.year} figure (newest year found shown)")
        for r in rows[: a.limit]:
            print(f"{r['newest_year']}  {r['product']:<48} {r['evidence']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
