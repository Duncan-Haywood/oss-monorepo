import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_fresh_years as fy  # noqa: E402
import run_harmonic_season as hs  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_shrunk_season as ss  # noqa: E402


class HarmonicSeasonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_fit_recovers_exact_harmonic(self):
        r = [1.0 + 0.05 * math.cos(t) - 0.02 * math.sin(t) for t in hs.THETA]
        a0, a1, b1 = hs.fit_harmonic(r)
        self.assertAlmostEqual(a0, 1.0, places=12)
        self.assertAlmostEqual(a1, 0.05, places=12)
        self.assertAlmostEqual(b1, -0.02, places=12)

    def test_shrunk_lies_between_harmonic_and_raw(self):
        for p in ("A+60", "A+0", "Gulf-of-Alaska"):
            yrs = ly.learn_years("E", 1)
            cm, g, w, tau, _ = hs.harmonic(p, yrs, ls.REAL)
            r = ss.shrunk(p, yrs, ls.REAL)[1]
            for c, gc, x, wi in zip(cm, g, r, w):
                self.assertTrue(0.0 <= wi <= 1.0)
                lo, hi = sorted((gc, hs.clamp(x)))
                self.assertTrue(lo - 1e-12 <= c <= hi + 1e-12)

    def test_tau_zero_gives_harmonic(self):
        for p in ("A+60", "A+0"):
            cm, g, w, tau, _ = hs.harmonic(p, ly.learn_years("L", 1), ls.REAL)
            if tau == 0.0:
                self.assertEqual(cm, g)

    def test_lc_and_ls_rows_reproduce_earlier_milestones(self):
        key = (5000.0, "A+60", 2006, 1.0, 0.0, 0)
        out = hs.score(key)[1]
        ref = ss.score(key)[1]
        for g in ("AT_90", "LC_1", "LC_3", "LS_1", "LS_5", hs.BASE):
            self.assertAlmostEqual(out[g][0], ref[g][0], places=9)
            self.assertAlmostEqual(out[g][1], ref[g][1], places=9)


if __name__ == "__main__":
    unittest.main()
