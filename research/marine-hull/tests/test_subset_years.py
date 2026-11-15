import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_fresh_years as fy  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_subset_years as su  # noqa: E402


class SubsetYearsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_lag_sets_cover_every_subset(self):
        self.assertEqual(len(su.LAGSETS), 31)
        self.assertEqual(len(set(su.LAGSETS)), 31)
        self.assertEqual(sum(len(s) == 2 for s in su.LAGSETS), 10)

    def test_years_of_lag_sets(self):
        self.assertEqual(su.years_of("L", (1,)), (2009,))
        self.assertEqual(su.years_of("E", (1,)), (2010,))
        self.assertEqual(su.years_of("L", (2, 5)), (2005, 2008))
        self.assertEqual(su.years_of("E", (2, 5)), (2011, 2014))
        for hn in fy.HALVES:
            for k in (1, 2, 3, 5):
                self.assertEqual(su.years_of(hn, tuple(range(1, k + 1))), ly.learn_years(hn, k))

    def test_nearest_sets_reproduce_6zzb(self):
        for key in ((10000.0, "A+60", 2012, 1.0, 0.0, 0), (2500.0, "P-30", 2006) + ly.REAL):
            _, out = su.score(key)
            _, ref = ly.score(key)
            for k in (1, 2, 3, 5):
                a, b = out[su.name(tuple(range(1, k + 1)))], ref[f"LC_{k}"]
                self.assertAlmostEqual(a[0], b[0], places=9)
                self.assertAlmostEqual(a[1], b[1], places=9)
            self.assertAlmostEqual(out["AT_90"][0], ref["AT_90"][0], places=9)

    def test_spearman(self):
        self.assertAlmostEqual(su.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
        self.assertAlmostEqual(su.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1.0)
        self.assertEqual(su.ranks([5, 1, 5]), [2.5, 1.0, 2.5])


if __name__ == "__main__":
    unittest.main()
