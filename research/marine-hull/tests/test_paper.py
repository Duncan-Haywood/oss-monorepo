import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "paper"))

import check_numbers  # noqa: E402
import make_figures  # noqa: E402


class PaperTests(unittest.TestCase):
    def test_every_quoted_number_is_in_its_results_file(self):
        self.assertEqual(check_numbers.check(), [])

    def test_check_catches_a_changed_number(self):
        bad = check_numbers.check([("results_lowk.txt", "catamaran out-ranges monohull in 1 (")])
        self.assertEqual(len(bad), 1)

    def test_figure_parses_all_ten_bars(self):
        with open(make_figures.RESULTS) as f:
            rows = make_figures.parse(f.read())
        self.assertEqual(len(rows), 10)
        self.assertEqual(rows[(5, "Equator-Pacific")], (133.4, 123.9, 141.1))
        for med, lo, hi in rows.values():
            self.assertLess(lo, med)
            self.assertLess(med, hi)

    def test_tikz_has_one_bar_per_row(self):
        with open(make_figures.RESULTS) as f:
            rows = make_figures.parse(f.read())
        self.assertEqual(make_figures.tikz(rows).count("rectangle") - 2, 10)


if __name__ == "__main__":
    unittest.main()
