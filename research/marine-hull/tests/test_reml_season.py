import os
import random
import statistics as st
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_amp_shrink_season as am  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_hier_season as hs  # noqa: E402
import run_lat_prior_season as lp  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_reml_season as rm  # noqa: E402


class RemlSeasonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_reml_matches_closed_form_for_equal_noise(self):
        # With equal V, REML tau^2 = (sample variance of each component, averaged) - V.
        rng = random.Random(3)
        zs = [(rng.gauss(0.1, 0.2), rng.gauss(-0.05, 0.2)) for _ in range(9)]
        V = 0.004
        ref = (st.variance([z[0] for z in zs]) + st.variance([z[1] for z in zs])) / 2.0 - V
        self.assertAlmostEqual(rm.reml_tau2(zs, [V] * 9), ref, places=8)

    def test_reml_is_zero_when_spread_is_below_noise(self):
        zs = [(0.001 * i, -0.001 * i) for i in range(5)]
        # The golden section on [0, 1e-7] returns the boundary to within ~1e-24 (w ~ 1e-24 / V).
        self.assertLess(rm.reml_tau2(zs, [1.0] * 5), 1e-15)

    def test_weighted_mean_leaves_point_out(self):
        yrs = ly.learn_years("E", 1)
        p = "North-Sea"
        xy, t2 = rm.reml_stats(hs.pool_of(p, "HB"), yrs, ls.REAL, True)
        others = [q for q in xy if q != p]
        u = {q: 1.0 / (t2 + xy[q][2]) for q in others}
        ref = sum(u[q] * xy[q][0] for q in others) / sum(u.values())
        self.assertAlmostEqual(rm.wmean_loo(xy, p, t2)[0], ref, places=14)

    def test_hx_is_unshrunk_only_in_high_band(self):
        yrs = ly.learn_years("L", 1)
        for p in ("A+60", "P-50", "A+0", "P-30"):
            cor = rm.corrections(p, yrs, ls.REAL)
            if lp.band(p) == "high":
                (a0, a1, b1), _ = am.fit(p, yrs, ls.REAL)
                self.assertEqual(cor["HX"], (am.curve(a0, a1, b1, 1.0), 1.0))
            else:
                self.assertEqual(cor["HX"], cor["HR"])

    def test_hr_and_at90_rows_reproduce_6zzg(self):
        key = (5000.0, "P-30", 2006, 1.0, 0.0, 0)
        out = rm.score(key)[1]
        ref = hs.score(key)[1]
        for g in ("AT_90", "HR_1", "HR_5", rm.BASE):
            self.assertAlmostEqual(out[g][0], ref[g][0], places=9)
            self.assertAlmostEqual(out[g][1], ref[g][1], places=9)


if __name__ == "__main__":
    unittest.main()
