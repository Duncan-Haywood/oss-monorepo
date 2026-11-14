import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_bias_sweep as bs  # noqa: E402
import run_reserve_curve as rc  # noqa: E402


class BiasSweepTests(unittest.TestCase):
    def test_halves_are_disjoint_and_cover_the_decade(self):
        self.assertEqual(set(bs.EARLY) & set(bs.LATE), set())
        self.assertEqual(sorted(bs.EARLY + bs.LATE), sorted(bs.bt.YEARS))
        self.assertEqual(bs.HALVES["T"], bs.LATE)
        self.assertEqual(bs.HALVES["R"], bs.EARLY)

    def test_cross_climatology_uses_the_other_half_only(self):
        for yr, src in ((2017, bs.LATE), (2022, bs.EARLY)):
            a = bs._clim("A+40", yr)
            b = tuple(rc.climatology_wh("A+40", yr, years=src))
            self.assertEqual(a, b)
            self.assertNotIn(yr, src)

    def test_rules_are_on_the_grid_and_pss_is_shorter(self):
        self.assertEqual(set(bs.PS), set(bs.PACKS))
        self.assertEqual(set(bs.PSS), set(bs.PACKS))
        for c in bs.PACKS:
            self.assertIn(bs.PS[c], bs.GRID)
            self.assertIn(bs.PSS[c], bs.GRID)
            self.assertEqual(bs.PS[c][0], bs.PSS[c][0])
            self.assertLess(bs.PSS[c][1], bs.PS[c][1])
        self.assertIn(1.0, bs.SCALES)

    def test_scale_one_matches_unbiased_run(self):
        # at s = 1 the score equals a direct run with the unscaled cross climatology
        key, out, _ = bs.score((5000.0, "A+40", 2016, 1.0))
        hc = list(bs._clim("A+40", 2016))
        T = bs.pt.target(hc, 5000.0, bs.HOTEL)
        h = [bs.yp.harvest_wh(k) for k in rc.year_sun("A+40", 2016)]
        idle = bs.yp.idle(rc.year_sun("A+40", 2016), 5000.0, bs.HOTEL)[1]
        km, dark, _ = bs.bt.run(h, T, hc, 0.5, 30, 5000.0, bs.HOTEL)
        self.assertAlmostEqual(out[(0.5, 30)][0], km, places=6)
        self.assertAlmostEqual(out[(0.5, 30)][1], dark - idle, places=6)

    def test_pure_trailing_mean_estimate_ignores_scale_except_via_target(self):
        # W(1) uses no climatology in its estimate; with a scaled target it may differ, but its harvest energy may not
        _, _, e1 = bs.score((5000.0, "P+0", 2016, 0.97))
        _, _, e2 = bs.score((5000.0, "P+0", 2016, 1.03))
        self.assertEqual(e1, e2)

    def test_longest_safe(self):
        t = {bs.BASE: (100.0, 10.0, 0)}
        for g in bs.GRID:
            t[g] = (90.0, 5.0, 0)
        self.assertEqual(bs.longest_safe(t), (0, None))
        t[(0.25, 20)] = (110.0, 9.0, 0)
        t[(0.5, 20)] = (120.0, 10.0, 0)
        self.assertEqual(bs.longest_safe(t), (20, 0.5))


if __name__ == "__main__":
    unittest.main()
