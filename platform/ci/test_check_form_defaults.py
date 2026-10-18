#!/usr/bin/env python3
"""Unit tests for check_form_defaults.

The two cases that matter most are the two real breakages this check was
written for, and the much larger set of inputs that look similar and are fine.
A check that cried wolf on those would have been turned off within a week.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from check_form_defaults import check_input, check_tree, main


def attrs(**kwargs) -> dict[str, str]:
    return {k.replace("_", "-"): str(v) for k, v in kwargs.items()}


class CheckInput(unittest.TestCase):
    def test_the_cam_reconciliation_breakage(self):
        problem = check_input(attrs(type="number", min="0.01", step="1", value="10000"))
        self.assertIsNotNone(problem)
        self.assertIn("9999.01", problem)

    def test_the_invoice_factoring_breakage(self):
        problem = check_input(attrs(type="number", min="0.01", max="100", step="0.1", value="90"))
        self.assertIsNotNone(problem)
        self.assertIn("89.91", problem)

    def test_step_any_is_always_reachable(self):
        self.assertIsNone(check_input(attrs(type="number", min="0.01", step="any", value="10000")))

    def test_whole_steps_from_a_zero_base_are_fine(self):
        self.assertIsNone(check_input(attrs(type="number", min="0", step="0.1", value="24")))

    def test_a_decimal_default_that_lands_on_its_step(self):
        # 0.01 base, 0.01 step: the common money field. Binary float would
        # misjudge several of these; Decimal does not.
        self.assertIsNone(check_input(attrs(type="number", min="0.01", step="0.01", value="1200")))
        self.assertIsNone(check_input(attrs(type="number", min="0.01", step="0.1", value="90.01")))

    def test_missing_step_defaults_to_one(self):
        self.assertIsNone(check_input(attrs(type="number", min="0", value="7")))
        self.assertIsNotNone(check_input(attrs(type="number", min="0", value="7.5")))

    def test_below_min_and_above_max(self):
        self.assertIn("below min", check_input(attrs(type="number", min="1", step="1", value="0")))
        self.assertIn("above max", check_input(attrs(type="number", max="10", step="1", value="11")))

    def test_empty_value_is_awaiting_the_visitor(self):
        self.assertIsNone(check_input(attrs(type="number", min="0.01", step="1", value="")))
        self.assertIsNone(check_input({"type": "number", "min": "0.01", "step": "1"}))

    def test_script_written_values_are_not_markup(self):
        self.assertIsNone(check_input(attrs(type="number", min="1", step="10", value="${row[1]}")))

    def test_non_number_inputs_are_ignored(self):
        self.assertIsNone(check_input(attrs(type="text", value="anything")))
        self.assertIsNone(check_input(attrs(type="checkbox", value="on")))


    def test_a_malformed_or_non_positive_step_is_ignored(self):
        # The browser falls back to its default step, so there is nothing to flag.
        self.assertIsNone(check_input(attrs(type="number", min="0", step="abc", value="5")))
        self.assertIsNone(check_input(attrs(type="number", min="0", step="0", value="5")))
        self.assertIsNone(check_input(attrs(type="number", min="0", step="-1", value="5")))


class CheckTree(unittest.TestCase):
    def _tree(self, markup: str) -> list[str]:
        with tempfile.TemporaryDirectory() as tmp:
            page = Path(tmp) / "index.html"
            page.write_text(markup, encoding="utf-8")
            return check_tree(Path(tmp))

    def test_flags_a_bad_default_inside_a_form(self):
        problems = self._tree(
            '<form><input id="area" type="number" min="0.01" step="1" value="10000"></form>'
        )
        self.assertEqual(len(problems), 1)
        self.assertIn("area", problems[0])

    def test_ignores_the_same_input_outside_a_form(self):
        # Nothing submits, so the browser never blocks anything.
        problems = self._tree('<input id="area" type="number" min="0.01" step="1" value="10000">')
        self.assertEqual(problems, [])

    def test_flags_a_numeric_placeholder_the_field_would_refuse(self):
        # The `cam-reconciliation-check` shape: no `value`, but the page names
        # 95 in the placeholder and every whole number is off the step grid.
        problems = self._tree(
            '<form><input id="target" type="number" min="0.01" max="100" step="0.1" placeholder="95"></form>'
        )
        self.assertEqual(len(problems), 1)
        self.assertIn("target", problems[0])
        self.assertIn('placeholder="95"', problems[0])

    def test_ignores_a_prose_placeholder(self):
        # "leave blank for band" is good copy, not a suggested figure. Three of
        # these ship today; flagging them would make the check noise.
        problems = self._tree(
            '<form><input id="fee" type="number" min="0.01" step="0.1" '
            'placeholder="leave blank for band"></form>'
        )
        self.assertEqual(problems, [])

    def test_a_numeric_placeholder_on_a_reachable_grid_is_fine(self):
        problems = self._tree(
            '<form><input id="target" type="number" min="0.01" max="100" step="any" placeholder="95"></form>'
        )
        self.assertEqual(problems, [])

    def test_value_still_wins_over_placeholder(self):
        # A field carrying both is judged on what it actually ships filled in.
        problems = self._tree(
            '<form><input id="area" type="number" min="0" step="1" value="500" placeholder="0.5"></form>'
        )
        self.assertEqual(problems, [])

    def test_a_bare_empty_field_is_still_left_alone(self):
        problems = self._tree('<form><input id="area" type="number" min="0.01" step="0.1"></form>')
        self.assertEqual(problems, [])

    def test_clean_page_reports_nothing(self):
        problems = self._tree(
            '<form><input id="a" type="number" min="0" step="0.01" value="120000">'
            '<input id="b" type="number" min="0.01" step="any" value="10000"></form>'
        )
        self.assertEqual(problems, [])


    def test_names_the_field_by_id_then_name_then_a_placeholder_label(self):
        bad = 'type="number" min="0.01" step="1" value="10000"'
        by_id = self._tree(f'<form><input id="area" name="a" {bad}></form>')[0]
        by_name = self._tree(f'<form><input name="area_field" {bad}></form>')[0]
        unnamed = self._tree(f"<form><input {bad}></form>")[0]
        self.assertIn(": area: ", by_id)
        self.assertIn(": area_field: ", by_name)
        self.assertIn("(unnamed input)", unnamed)


class Main(unittest.TestCase):
    def test_no_argument_means_the_ventures_tree(self):
        # With only the program name in argv the default root is used; it is
        # "ventures", which does not exist under a temp cwd, so exit code 2.
        import os

        with tempfile.TemporaryDirectory() as tmp:
            old = os.getcwd()
            os.chdir(tmp)
            try:
                self.assertEqual(main(["check_form_defaults.py"]), 2)
            finally:
                os.chdir(old)


if __name__ == "__main__":
    unittest.main()
