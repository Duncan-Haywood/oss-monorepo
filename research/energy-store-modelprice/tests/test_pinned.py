"""Pins section A of experiments/results.txt so the leave-one-year-out holdout
and the flat merit price cannot change silently (2026-11-13 quality audit:
both mutants survived the old tests). unittest so `unittest discover` finds it."""
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from energy_store_modelprice import price_sources


class PinnedSectionA(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = price_sources(2015)

    def test_series_means_2015(self):
        mean = lambda xs: sum(xs) / len(xs)
        # results.txt section A, 2015, first column (mean of the year)
        self.assertAlmostEqual(mean(self.s["real"]), 0.0319, delta=6e-5)
        self.assertAlmostEqual(mean(self.s["resid"]), 0.0375, delta=6e-5)
        self.assertAlmostEqual(mean(self.s["resid+"]), 0.0319, delta=6e-5)
        self.assertAlmostEqual(mean(self.s["merit"]), 0.0546, delta=1e-9)


if __name__ == "__main__":
    unittest.main()
