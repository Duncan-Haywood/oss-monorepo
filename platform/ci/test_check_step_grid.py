import tempfile
import unittest
from pathlib import Path

from check_step_grid import check_input, check_tree


class CheckInput(unittest.TestCase):
    def test_flags_the_lattice_that_excludes_whole_numbers(self):
        # The `cam-reconciliation-check` shape: 0.01, 0.11, 0.21, ...
        problem = check_input({"type": "number", "min": "0.01", "step": "0.1"})
        self.assertIsNotNone(problem)
        self.assertIn('step="any"', problem)
        self.assertIn("0.01, 0.11, 0.21", problem)

    def test_flags_a_coarse_spinner_over_an_offset_floor(self):
        # `janitorial-bid-calculator`: min="1" step="50" -> 1, 51, 101, ...
        problem = check_input({"type": "number", "min": "1", "step": "50"})
        self.assertIsNotNone(problem)
        self.assertIn("1, 51, 101", problem)

    def test_a_min_that_is_a_multiple_of_step_is_fine(self):
        for minimum, step in [("0", "0.1"), ("0.01", "0.01"), ("1", "1"), ("0.5", "0.5"), ("100", "50")]:
            self.assertIsNone(
                check_input({"type": "number", "min": minimum, "step": step}),
                f'min="{minimum}" step="{step}" should be accepted',
            )

    def test_step_any_is_the_fix_and_is_never_flagged(self):
        self.assertIsNone(check_input({"type": "number", "min": "0.01", "step": "any"}))
        self.assertIsNone(check_input({"type": "number", "min": "0.01", "step": "ANY"}))

    def test_no_min_means_the_base_is_zero(self):
        # Without `min` the step base is 0, so every multiple of step lands.
        self.assertIsNone(check_input({"type": "number", "step": "0.1"}))

    def test_no_step_is_not_a_grid_problem(self):
        self.assertIsNone(check_input({"type": "number", "min": "0.01"}))

    def test_non_number_inputs_are_ignored(self):
        self.assertIsNone(check_input({"type": "text", "min": "0.01", "step": "0.1"}))
        self.assertIsNone(check_input({"type": "checkbox"}))

    def test_malformed_attributes_are_ignored_as_the_browser_does(self):
        for attrs in [
            {"type": "number", "min": "abc", "step": "0.1"},
            {"type": "number", "min": "0.01", "step": "oops"},
            {"type": "number", "min": "0.01", "step": "0"},
            {"type": "number", "min": "0.01", "step": "-1"},
        ]:
            self.assertIsNone(check_input(attrs), attrs)

    def test_decimal_arithmetic_not_float(self):
        # (0.3 % 0.1) is 0.09999999999999998 in binary floating point, which
        # would report a mismatch on a grid that is in fact exact.
        self.assertIsNone(check_input({"type": "number", "min": "0.3", "step": "0.1"}))


class CheckTree(unittest.TestCase):
    def _tree(self, markup: str) -> list[str]:
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "index.html").write_text(markup, encoding="utf-8")
            return check_tree(Path(tmp))

    def test_flags_an_input_outside_a_form_too(self):
        # The deliberate difference from `check_form_defaults.py`. Nothing
        # submits, but the field is permanently checkValidity()-false, which
        # biases invalid.mjs's "which field is this error about?" ranking.
        problems = self._tree('<input id="rate" type="number" min="1" step="50">')
        self.assertEqual(len(problems), 1)
        self.assertIn("rate", problems[0])

    def test_names_the_field_and_the_page(self):
        problems = self._tree('<form><input id="target" type="number" min="0.01" step="0.1"></form>')
        self.assertEqual(len(problems), 1)
        self.assertIn("index.html", problems[0])
        self.assertIn("target", problems[0])

    def test_a_clean_page_reports_nothing(self):
        problems = self._tree(
            '<input id="a" type="number" min="0" step="0.01" value="12">'
            '<input id="b" type="number" min="0.01" step="any">'
            '<input id="c" type="text">'
        )
        self.assertEqual(problems, [])


class Repository(unittest.TestCase):
    def test_the_shipped_ventures_are_clean(self):
        # The guard is only worth anything if it holds against the tree it was
        # written for. 58 inputs across 33 files failed this on 2026-09-06.
        root = Path(__file__).resolve().parents[2] / "ventures"
        if not root.exists():  # pragma: no cover - checkout without ventures/
            self.skipTest("ventures/ is not present")
        self.assertEqual(check_tree(root), [])


if __name__ == "__main__":
    unittest.main()
