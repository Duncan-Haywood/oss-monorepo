import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_fresh_years as fy  # noqa: E402
import run_lag3_diagnosis as dg  # noqa: E402
import run_summer_tilt as tl  # noqa: E402


class SummerTiltTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_components_round_trip(self):
        c = tuple(0.9 + 0.013 * i for i in range(12))
        for ms in ((6, 7, 8), (12, 1, 2)):
            back = tl.rebuild(c, ms, *tl.components(c, ms))
            for a, b in zip(back, c):
                self.assertAlmostEqual(a, b, places=12)

    def test_tilt_shift_holds_level_and_curvature(self):
        c = tuple(1.0 + 0.01 * ((i * 7) % 5) for i in range(12))
        ms = (6, 7, 8)
        L, T, K = tl.components(c, ms)
        s = tl.rebuild(c, ms, L, T + 0.03, K)
        L2, T2, K2 = tl.components(s, ms)
        self.assertAlmostEqual(L2, L)
        self.assertAlmostEqual(K2, K)
        self.assertAlmostEqual(T2, T + 0.03)
        self.assertAlmostEqual(s[6], c[6])  # mid-summer untouched by a pure tilt
        self.assertEqual([i for i in range(12) if abs(s[i] - c[i]) > 1e-15], [5, 7])

    def test_southern_summer_order(self):
        self.assertEqual(tl.summer_order("P-60"), (12, 1, 2))
        self.assertEqual(tl.summer_order("P+60"), (6, 7, 8))
        self.assertEqual(set(tl.summer_order("P-60")), set(dg.season_months("P-60", "summer")))

    def test_full_mix_is_6zzl_summer_repair(self):
        c = tl.corrections("A+60", "E", tl.REAL)
        ref = dg.corrections("A+60", "E", tl.REAL)
        for a, b in zip(c["R3_S"], ref["R3_summer"]):
            self.assertAlmostEqual(a, b, places=12)
        self.assertEqual(c["LC_3"], ref["LC_3"])
        self.assertEqual(c["OC"], ref["OC"])


if __name__ == "__main__":
    unittest.main()
