import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_dark_summer_guard as dsg  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_lag3_diagnosis as dg  # noqa: E402
import run_side_guard as sg  # noqa: E402


class SideGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_side_reads_km_first_then_dark(self):
        B = sg.BASE
        self.assertEqual(sg.side({B: (100, 5, None), "AT_90": (99, 9, None)}), "short")
        self.assertEqual(sg.side({B: (100, 5, None), "AT_90": (99, 1, None)}), "short")
        self.assertEqual(sg.side({B: (100, 5, None), "AT_90": (101, 6, None)}), "dark")
        self.assertEqual(sg.side({B: (100, 5, None), "AT_90": (100, 5, None)}), "ok")

    def test_learning_year_is_the_other_half(self):
        for yr in fy.YEARS:
            for g in sg.LAGS:
                y = sg.learning_year(yr, g)
                self.assertNotEqual(fy.half_of(y), fy.half_of(yr))
                self.assertEqual(y, 2010 - g if fy.half_of(yr) == "L" else 2009 + g)

    def test_guards_bracket_the_raw_ratios(self):
        for p in ("A+60", "P-60", "North-Sea"):
            summer = dg.season_months(p, "summer")
            for hn in ("E", "L"):
                cs = sg.corrections(p, hn, sg.REAL)
                ref = dsg.corrections(p, hn, sg.REAL)
                for g in sg.LAGS:
                    lc, dgd, bgd = cs[f"LC_{g}"], cs[f"DG_{g}"], cs[f"BG_{g}"]
                    self.assertEqual(lc, ref[f"LC_{g}"])
                    self.assertEqual(dgd, ref[f"DG_{g}"])
                    for m in range(12):
                        self.assertLessEqual(bgd[m], lc[m])
                        self.assertLessEqual(lc[m], dgd[m])
                        if m + 1 not in summer:
                            self.assertEqual(bgd[m], lc[m])
                        else:
                            self.assertLessEqual(bgd[m], 1.0)

    def test_gate_picks_by_the_learning_years_side(self):
        B, cap, sh = sg.BASE, sg.PACKS[0], sg.REAL
        cells = {}
        # scored year 2012 (half L): lag g learns from 2010 - g; make lag 1 short, lag 2 dark, lags 3 to 5 ok
        for yr in fy.YEARS:
            t = {B: (100.0, 5.0, None), "AT_90": (100.0, 5.0, None)}
            if yr == 2009:
                t["AT_90"] = (90.0, 1.0, None)
            if yr == 2008:
                t["AT_90"] = (110.0, 9.0, None)
            for g in sg.LAGS:
                t[f"LC_{g}"], t[f"DG_{g}"], t[f"BG_{g}"] = ("lc", g), ("dg", g), ("bg", g)
            cells[(cap, "A+60", yr) + sh] = t
        sides = sg.gate(cells)
        t = cells[(cap, "A+60", 2012) + sh]
        self.assertEqual(sides[(cap, "A+60", 2012) + sh][1], "short")
        self.assertEqual(t["OG_1"], ("dg", 1))
        self.assertEqual(t["OM_1"], ("dg", 1))
        self.assertEqual(t["OG_2"], ("lc", 2))
        self.assertEqual(t["OM_2"], ("bg", 2))
        for g in (3, 4, 5):
            self.assertEqual(t[f"OG_{g}"], ("lc", g))
            self.assertEqual(t[f"OM_{g}"], ("lc", g))


if __name__ == "__main__":
    unittest.main()
