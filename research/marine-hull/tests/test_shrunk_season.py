import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_fresh_years as fy  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_shrunk_season as ss  # noqa: E402


class ShrunkSeasonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_raw_ratio_matches_6zzb_before_clamp(self):
        for k in (1, 5):
            yrs = ly.learn_years("L", k)
            raw = ss.shrunk("A+0", yrs, ls.REAL)[1]
            clamped = ly.learned("A+0", yrs, ls.REAL)[0]
            for r, c in zip(raw, clamped):
                self.assertAlmostEqual(min(ls.CLAMP[1], max(ls.CLAMP[0], r)), c, places=12)

    def test_shrunk_lies_between_mean_and_raw(self):
        for p in ("A+60", "A+0", "Gulf-of-Alaska"):
            cm, r, se, w, tau, cbar = ss.shrunk(p, ly.learn_years("E", 1), ls.REAL)
            for c, x, wi in zip(cm, r, w):
                self.assertTrue(0.0 <= wi <= 1.0)
                lo, hi = sorted((cbar, x))
                lo, hi = max(lo, ls.CLAMP[0]), min(hi, ls.CLAMP[1])
                self.assertTrue(lo - 1e-12 <= c <= hi + 1e-12)

    def test_more_years_less_noise(self):
        a = ss.shrunk("A+60", ly.learn_years("L", 1), ls.REAL)[2]
        b = ss.shrunk("A+60", ly.learn_years("L", 5), ls.REAL)[2]
        self.assertLess(sum(b), sum(a))

    def test_lc_rows_reproduce_6zzb(self):
        key = (5000.0, "A+60", 2006, 1.0, 0.0, 0)
        out = ss.score(key)[1]
        ref = ly.score(key)[1]
        for g in ("AT_90", "LC_1", "LC_3", ss.BASE):
            self.assertAlmostEqual(out[g][0], ref[g][0], places=9)
            self.assertAlmostEqual(out[g][1], ref[g][1], places=9)


if __name__ == "__main__":
    unittest.main()
