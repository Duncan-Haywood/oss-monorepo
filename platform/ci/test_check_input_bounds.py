"""Unit tests for check_input_bounds.py.

The two things worth pinning: the guard shapes these calculators actually
write (a lone upper bound, and the `x < 0 || x >= 100` pair that carries both
at once), and the pairing rule that keeps the check narrow -- a bound is only
enforced against an input whose `id` is the variable the guard reads.
"""

from __future__ import annotations

import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

import contextlib
import io
import os

from check_input_bounds import check_input, check_venture, guards, main, percent_scaled


class GuardParsing(unittest.TestCase):
    def test_reads_a_lone_upper_bound(self):
        found = guards('if (rate >= 1000) throw new Error("too high");')
        self.assertEqual(found, {"rate": [(">=", Decimal("1000"))]})

    def test_reads_both_halves_of_a_combined_guard(self):
        # The spelling most of these calculators use. The lower half names the
        # variable first, the upper half after the `||`.
        found = guards(
            'if (pct < 0 || pct >= 100) {\n'
            '  throw new Error("Early-pay discount must be at least 0 and below 100");\n'
            '}'
        )
        self.assertEqual(
            sorted(found["pct"]), [("<", Decimal("0")), (">=", Decimal("100"))]
        )

    def test_reads_a_strict_upper_bound(self):
        self.assertEqual(
            guards("if (returnRatePercent > 100) throw new Error('x');"),
            {"returnRatePercent": [(">", Decimal("100"))]},
        )

    def test_ignores_a_comparison_that_does_not_throw(self):
        self.assertEqual(guards("if (pct >= 100) return null;"), {})


class InputChecking(unittest.TestCase):
    def test_missing_max_is_a_problem(self):
        problem = check_input(
            {"type": "number", "id": "pct", "min": "0"}, [(">=", Decimal("100"))]
        )
        self.assertIn("no max", problem)

    def test_max_at_an_inclusive_limit_is_a_problem(self):
        # `>= 100` throws *at* 100, so max="100" still lets it through.
        problem = check_input(
            {"type": "number", "id": "pct", "max": "100"}, [(">=", Decimal("100"))]
        )
        self.assertIn("still permits", problem)

    def test_max_below_an_inclusive_limit_is_fine(self):
        self.assertIsNone(
            check_input(
                {"type": "number", "id": "pct", "max": "99.9"}, [(">=", Decimal("100"))]
            )
        )

    def test_max_at_a_strict_limit_is_fine(self):
        # `> 100` accepts 100 itself, so max="100" is exactly right.
        self.assertIsNone(
            check_input(
                {"type": "number", "id": "pct", "max": "100"}, [(">", Decimal("100"))]
            )
        )

    def test_min_of_zero_against_a_throw_on_zero_is_a_problem(self):
        problem = check_input(
            {"type": "number", "id": "amount", "min": "0"}, [("<=", Decimal("0"))]
        )
        self.assertIn("still permits", problem)

    def test_min_above_the_limit_is_fine(self):
        self.assertIsNone(
            check_input(
                {"type": "number", "id": "amount", "min": "0.01"},
                [("<=", Decimal("0"))],
            )
        )

    def test_a_non_numeric_input_is_left_alone(self):
        # A text or date field carries no range for checkValidity() to report,
        # and the calculator's guard on it is not a range problem.
        self.assertIsNone(
            check_input(
                {"type": "text", "id": "pct"}, [(">=", Decimal("100"))]
            )
        )


