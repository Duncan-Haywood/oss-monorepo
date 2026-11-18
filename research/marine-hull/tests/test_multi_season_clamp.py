import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_adaptive_clamp as A  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_level_season as L  # noqa: E402
import run_multi_season_clamp as M  # noqa: E402
import run_reml_season as rm  # noqa: E402


class MultiSeasonClampTests(unittest.TestCase):
    def setUp(self):
        fy.load()
        self.p = "P+60"

    def test_sets_and_rules(self):
        self.assertEqual([len(M.SETS[k]) for k in M.KS], [5, 10, 10])
        self.assertIn("HR_123", M.rules("nasa"))
        self.assertNotIn("HR_123", M.rules("cross"))
        self.assertNotIn("C03_1", M.rules("nasa"))  # k = 1 fixed clamps are 6zzy's, not rerun

    def test_k1_ap_is_6zzy_rule(self):
        a = M.corrections(self.p, "E", L.REAL)
        b = A.corrections(self.p, "E", L.REAL)
        for g in L.LAGS:
            self.assertEqual(a[f"AP_{g}"], b[f"AP_{g}"])

    def test_c15_on_a_set_is_lc_and_hr_is_rm(self):
        c = M.corrections(self.p, "L", L.REAL, with_hr=True)
        for s in ((1, 2), (2, 4, 5)):
            yrs = M.su.years_of("L", s)
            self.assertEqual(c[M.rname("C15", s)], tuple(ly.learned(self.p, yrs, L.REAL)[0]))
            self.assertEqual(c[M.rname("HR", s)], rm.corrections(self.p, yrs, L.REAL)["HR"][0])

    def test_af_floor(self):
        r = (1.0,) * 11 + (1.24,)  # spread 0.02
        self.assertAlmostEqual(M.half_width("AF", r, 1.0), 0.02)
        self.assertAlmostEqual(M.half_width("AF", r, 1.049), 0.02)
        self.assertAlmostEqual(M.half_width("AF", r, 0.94), 0.10)
        wide = (1.2,) * 12  # spread 0.20, level off
        self.assertAlmostEqual(M.half_width("AF", wide, 1.2), 0.20)
        self.assertEqual(M.half_width("C03", r, 1.0), 0.03)


if __name__ == "__main__":
    unittest.main()
