import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_fresh_years as fy  # noqa: E402
import run_lag3_diagnosis as dg  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_subset_years as su  # noqa: E402


class Lag3DiagnosisTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_local_seasons_flip_south(self):
        self.assertEqual(dg.season_months("A+60", "winter"), (12, 1, 2))
        self.assertEqual(dg.season_months("P-60", "winter"), (6, 7, 8))
        self.assertEqual(dg.season_months("P-60", "summer"), (12, 1, 2))
        for p in ("A+60", "P-30"):
            months = sorted(m for s in dg.SEASONS for m in dg.season_months(p, s))
            self.assertEqual(months, list(range(1, 13)))

    def test_repairs_and_level_shape_split(self):
        c = dg.corrections("North-Sea", "L", dg.REAL)
        c3, cs = c["LC_3"], c["OC"]
        self.assertEqual(c3, ly.learned("North-Sea", (2007,), dg.REAL)[0])
        self.assertEqual(c["R3_03"][2], cs[2])
        self.assertEqual(c["R3_03"][3], c3[3])
        self.assertEqual(c["R3_summer"][6], cs[6])
        self.assertEqual(c["R3_summer"][0], c3[0])
        w = dg.weights("North-Sea", "L", dg.REAL)
        self.assertAlmostEqual(sum(w), 1.0)
        self.assertAlmostEqual(dg.level(c["LV3"], w), dg.level(cs, w))
        self.assertAlmostEqual(dg.level(c["SH3"], w), dg.level(c3, w))

    def test_single_lags_match_6zzi(self):
        key = (5000.0, "P+60", 2011) + dg.REAL
        _, out = dg.score(key)
        _, ref = su.score(key)
        for g in dg.LAGS:
            self.assertAlmostEqual(out[f"LC_{g}"][0], ref[su.name((g,))][0], places=9)
            self.assertAlmostEqual(out[f"LC_{g}"][1], ref[su.name((g,))][1], places=9)
        self.assertAlmostEqual(out["AT_90"][0], ref["AT_90"][0], places=9)

    def test_lag3_years(self):
        self.assertEqual(su.years_of("L", (3,)), (2007,))
        self.assertEqual(su.years_of("E", (3,)), (2012,))


if __name__ == "__main__":
    unittest.main()