class VentureScan(unittest.TestCase):
    def _venture(self, module: str, page: str) -> Path:
        directory = Path(tempfile.mkdtemp())
        (directory / "calc.mjs").write_text(module, encoding="utf-8")
        (directory / "index.html").write_text(page, encoding="utf-8")
        return directory

    def test_reports_an_unbounded_input_its_calculator_guards(self):
        directory = self._venture(
            'export function calc(i) {\n'
            '  const pct = Number(i.pct);\n'
            '  if (pct < 0 || pct >= 100) throw new Error("out of range");\n'
            '  return pct;\n'
            '}',
            '<input id="pct" type="number" min="0" step="0.1" value="2">',
        )
        problems = check_venture(directory)
        self.assertEqual(len(problems), 1)
        self.assertIn("pct", problems[0])

    def test_silent_once_the_bound_is_declared(self):
        directory = self._venture(
            'if (pct < 0 || pct >= 100) throw new Error("out of range");',
            '<input id="pct" type="number" min="0" step="0.1" max="99.9" value="2">',
        )
        self.assertEqual(check_venture(directory), [])

    def test_an_input_no_guard_names_is_left_alone(self):
        # The pairing rule. `overheadRate` is unguarded, so its missing max is
        # not this check's business -- flagging it is how a bound checker
        # becomes noise and gets switched off.
        directory = self._venture(
            'if (pct >= 100) throw new Error("out of range");',
            '<input id="pct" type="number" max="99.9" value="2">'
            '<input id="overheadRate" type="number" value="12">',
        )
        self.assertEqual(check_venture(directory), [])

    def test_a_venture_with_no_javascript_is_skipped(self):
        directory = Path(tempfile.mkdtemp())
        (directory / "index.html").write_text(
            '<input id="pct" type="number" value="2">', encoding="utf-8"
        )
        self.assertEqual(check_venture(directory), [])


class MainExitCodes(unittest.TestCase):
    """The exit code is what CI reads: 0 clean, 1 problems, 2 bad root."""

    def _run(self, argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            return main(argv), out.getvalue(), err.getvalue()

    def _tree(self, module: str, page: str) -> Path:
        root = Path(tempfile.mkdtemp())
        venture = root / "v"
        venture.mkdir()
        (venture / "calc.mjs").write_text(module, encoding="utf-8")
        (venture / "index.html").write_text(page, encoding="utf-8")
        return root

    def test_missing_root_exits_2(self):
        code, _, err = self._run(["check", str(Path(tempfile.mkdtemp()) / "nope")])
        self.assertEqual(code, 2)
        self.assertIn("does not exist", err)

    def test_problem_exits_1(self):
        root = self._tree(
            'if (pct < 0 || pct >= 100) throw new Error("x");',
            '<input id="pct" type="number" min="0">',
        )
        code, out, _ = self._run(["check", str(root)])
        self.assertEqual(code, 1)
        self.assertIn("pct", out)

    def test_clean_tree_exits_0(self):
        root = self._tree(
            'if (pct < 0 || pct >= 100) throw new Error("x");',
            '<input id="pct" type="number" min="0" max="99">',
        )
        self.assertEqual(self._run(["check", str(root)])[0], 0)

    def test_no_argument_defaults_to_ventures_in_cwd(self):
        cwd = Path.cwd()
        work = Path(tempfile.mkdtemp())
        (work / "ventures").mkdir()
        os.chdir(work)
        try:
            self.assertEqual(self._run(["check"])[0], 0)
        finally:
            os.chdir(cwd)


if __name__ == "__main__":
    unittest.main()


class PercentScaling(unittest.TestCase):
    """A percent field whose calculator divides by 100 before the guard."""

    def test_finds_scaled_module_variables_and_page_fields(self):
        src = 'const fee = num(o.feePct, "Fee") / 100;\nconst x = num("#margin") / 100;'
        self.assertEqual(percent_scaled(src), {"fee", "x", "margin"})

    def _venture(self, module: str, page: str) -> list[str]:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "engine.mjs").write_text(module)
            (root / "index.html").write_text(page)
            return check_venture(root)

    def test_percent_max_satisfies_a_fraction_guard(self):
        module = 'const fee = num(o.feePct) / 100;\nif (fee >= 1) throw new Error("x");'
        self.assertEqual(self._venture(module, '<input type="number" id="fee" max="99">'), [])

    def test_percent_max_at_the_limit_still_fails(self):
        module = 'const fee = num(o.feePct) / 100;\nif (fee >= 1) throw new Error("x");'
        self.assertEqual(
            len(self._venture(module, '<input type="number" id="fee" max="100">')), 1
        )
