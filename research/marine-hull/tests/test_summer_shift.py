import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_fresh_years as fy  # noqa: E402
import run_lag3_diagnosis as dg  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_summer_shift as ss  # noqa: E402


class SummerShiftTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_shift_touches_only_named_months(self):
        c = tuple(1.0 + i / 100 for i in range(12))
        s = ss.shift(c, (6, 7, 8), 2.0)
        for i in range(12):
            want = c[i] * 1.02 if i in (5, 6, 7) else c[i]
            self.assertAlmostEqual(s[i], want)
        self.assertEqual(ss.shift(c, (6, 7, 8), 0.0), c)

    def test_zero_shift_is_the_single_lag(self):
        c = ss.corrections("North-Sea", "L", ss.REAL)
        for g in (2, 3, 4):
            self.assertEqual(c[ss.name(g, "summer", 0.0)], ly.learned("North-Sea", ss.su.years_of("L", (g,)), ss.REAL)[0])

    def test_southern_summer_is_dec_to_feb(self):
        c = ss.corrections("P-60", "E", ss.REAL)
        base = c[ss.name(2, "summer", 0.0)]
        up = c[ss.name(2, "summer", 3.0)]
        changed = [i + 1 for i in range(12) if abs(up[i] - base[i]) > 1e-15]
        self.assertEqual(sorted(changed), sorted(dg.season_months("P-60", "summer")))

    def test_score_matches_6zzl_at_zero_shift(self):
        key = (5000.0, "P+60", 2011) + ss.REAL
        _, out = ss.score(key)
        _, ref = dg.score(key)
        for g in (2, 3, 4):
            self.assertAlmostEqual(out[ss.name(g, "summer", 0.0)][0], ref[f"LC_{g}"][0], places=9)
            self.assertAlmostEqual(out[ss.name(g, "summer", 0.0)][1], ref[f"LC_{g}"][1], places=9)


if __name__ == "__main__":
    unittest.main()
