import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_fresh_years as fy  # noqa: E402
import run_replay_fallback as rf  # noqa: E402
import run_side_guard as sg  # noqa: E402


class ReplayFallbackTests(unittest.TestCase):
    def test_weight_is_zero_unless_short_and_saturates_at_s(self):
        self.assertEqual(rf.weight(0.0, 0.03), 0.0)
        self.assertEqual(rf.weight(0.05, 0.03), 0.0)
        self.assertAlmostEqual(rf.weight(-0.015, 0.03), 0.5)
        self.assertEqual(rf.weight(-0.03, 0.03), 1.0)
        self.assertEqual(rf.weight(-0.2, 0.03), 1.0)

    def test_shrink_endpoints(self):
        c = (0.8, 1.0, 1.2)
        self.assertEqual(rf.shrink(c, 0.0), (1.0, 1.0, 1.0))
        self.assertEqual(rf.shrink(c, 1.0), c)
        for a, b in zip(rf.shrink(c, 0.5), (0.9, 1.0, 1.1)):
            self.assertAlmostEqual(a, b)

    def test_margin_sign(self):
        B = rf.BASE
        self.assertAlmostEqual(rf.margin({B: (100.0, 0, None), "AT_90": (97.0, 0, None)}), -0.03)
        self.assertGreater(rf.margin({B: (100.0, 0, None), "AT_90": (101.0, 0, None)}), 0)
        self.assertEqual(rf.margin({B: (0.0, 0, None), "AT_90": (0.0, 0, None)}), 0.0)

    def test_fallback_uses_dg_when_short_and_no_correction_otherwise(self):
        B, cap, sh, p = rf.BASE, rf.PACKS[0], rf.REAL, "A+60"
        cells = {}
        for yr in fy.YEARS:
            t = {B: (100.0, 5.0, None), "AT_90": (100.0, 5.0, None)}
            if yr == 2009:  # lag 1 of 2012: short by 2%
                t["AT_90"] = (98.0, 1.0, None)
            if yr == 2008:  # lag 2 of 2012: short by 20%
                t["AT_90"] = (80.0, 1.0, None)
            for g in rf.LAGS:
                t[f"LC_{g}"], t[f"DG_{g}"], t[f"BG_{g}"] = ("lc", g), ("dg", g), ("bg", g)
            cells[(cap, p, yr) + sh] = t
        sides = sg.gate(cells)
        jobs, mid = rf.fallback(cells, sides)
        key = (cap, p, 2012) + sh
        t = cells[key]
        self.assertEqual(t["OA_1"], ("dg", 1))
        self.assertEqual(t["OL_1"], ("lc", 1))
        for g in (3, 4, 5):
            self.assertEqual(t[f"OA_{g}"], t["AT_90"])
            self.assertEqual(t[f"CS03_{g}"], t["AT_90"])
        self.assertEqual(t["CS01_1"], ("dg", 1))   # 2% shortfall saturates s = 1%
        self.assertEqual(t["CS10_2"], ("dg", 2))   # 20% shortfall saturates s = 10%
        ws = dict(jobs)[key]
        self.assertAlmostEqual(ws["CS03_1"][1], 2 / 3)
        self.assertAlmostEqual(ws["CS10_1"][1], 0.2)
        self.assertNotIn("CS01_1", ws)


if __name__ == "__main__":
    unittest.main()
