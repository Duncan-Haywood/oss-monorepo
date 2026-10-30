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

    def test_flags_a_formatter_with_a_second_parameter(self):
        # Found by red team 2026-10-24: `saas-seat-true-up/calc.mjs` shipped
        # `formatMoney(value, currency = '$')` printing "$-9.24" while the
        # one-parameter patterns reported the repository clean.
        self.assert_flagged(
            "export function formatMoney(value, currency = '$') {\n"
            "  return `${currency}${value.toFixed(2)}`;\n}",
            name="calc.mjs",
        )
        self.assert_flagged("const money = (n, d = 2) => `$${n.toFixed(d)}`;")

    def test_flags_the_other_currency_names(self):
        # Found by the first red-team run (2026-10-15): the same "$-50.00"
        # defect, shipped under names the guard did not read.
        self.assert_flagged("export const dollars = (c) => `$${(c / 100).toFixed(2)}`;")
        self.assert_flagged(
            "export function formatUsd(value) {\n"
            "  if (value < 10) return `$${value.toFixed(2)}`;\n"
            "  return `$${Math.round(value)}`;\n}",
            name="calc.mjs",
        )

    def test_reports_the_line_number_and_text_of_the_formatter(self):
        source = "// header\nconst money = (n) => `$${n.toFixed(2)}`;\n"
        self.assertEqual(list(guard.findings_in(self.write("calc.mjs", source))),
                         [(2, "const money = (n) => `$${n.toFixed(2)}`;")])

    def test_counts_a_blank_first_line(self):
        source = "\nconst money = (n) => `$${n.toFixed(2)}`;\n"
        self.assertEqual(list(guard.findings_in(self.write("calc.mjs", source))),
                         [(2, "const money = (n) => `$${n.toFixed(2)}`;")])

    def test_passes_a_magnitude_formatter_whose_caller_signs(self):
        self.assert_clean(
            "const dollars = (value) => `$${Math.round(Math.abs(value)).toLocaleString('en-US')}`;"
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

    # The spellings that guard *before* interpolating. Until 2026-09-07 the
    # patterns required the arrow body to open with the template literal, so
    # every one of these read as clean -- measured on four live files, two of
    # which were rendering a reachable negative ("$-1.46" for a 400-page
    # paperback's per-copy net, and a negative `revenueChange` after a price
    # rise). The blind spot is worse than a plain miss: kdp-royalty-calculator
    # shipped the unguarded spelling in `calc.mjs` and the guarded one in
    # `index.html`, so the venture failed CI on the copy nobody looks at while
    # the copy on screen stayed wrong and unreported.
    def test_flags_a_formatter_that_guards_before_interpolating(self):
        self.assert_flagged(
            "const money = (n) => (Number.isFinite(n) ? `$${n.toFixed(2)}` : 'not available');"
        )
        self.assert_flagged(
            "const money = (value) => value == null ? 'add a price' : `$${value.toFixed(2)}`;"
        )
        self.assert_flagged(
            "const money=n=>Number.isFinite(n)?`$${n.toFixed(2)}`:'not available';"
        )
        self.assert_flagged(
            "function money(value) {\n"
            "  return value == null ? 'add a price' : `$${value.toFixed(2)}`;\n"
            "}",
            name="calc.mjs",
        )

    def test_passes_a_guarded_formatter_that_signs_correctly(self):
        # The same four repaired. A guard that flagged these too would make the
        # fix unreachable, which is the failure mode the module docstring calls
        # "gets deleted rather than obeyed".
        self.assert_clean(
            "const money = (n) => {\n"
            "  if (!Number.isFinite(n)) return 'not available';\n"
            "  const text = `$${Math.abs(n).toFixed(2)}`;\n"
            "  return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;\n"
            "};"
        )
        self.assert_clean(
            "function money(value) {\n"
            "  if (value == null) return 'add a price';\n"
            "  const text = `$${Math.abs(value).toFixed(2)}`;\n"
            "  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;\n"
            "}",
            name="calc.mjs",
        )
        # Already correct in the tree: the sign is outside the symbol already,
        # spelled with a Unicode minus.
        self.assert_clean(
            "const money = (value) => (value < 0 ? `−$${Math.abs(value).toFixed(2)}` "
            ": `$${value.toFixed(2)}`);"
        )

    def test_reports_one_finding_per_formatter(self):
        # Both the original patterns and the body scan match the unguarded
        # arrow spelling. It is one defect and must be named once.
        found = list(
            guard.findings_in(
                self.write("one.html", "const money = (n) => `$${n.toFixed(2)}`;")
            )
        )
        self.assertEqual(len(found), 1)


class SourceFiles(unittest.TestCase):
    def test_skips_each_test_file_spelling_and_keeps_real_sources(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "v").mkdir()
            names = ["index.html", "app.mjs", "a.test.mjs", "test_a.mjs", "a_test.mjs", "notes.md"]
            for n in names:
                (root / "v" / n).write_text("", encoding="utf-8")
            old = guard.VENTURES
            guard.VENTURES = root
            try:
                got = sorted(p.name for p in guard.source_files())
            finally:
                guard.VENTURES = old
        self.assertEqual(got, ["app.mjs", "index.html"])


class TheRepository(unittest.TestCase):
    def test_repo_root_is_the_checkout_root(self):
        self.assertTrue((guard.REPO_ROOT / "platform" / "ci" / "check_money_sign.py").is_file())

    def test_main_exits_1_and_names_a_bad_formatter(self):
        import contextlib
        import io

        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "v").mkdir()
            (root / "v" / "index.html").write_text(
                "const money = (n) => `$${n.toFixed(2)}`;", encoding="utf-8"
            )
            old = (guard.VENTURES, guard.REPO_ROOT)
            guard.VENTURES, guard.REPO_ROOT = root, root
            out = io.StringIO()
            try:
                with contextlib.redirect_stdout(out):
                    code = guard.main()
            finally:
                guard.VENTURES, guard.REPO_ROOT = old
        self.assertEqual(code, 1)
        self.assertIn("v/index.html:1:", out.getvalue())

    def test_no_venture_source_signs_inside_the_symbol(self):
        # The guard's own subject. Kept here as well as in CI so a contributor
        # running the unit tests locally sees the same verdict.
        self.assertEqual(guard.main(), 0)


if __name__ == "__main__":
    unittest.main()
