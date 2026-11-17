import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_adaptive_clamp as A  # noqa: E402
import run_clamp_sweep as C  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_level_season as L  # noqa: E402


class AdaptiveClampTests(unittest.TestCase):
    def setUp(self):
        fy.load()
        self.p = "P+60"

    def test_c05_and_c15_are_6zzx_rules(self):
        a = A.corrections(self.p, "E", L.REAL)
        c = C.corrections(self.p, "E", L.REAL)
        for g in L.LAGS:
            self.assertEqual(a[f"C05_{g}"], c[f"C05_{g}"])
            self.assertEqual(a[f"C15_{g}"], c[f"C15_{g}"])

    def test_half_width_rules(self):
        r = (1.0,) * 11 + (1.24,)            # spread 0.02
        self.assertEqual(A.half_width("AS", r, 1.0), 0.05)
        self.assertAlmostEqual(A.half_width("AP", r, 1.0), 0.02)
        wide = (1.12,) * 6 + (0.88,) * 6     # spread 0.12
        self.assertEqual(A.half_width("AS", wide, 1.0), 0.30)
        self.assertAlmostEqual(A.half_width("AP", wide, 1.0), 0.12)
        self.assertEqual(A.half_width("AP", (2.0,) * 12, 1.0), 0.40)
        self.assertEqual(A.half_width("AP", (1.0,) * 12, 1.0), 0.02)
        self.assertEqual(A.half_width("AL", r, 1.049), 0.05)
        self.assertEqual(A.half_width("AL", r, 0.94), 0.30)

    def test_adaptive_corrections_match_their_chosen_clamp(self):
        a = A.corrections(self.p, "L", L.REAL)
        for g in L.LAGS:
            r, level = L.raw(self.p, A.su.years_of("L", (g,)), L.REAL)
            for t in A.ADAPT:
                h = A.half_width(t, r, level)
                self.assertEqual(a[f"{t}_{g}"], tuple(L.clamp(x, (1 - h, 1 + h)) for x in r))

    def test_wide_shares_are_bounded(self):
        w = A.wide((self.p,), (L.REAL,))
        self.assertTrue(0 <= w["AS"] <= 1 and 0 <= w["AL"] <= 1)
        self.assertTrue(0.02 <= w["AP"] <= 0.40)


if __name__ == "__main__":
    unittest.main()
