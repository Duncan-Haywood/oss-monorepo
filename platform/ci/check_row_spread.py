#!/usr/bin/env python3
"""Fail when a venture that reads uploaded rows spreads them into Math.min/max.

`Math.max(...orders.map((o) => o.t))` passes every value as a separate
argument. V8 (Chrome, Edge, Node) throws `RangeError: Maximum call stack size
exceeded` at about 125,000 arguments, so a tool that is fine on the sample
file crashes on a real export: a busy restaurant's year of delivery orders, a
store's order history, a SaaS's year of Stripe charges. A red-team run on
2026-11-14 reproduced it in five analyzers (restaurant-delivery-commission-
analyzer, customer-lifetime-value-predictor, stripe-failed-payment-recovery-
analyzer, trial-conversion-timing-analyzer, whatnot-sales-report-analyzer)
and fixed them with a loop or `reduce`.

A file counts as a row reader when it parses a file (`parseCsv`, `parseRows`,
`parseOrders`, `splitLine`, ...). In such a file a non-comment line that
spreads a row-named array (`rows`, `orders`, `events`, `items`, `list`,
`transactions`, ...) straight into `Math.min(` or `Math.max(` is flagged.
Spreads over a few known-small arrays (`Math.max(...[a, b])`, a list of
months) are not matched because they do not use those names.

The files that already had it on 2026-11-14 are listed in
`row_spread_baseline.txt`, a ratchet: a new copy fails, and so does a listed
file that is now fixed or gone, so the list only shrinks. Fix one with
`xs.reduce((m, x) => Math.max(m, x.t), -Infinity)` and a 200,000-row test,
then run `--write-baseline`.

    python3 platform/ci/check_row_spread.py [--root DIR] [--write-baseline]
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE = Path(__file__).with_name("row_spread_baseline.txt")
ROW_NAMES = (r"rows|orders|list|lines|records|txns|transactions|entries|items|payments|sales"
             r"|events|trials|charges|payouts|invoices|donations|gifts|leads|tenants|bills|claims")
SPREAD = re.compile(r"Math\.(?:min|max)\(\s*(?:[^()]*,\s*)?\.\.\.\s*(?:" + ROW_NAMES + r")\b")
READER = re.compile(r"\b(parseCsv|parseCSV|parseRows|parseOrders|splitLine|normalizeRows|parseTable|parseFile)\b")
SKIP_PARTS = {"node_modules", ".next", "dist", "build", ".git", "vendor", "eval"}


def offending_lines(text):
    """1-based line numbers of row spreads, ignoring // comment lines."""
    out = []
    for i, line in enumerate(text.splitlines(), 1):
        if line.lstrip().startswith(("//", "*", "/*")):
            continue
        if SPREAD.search(line):
            out.append(i)
    return out


def scan(root):
    """Return {repo-relative path: [line numbers]} for row readers under root/ventures."""
    found = {}
    base = root / "ventures"
    for p in sorted(list(base.rglob("*.mjs")) + list(base.rglob("*.js"))):
        rel = p.relative_to(root)
        if SKIP_PARTS & set(rel.parts) or p.name.endswith((".test.mjs", ".test.js", ".min.js")):
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if not READER.search(text):
            continue
        lines = offending_lines(text)
        if lines:
            found[rel.as_posix()] = lines
    return found


def read_baseline(path):
    if not path.exists():
        return set()
    return {l.strip() for l in path.read_text().splitlines() if l.strip() and not l.startswith("#")}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    ap.add_argument("--baseline", type=Path, default=BASELINE)
    ap.add_argument("--write-baseline", action="store_true")
    a = ap.parse_args(argv)
    found = scan(a.root)
    if a.write_baseline:
        a.baseline.write_text("# Row readers that still spread rows into Math.min/max (check_row_spread.py). Only shrinks.\n"
                              + "".join(f"{p}\n" for p in sorted(found)))
        print(f"wrote {len(found)} files to {a.baseline.name}")
        return 0
    base = read_baseline(a.baseline)
    new = sorted(set(found) - base)
    stale = sorted(base - set(found))
    for p in new:
        print(f"{p}:{found[p][0]}: Math.min/max(...rows) overflows the call stack past ~125k rows; use a loop or reduce")
    for p in stale:
        print(f"{p}: listed in {a.baseline.name} but no longer spreads rows; remove the line (the list only shrinks)")
    if new or stale:
        return 1
    print(f"row spreads: {len(found)} baselined row readers, no new ones")
    return 0


if __name__ == "__main__":
    sys.exit(main())
