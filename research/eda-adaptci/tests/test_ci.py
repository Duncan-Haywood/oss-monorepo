import inspect
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments"))
from eda_adaptci import models, pick  # noqa: E402
import run  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROWS = models.load(os.path.join(HERE, "..", "experiments", "dataset.jsonl"))
X, Y, NAMES = models.matrix(ROWS)
FAM = np.array([r["family"] for r in ROWS])


class BootstrapTests(unittest.TestCase):
    def test_interval_brackets_the_median_and_narrows_with_data(self):
        rs = np.random.RandomState(0)
        small = run.boot_ci(rs.normal(-2, 1, 10), np.random.RandomState(1))
        big = run.boot_ci(rs.normal(-2, 1, 400), np.random.RandomState(1))
        for m, lo, hi in (small, big):
            self.assertLessEqual(lo, m)
            self.assertLessEqual(m, hi)
        self.assertLess(big[2] - big[1], small[2] - small[1])

    def test_interval_of_constant_is_a_point(self):
        self.assertEqual(run.boot_ci([3.0] * 20, np.random.RandomState(0)), (3.0, 3.0, 3.0))

    def test_coverage_of_a_known_median(self):
        hit = 0
        for s in range(100):
            v = np.random.RandomState(s).normal(5.0, 2.0, 60)
            _, lo, hi = run.boot_ci(v, np.random.RandomState(1000 + s))
            hit += lo <= 5.0 <= hi
        self.assertGreaterEqual(hit, 85)  # nominal 95%, small-sample percentile bootstrap runs a little low


class ProtocolTests(unittest.TestCase):
    def test_split_disjoint_and_seeded(self):
        for f in sorted(set(FAM)):
            pool, test = pick.split(FAM, f, 12)
            self.assertEqual(len(set(pool) & set(test)), 0)
            self.assertEqual(len(pool) + len(test), int((FAM == f).sum()))

    def test_choose_has_no_label_argument(self):
        self.assertNotIn("y", inspect.signature(pick.choose).parameters)

    def test_spread_is_deterministic_and_distinct(self):
        pool, _ = pick.split(FAM, sorted(set(FAM))[0], 0)
        a = pick.choose("spread", X[pool], NAMES, 5)
        self.assertEqual(a, pick.choose("spread", X[pool], NAMES, 5))
        self.assertEqual(len(set(a)), 5)

    def test_score_is_finite_percentage_fraction(self):
        v = pick.score(X, Y, FAM, NAMES, sorted(set(FAM))[0], "linear", "spread", 5, 5.0, 3)
        self.assertTrue(0 <= v < 5)


if __name__ == "__main__":
    unittest.main()
