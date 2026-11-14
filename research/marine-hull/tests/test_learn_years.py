import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_fresh_years as fy  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_learned_season as ls  # noqa: E402


class LearnYearsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_learn_years_are_nearest_of_other_half(self):
        self.assertEqual(ly.learn_years("L", 1), (2009,))
        self.assertEqual(ly.learn_years("L", 3), (2007, 2008, 2009))
        self.assertEqual(ly.learn_years("E", 2), (2010, 2011))
        self.assertEqual(ly.learn_years("E", 5), fy.HALVES["L"])
        self.assertEqual(ly.learn_years("L", 5), fy.HALVES["E"])

    def test_k5_reproduces_6zza(self):
        key = (10000.0, "A+60", 2012, 1.0, 0.0, 0)
        _, out = ly.score(key)
        _, ref = ls.score(key)
        for g, r in (("LC_5", "LC_90"), ("LCP_5", "LCP"), ("AT_90", "AT_90"), (ly.BASE, ls.BASE)):
            self.assertAlmostEqual(out[g][0], ref[r][0], places=9)
            self.assertAlmostEqual(out[g][1], ref[r][1], places=9)

    def test_k5_ratios_match_6zza(self):
        for hn in fy.HALVES:
            a = ly.learned("P+60", ly.learn_years(hn, 5), ls.REAL)[0]
            b = ls.learned("P+60", ls.other(hn), ls.REAL)[0]
            for x, y in zip(a, b):
                self.assertAlmostEqual(x, y, places=12)

    def test_one_year_ratios_inside_clamp(self):
        for p in ("A+60", "Gulf-of-Alaska", "A+0"):
            for hn in fy.HALVES:
                cm, _ = ly.learned(p, ly.learn_years(hn, 1), (1.03, 0.03, 0))
                self.assertTrue(all(ly.CLAMP[0] <= x <= ly.CLAMP[1] for x in cm))


if __name__ == "__main__":
    unittest.main()
