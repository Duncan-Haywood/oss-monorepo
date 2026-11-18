import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "paper"))

import make_figures  # noqa: E402
import run_glider_hotel_curve as gh  # noqa: E402


class GliderHotelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(make_figures.GH_RESULTS) as f:
            cls.rows, cls.wide, cls.band, cls.be = make_figures.parse_hotel_curve(f.read())
        cls.cases = gh.cases()

    def test_rerun_matches_committed_rows(self):
        got = gh.curve(self.cases, [1.0, 5.0, 20.0])
        ref = {round(r[0], 4): r for r in self.rows}
        for x, sh, a, b, c in got:
            self.assertAlmostEqual(sh, ref[round(x, 4)][1], places=4)
            self.assertAlmostEqual(b, ref[round(x, 4)][3], places=4)

    def test_share_matches_milestone_4b_points(self):
        ref = {round(r[0], 4): r[1] for r in self.rows}
        self.assertEqual(ref[1.0], 0.0)
        self.assertAlmostEqual(ref[5.0], 1253 / 2430, places=4)
        self.assertAlmostEqual(ref[20.0], 2427 / 2430, places=4)

    def test_share_and_median_monotone(self):
        for r0, r1 in zip(self.rows, self.rows[1:]):
            self.assertGreaterEqual(r1[1], r0[1])
            self.assertGreaterEqual(r1[3], r0[3])

    def test_uncapped_slope_near_two_thirds(self):
        med = {round(r[0], 4): r[3] for r in self.wide}
        slope = math.log10(med[200.0] / med[20.0])
        self.assertTrue(0.60 <= slope <= 0.70, slope)

    def test_wide_grid_never_worse_for_auv(self):
        for r, w in zip(self.rows, self.wide):
            self.assertLessEqual(w[3], r[3] + 1e-9)

    def test_figure_has_band_and_breakeven(self):
        tex = make_figures.tikz_glider_hotel(self.rows, self.wide, self.band, self.be)
        self.assertIn("REMUS-100", tex)
        self.assertAlmostEqual(self.be, 4.87, places=2)


if __name__ == "__main__":
    unittest.main()
