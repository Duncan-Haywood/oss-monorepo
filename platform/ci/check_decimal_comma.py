#!/usr/bin/env python3
"""Flag venture parsers that accept semicolon CSVs but read "1,5" as 15.

A semicolon-delimited CSV is what Excel writes in most of Europe, where the
comma is the decimal point: "19,99" is nineteen ninety-nine and "1.249,00"
is one thousand two hundred and forty-nine. A parser that sniffs ";" as a
delimiter and then cleans numbers with a currency strip such as
`.replace(/[$€£,%\\s]/g, "")` silently reads those cells 10 or 100 times too
large (or 1,000 times too small), with no error to warn the user.

On 2026-11-18 (red-team run) seven ventures did exactly that:
wasserstein-distance, gaussian-process-regression, hdbscan-clustering,
isolation-forest, ad-incrementality-test-analyzer, clearance-markdown-planner
and liquidation-pallet-bid-calculator.

A file is flagged when it (1) lists ";" among candidate delimiters, (2)
strips commas with a non-negated character class that also holds a currency
or percent sign, and (3) never names `decimalComma`, the marker the fixes use
(a `decimalComma` flag on the parsed table, or a `decimalCommaCell` helper,
both driven by the vendored `detectDecimalComma(rows, delim)`). Parsers that already detect the
decimal mark another way (bank-csv-to-qbo-converter's detectDecimal,
eu-vat-oss-calculator's separator logic) use a different strip and are not
flagged. The 32 report analyzers that vendor detectDecimalComma name the
marker too; check_decimal_comma_contract.py tests those copies, while this
check finds parsers with no decimal-comma handling at all.

    python3 platform/ci/check_decimal_comma.py      # exit 1 on any hit

No arguments: platform/ci/unwired_checks.py runs it on every venture PR.
"""
import re
import sys
from pathlib import Path
from repo_files import ls_files

ROOT = Path(__file__).resolve().parents[2]
SNIFF = re.compile(r'\[[^\]\n]*";"[^\]\n]*\]')
STRIP = re.compile(r'\.replace\(/\[(?!\^)([^\]]*)\]/g,\s*""\)')
MARKER = "decimalComma"


def problem(text):
    """The offending strip class when the text has the bug's shape, else None."""
    if MARKER in text or not SNIFF.search(text):
        return None
    for m in STRIP.finditer(text):
        cls = m.group(1)
        if "," in cls and re.search(r"[$€£%]", cls):
            return m.group(0)
    return None


def candidates():
    for rel in ls_files(ROOT, "ventures"):
        if rel.endswith((".mjs", ".js")) and ".test." not in rel and "/node_modules/" not in rel and "/vendor/" not in rel:
            yield rel


def main():
    hits = []
    for rel in candidates():
        try:
            text = (ROOT / rel).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        bad = problem(text)
        if bad:
            hits.append(f"{rel}: sniffs ';' as a delimiter but strips commas from numbers ({bad})")
    for h in hits:
        print(h)
    if hits:
        print(f"\n{len(hits)} file(s) read a European decimal comma as a thousands separator. In a ';' file, "
              "vendor detectDecimalComma and rewrite '1,5' and '1.234,5' with a point "
              "before stripping commas (see ventures/clearance-markdown-planner/calc.mjs).")
        return 1
    print("check_decimal_comma: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
