#!/usr/bin/env python3
"""Ratchet: no new venture parser that splits CSV rows on every comma while
its number reader strips commas as thousands separators.

Found by the red team on 2026-11-16: bookkeeping-client-fee-calculator read the
roster row ``Acme,$1,200,8`` as a $1 fee, 200 hours and $8 software with no
error, because ``line.split(",")`` cut ``$1,200`` in two and ``toNumber``
(which drops commas, so ``"$1,200"`` typed in a form field works) happily read
both halves. A spreadsheet's quoted ``"$1,200"`` was rejected outright. Six
engines built from the same template had the same bug and now use a
quote-aware ``splitCsvLine`` that refuses an unquoted ``$1,200``.

A file is flagged when it calls ``.split(",")`` on a row and also strips
commas from numbers (``replace(/,/g``), and has no ``splitCsvLine``. KNOWN
lists the files that did so on 2026-11-16 (not each one is a live bug: some
split a single field, some never take money). A new file fails; a listed file
that no longer matches fails too, so the list only shrinks. Fix one by giving
it a quote-aware split (copy ``splitCsvLine`` from
ventures/interior-design-fee-calculator/engine.mjs, with a test) and drop it
from KNOWN.

    cd platform/ci && python3 -m unittest test_csv_thousands_split
"""
import functools
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPLIT = re.compile(r"""\.split\(\s*["'],["']\s*\)""")
STRIP = re.compile(r"replace\(/,/g")

KNOWN = {
    # a scan of main on 2026-11-16; see the module docstring
    "ventures/401k-plan-fee-calculator/calc.mjs",
    "ventures/benford-audit/benford.mjs",
    "ventures/card-grading-submission-picker/engine.mjs",
    "ventures/cash-flow-risk-forecaster/calc.mjs",
    "ventures/concrete-maturity/maturity.mjs",
    "ventures/construction-delay-claim-calculator/calc.mjs",
    "ventures/dog-grooming-price-calculator/engine.mjs",
    "ventures/ebay-transaction-report-analyzer/calc.mjs",
    "ventures/embroidery-shop-quote-calculator/engine.mjs",
    "ventures/etsy-listing-csv-check/calc.mjs",
    "ventures/league-schedule-generator/divisions.mjs",
    "ventures/payroll-register-to-journal/calc.mjs",
    "ventures/price-drop-watcher/extract.mjs",
    "ventures/saas-renewal-planner/engine.mjs",
    "ventures/sales-call-notes-desk/calc.mjs",
    "ventures/sales-seasonality-forecaster/calc.mjs",
    "ventures/shopify-customer-csv-check/calc.mjs",
    "ventures/shopify-product-csv-check/calc.mjs",
    "ventures/shopify-to-woocommerce-converter/converter.mjs",
    "ventures/slot-keeper/slot.mjs",
    "ventures/square-sales-to-journal/calc.mjs",
    "ventures/stl-decomposition/engine.mjs",
    "ventures/syndication-waterfall-calculator/calc.mjs",
    "ventures/ucr-fee-calculator/calc.mjs",
    "ventures/uk-vat-registration-checker/calc.mjs",
    "ventures/usage-based-pricing-simulator/calc.mjs",
    "ventures/vcard-contacts-check/calc.mjs",
    "ventures/volunteer-shift-scheduler/calc.mjs",
    "ventures/woocommerce-product-csv-check/calc.mjs",
}


@functools.cache
def flagged():
    """The flagged files, as a frozenset. Scanned once per process: the
    shrink test once called this for every KNOWN entry, 31 scans of about
    4,900 files and 7.4 s of the unwired pool
    (docs/history/ci-perf-2026-11-21-csv-split-ratchet-once.md)."""
    out = set()
    for p in sorted((ROOT / "ventures").glob("*/*.mjs")):
        if p.name.endswith(".test.mjs"):
            continue
        s = p.read_text(encoding="utf-8", errors="replace")
        if "function splitCsvLine" in s:
            continue
        if SPLIT.search(s) and STRIP.search(s):
            out.add(p.relative_to(ROOT).as_posix())
    return frozenset(out)


class CsvThousandsSplit(unittest.TestCase):
    def test_no_new_comma_split_parsers(self):
        new = sorted(flagged() - KNOWN)
        self.assertEqual(new, [], "these split CSV rows on every comma while their number reader "
                         "strips thousands commas, so an unquoted $1,200 reads as $1: use a "
                         "quote-aware splitCsvLine (see the docstring)")

    def test_known_list_only_shrinks(self):
        stale = sorted(f for f in KNOWN if f not in flagged())
        self.assertEqual(stale, [], "fixed or removed: drop these from KNOWN")

    def test_detector_flags_the_bug_and_spares_the_fix(self):
        bad = 'const f = line.split(",");\nconst toNumber = (s) => Number(s.replace(/,/g, ""));'
        self.assertTrue(SPLIT.search(bad) and STRIP.search(bad))
        fixed = ROOT / "ventures/bookkeeping-client-fee-calculator/engine.mjs"
        self.assertNotIn(fixed.relative_to(ROOT).as_posix(), flagged())


if __name__ == "__main__":
    unittest.main()
