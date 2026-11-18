import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_width_oos as W  # noqa: E402


class WidthOutOfSampleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.saved = W.configure()

    @classmethod
    def tearDownClass(cls):
        W.restore(cls.saved)

    def test_design_is_6zzzf_with_only_fixed_clamps(self):
        self.assertEqual(W.fy.CLIM_YEARS, tuple(range(2005, 2015)))
        self.assertEqual(W.YEARS, (2020, 2021, 2022, 2023, 2024, 2025))
        self.assertEqual(W.TAG_ORDER, ("C01", "C02", "C03", "C04", "C05", "C07", "C10"))
        self.assertEqual(W.oz.RULES[0], "AT_90")
        self.assertEqual(len(W.oz.RULES), 1 + 7 * (5 + 10 + 1))

    def test_fixed_half_width_ignores_the_ratios(self):
        for h in W.WIDTHS:
            self.assertEqual(W.oz.half_width(W.tag(h), (1.3, 0.7, 1.0), 3), h)

    def test_clamp_bounds_the_corrected_ratios(self):
        W.oz.load_2025()
        cor = W.oz.corrections("North-Sea", 2025, W.oz.ls.REAL)
        for h in W.WIDTHS:
            for x in cor[W.oz.rname(W.tag(h), (1, 2, 3))]:
                self.assertLessEqual(abs(x - 1), h + 1e-12)

    def test_best_breaks_ties_to_the_narrower_width(self):
        self.assertEqual(W.best({0.01: 5.0, 0.03: 7.0, 0.05: 7.0}), (0.03, 7.0))
        self.assertEqual(W.best({0.02: 9.0, 0.10: 1.0}), (0.02, 9.0))

    def test_checks_quote_6zzzf_results(self):
        txt = open(os.path.join(HERE, "..", "experiments", "results_old_clim_2025.txt")).read()
        self.assertIn("2025: AT_90 61.0  AP 61.4  AK 50.1  A1 47.9  C03 66.0  C15 47.8  HR 60.6", txt)
        self.assertIn("C03 k=5: all84  67.0 [67,67]", txt)


if __name__ == "__main__":
    unittest.main()
