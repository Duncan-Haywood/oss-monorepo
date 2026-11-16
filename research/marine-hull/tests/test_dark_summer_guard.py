import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_dark_summer_guard as dsg  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_lag3_diagnosis as dg  # noqa: E402
import run_summer_tilt as tl  # noqa: E402


class DarkSummerGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_guards_touch_only_named_months(self):
        c = tuple(0.9 + 0.02 * i for i in range(12))  # 0.90 .. 1.12
        g = dsg.guard(c, (1, 2, 12), "max")
        self.assertEqual(g[0], 1.0)
        self.assertEqual(g[1], 1.0)
        self.assertEqual(g[11], c[11])  # already above 1
        self.assertEqual(g[2:11], c[2:11])
        h = dsg.guard(c, (1,), "half")
        self.assertAlmostEqual(h[0], 0.95)
        self.assertEqual(dsg.guard(c, (12,), "half")[11], c[11])
        self.assertEqual(dsg.guard(c, (12,), "one")[11], 1.0)

    def test_guard_order_and_clamp(self):
        for p in ("A+60", "P-60", "North-Sea"):
            summer = dg.season_months(p, "summer")
            for hn in ("E", "L"):
                cs = dsg.corrections(p, hn, dsg.REAL)
                for g in dsg.LAGS:
                    lc, dh, dgd = cs[f"LC_{g}"], cs[f"DH_{g}"], cs[f"DG_{g}"]
                    for m in range(12):
                        self.assertLessEqual(lc[m], dh[m])
                        self.assertLessEqual(dh[m], dgd[m])
                        self.assertLessEqual(dgd[m], cs[f"DA_{g}"][m])
                        if m + 1 not in summer:
                            self.assertEqual(lc[m], dgd[m])
                        for r in ("DG", "DH", "SZ", "DA"):
                            self.assertTrue(0.85 <= cs[f"{r}_{g}"][m] <= 1.15)

    def test_tilt_rule_is_6zzo_lag2(self):
        for p in ("A+60", "P-60"):
            for hn in ("E", "L"):
                a = dsg.corrections(p, hn, dsg.REAL)["TE_2"]
                b = tl.corrections(p, hn, dsg.REAL)[tl.tname(-0.03)]
                for x, y in zip(a, b):
                    self.assertAlmostEqual(x, y, places=12)

    def test_lc_is_6zzo_lag(self):
        a = dsg.corrections("Gulf-of-Alaska", "L", dsg.REAL)
        b = tl.corrections("Gulf-of-Alaska", "L", dsg.REAL)
        self.assertEqual(a["LC_2"], b["LC_2"])
        self.assertEqual(a["LC_3"], b["LC_3"])


if __name__ == "__main__":
    unittest.main()
