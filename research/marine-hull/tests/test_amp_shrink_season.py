import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_amp_shrink_season as am  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_harmonic_season as hs  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_learned_season as ls  # noqa: E402


class AmpShrinkSeasonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_weight_limits(self):
        self.assertEqual(am.weight(0.0, 0.0, 1e-4), 0.0)
        self.assertGreater(am.weight(0.5, 0.0, 1e-6), 0.999)
        # (a1^2 + b1^2) / 2 - V = 0.0004 - 0.0002: w = 0.0002 / 0.0004
        self.assertAlmostEqual(am.weight(0.02, 0.02, 2e-4), 0.5, places=12)
        self.assertEqual(am.weight(0.1, 0.1, 1e-4, tau2=-1.0), 0.0)

    def test_variance_matches_component_formula(self):
        (_, _, _), V = am.fit("A+60", ly.learn_years("E", 1), ls.REAL)
        se = __import__("run_shrunk_season").shrunk("A+60", ly.learn_years("E", 1), ls.REAL)[2]
        va = sum(s * s * math.cos(t) ** 2 for s, t in zip(se, hs.THETA)) / 36
        vb = sum(s * s * math.sin(t) ** 2 for s, t in zip(se, hs.THETA)) / 36
        self.assertAlmostEqual(V, (va + vb) / 2, places=15)

    def test_lhf_matches_6zzd_harmonic(self):
        for p in ("A+60", "A+0", "Gulf-of-Alaska"):
            for hn in ("E", "L"):
                yrs = ly.learn_years(hn, 1)
                self.assertEqual(am.corrections(p, yrs, ls.REAL)["LHF"][0], hs.harmonic(p, yrs, ls.REAL)[1])

    def test_shrunk_curve_between_mean_and_harmonic(self):
        for p in ("A+60", "P-30", "A+0"):
            yrs = ly.learn_years("L", 1)
            (a0, _, _), _ = am.fit(p, yrs, ls.REAL)
            cor = am.corrections(p, yrs, ls.REAL)
            for tag in ("LA", "LAP"):
                w = cor[tag][1]
                self.assertTrue(0.0 <= w <= 1.0)
                for c, g in zip(cor[tag][0], cor["LHF"][0]):
                    lo, hi = sorted((hs.clamp(a0), g))
                    self.assertTrue(lo - 1e-12 <= c <= hi + 1e-12)

    def test_at90_and_lhf_rows_reproduce_6zzd(self):
        key = (5000.0, "A+60", 2006, 1.0, 0.0, 0)
        out = am.score(key)[1]
        ref = hs.score(key)[1]
        for g in ("AT_90", "LHF_1", "LHF_5", am.BASE):
            self.assertAlmostEqual(out[g][0], ref[g][0], places=9)
            self.assertAlmostEqual(out[g][1], ref[g][1], places=9)


if __name__ == "__main__":
    unittest.main()
