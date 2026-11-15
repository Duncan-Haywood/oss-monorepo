import os
import statistics as st
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_amp_shrink_season as am  # noqa: E402
import run_blend_transfer as bt  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_hier_season as hs  # noqa: E402
import run_lat_prior_season as lp  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_learned_season as ls  # noqa: E402


class HierSeasonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_alignment_is_a_six_month_shift(self):
        self.assertEqual(hs.sign("P-50"), -1.0)
        self.assertEqual(hs.sign("A+0"), 1.0)
        self.assertEqual(hs.sign("North-Sea"), 1.0)

    def test_pools(self):
        self.assertEqual(len(hs.pool_of("A+60", "HB")), 9)
        self.assertEqual(len(hs.pool_of("A+60", "HF")), 30)
        self.assertEqual(set(hs.pool_of("P-20", "HR")), {p for p in bt.PTS if lp.band(p) == "low"})

    def test_prior_mean_leaves_point_out(self):
        yrs = ly.learn_years("E", 1)
        p = "North-Sea"
        pool = hs.pool_of(p, "HB")
        xy, _ = hs.pool_stats(pool, yrs, ls.REAL, True)
        others = [q for q in pool if q != p]
        mx = st.fmean(hs.sign(q) * am.fit(q, yrs, ls.REAL)[0][1] for q in others)
        self.assertAlmostEqual(hs.loo_mean(xy, p)[0], mx, places=15)
        self.assertNotIn(p, others)

    def test_shrinks_between_prior_mean_and_own_fit(self):
        yrs = ly.learn_years("L", 1)
        for p in ("A+60", "P-50", "A+0"):
            for tag in ("HB", "HF", "HR"):
                (a0, a1, b1), w, (mx, my) = hs.hier(p, yrs, ls.REAL, tag)
                (r0, ra, rb), _ = am.fit(p, yrs, ls.REAL)
                s = hs.sign(p) if tag != "HR" else 1.0
                self.assertEqual(a0, r0)
                self.assertTrue(0.0 <= w < 1.0)
                self.assertAlmostEqual(s * a1, mx + w * (s * ra - mx), places=15)
                self.assertAlmostEqual(s * b1, my + w * (s * rb - my), places=15)

    def test_tau_is_between_variance_net_of_noise(self):
        yrs = ly.learn_years("E", 2)
        pool = hs.pool_of("A+0", "HB")
        xy, t2 = hs.pool_stats(pool, yrs, ls.REAL, True)
        n = len(pool)
        xs = [v[0] for v in xy.values()]
        ys = [v[1] for v in xy.values()]
        ref = (st.variance(xs) + st.variance(ys)) / 2.0 - st.fmean(v[2] for v in xy.values())
        self.assertAlmostEqual(t2, max(0.0, ref), places=14)
        self.assertEqual(n, 11)

    def test_lb_and_at90_rows_reproduce_6zzf(self):
        key = (5000.0, "P-30", 2006, 1.0, 0.0, 0)
        out = hs.score(key)[1]
        ref = lp.score(key)[1]
        for g in ("AT_90", "LB_1", "LB_5", hs.BASE):
            self.assertAlmostEqual(out[g][0], ref[g][0], places=9)
            self.assertAlmostEqual(out[g][1], ref[g][1], places=9)


if __name__ == "__main__":
    unittest.main()
