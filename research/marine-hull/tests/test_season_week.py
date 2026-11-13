import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_hotel_gate as hg  # noqa: E402
import run_season_week as sw  # noqa: E402

POINT, YEAR = "P+50", 2022


class SeasonWeekTests(unittest.TestCase):
    def test_k_column_and_base_reproduce_6zr(self):
        key = (2500.0, 50.0, POINT, YEAR)
        _, a = sw.score(key)
        _, b = hg.score(key)
        for tau in sw.TAUS:
            for i in (0, 1):
                self.assertAlmostEqual(a[("K", tau, 0.0)][i], b[("K", tau, 0.0)][i], places=6)
        for i in (0, 1):
            self.assertAlmostEqual(a[sw.BASE][i], b[hg.BASE][i], places=6)

    def test_estimators(self):
        h = [480.0] * 7 + [0.0]
        hc = [240.0] * 8
        self.assertAlmostEqual(sw.estimate("K", h, hc, 7, 50.0), 10.0)
        self.assertAlmostEqual(sw.estimate("L", h, hc, 7, 50.0), 20.0)
        self.assertAlmostEqual(sw.estimate("M", h, hc, 7, 50.0), 20.0)
        self.assertAlmostEqual(sw.estimate("B25", h, hc, 7, 50.0), 12.5)
        self.assertAlmostEqual(sw.estimate("B75", h, hc, 7, 50.0), 17.5)
        self.assertAlmostEqual(sw.estimate("KA7", h, hc, 7, 50.0), 15.0)  # anomaly 2 clipped to 1.5
        self.assertAlmostEqual(sw.estimate("KA7", h, hc, 0, 50.0), 10.0)  # no history: plain climatology
        self.assertAlmostEqual(sw.estimate("M", h, hc, 0, 50.0), 50.0)  # L falls back to the hotel load

    def test_selection_rule(self):
        tot = {g: (100.0, 50.0, 0) for g in sw.GRID}
        tot[sw.BASE] = (100.0, 10.0, 0)
        tot[("M", 20, 0.0)] = (108.0, 9.0, 0)
        tot[("B50", 10, 0.0)] = (115.0, 10.5, 0)
        self.assertEqual(sw.select(tot), ("M", 20, 0.0))


if __name__ == "__main__":
    unittest.main()
