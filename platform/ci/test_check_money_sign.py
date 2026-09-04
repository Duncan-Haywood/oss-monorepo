#!/usr/bin/env python3
"""Tests for the money-sign guard.

The guard is worth having only if it is both sensitive -- it catches every
spelling the 222 vendored copies had actually drifted into on 2026-08-28 -- and
quiet, because a check that fires on a correctly written formatter gets deleted
rather than obeyed.
"""

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import check_money_sign as guard


class FindingsIn(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def write(self, name: str, text: str) -> Path:
        path = Path(self.tmp.name) / name
        path.write_text(text, encoding="utf-8")
        return path

    def assert_flagged(self, source: str, name: str = "index.html"):
        found = list(guard.findings_in(self.write(name, source)))
        self.assertEqual(len(found), 1, f"not flagged: {source!r}")

    def assert_clean(self, source: str, name: str = "index.html"):
        self.assertEqual(list(guard.findings_in(self.write(name, source))), [])

    # Every spelling that was actually in the tree. These are not hypothetical
    # variants: each one was counted in `ventures/` before the fix landed.
    def test_flags_the_arrow_spellings(self):
        self.assert_flagged(
            "const money = (value) => `$${value.toLocaleString('en-US', "
            "{ minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;"
        )
        self.assert_flagged("const money = value => `$${value.toFixed(2)}`;")
        self.assert_flagged("const money = (value) => `$${value.toFixed(2)}`;")
        self.assert_flagged("const money=n=>`$${n.toFixed(2)}`;")
        self.assert_flagged("const money = (n) => `$${n.toFixed(2)}`;")
        self.assert_flagged("const money2 = (value) => `$${Number(value).toFixed(2)}`;")
        self.assert_flagged(
            "const money = (value) => `$${(Math.round((Number(value) + "
            "Number.EPSILON) * 100) / 100).toFixed(2)}`;"
        )

    def test_flags_the_declaration_spelling(self):
        self.assert_flagged(
            "function money(value) {\n"
            "  return `$${value.toLocaleString('en-US', "
            "{ minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;\n"
            "}",
            name="calc.mjs",
        )

    def test_passes_a_formatter_that_signs_correctly(self):
        self.assert_clean(
            "const money = (value) => {\n"
            "  const format = (value) => `$${value.toFixed(2)}`;\n"
            "  const text = format(Math.abs(value));\n"
            "  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;\n"
            "};"
        )

    def test_passes_intl_and_hand_rolled_sign_placement(self):
        self.assert_clean(
            "const money = (value) => new Intl.NumberFormat('en-US', "
            "{ style: 'currency', currency: 'USD' }).format(value);"
        )
        self.assert_clean(
            "function money(value) {\n"
            "  const sign = value < 0 ? '-' : '';\n"
            "  return `${sign}$${Math.abs(value).toFixed(2)}`;\n"
            "}",
            name="calc.mjs",
        )

    def test_leaves_a_formatter_that_places_its_own_sign_alone(self):
        # `signedMoney` prints a leading "+" as well and is not this defect.
        self.assert_clean(
            "const signedMoney = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}"
            "$${Math.abs(value).toFixed(2)}`;"
        )

    def test_does_not_flag_an_unrelated_interpolation(self):
        self.assert_clean("const label = (value) => `$${value} each`;")
        self.assert_clean("el('total').textContent = `$${total}`;")


class TheRepository(unittest.TestCase):
    def test_no_venture_source_signs_inside_the_symbol(self):
        # The guard's own subject. Kept here as well as in CI so a contributor
        # running the unit tests locally sees the same verdict.
        self.assertEqual(guard.main(), 0)


if __name__ == "__main__":
    unittest.main()
