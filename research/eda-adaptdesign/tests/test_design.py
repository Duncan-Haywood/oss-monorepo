import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments"))
from eda_adaptdesign import models, pick  # noqa: E402
import run  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROWS = models.load(os.path.join(HERE, "..", "experiments", "dataset.jsonl"))
X, Y, NAMES = models.matrix(ROWS)
FAM = np.array([r["family"] for r in ROWS])


class DesignBootTests(unittest.TestCase):
    def test_score_apes_median_matches_score(self):
        for strat in ("spread", "extremes"):
            _, a = pick.score_apes(X, Y, FAM, NAMES, "alu", "linear", strat, 5, 5.0, 3)
            self.assertAlmostEqual(float(np.median(a)), pick.score(X, Y, FAM, NAMES, "alu", "linear", strat, 5, 5.0, 3))

    def test_weighted_gap_with_unit_weights_is_plain_median_difference(self):
        a, r = np.array([.1, .2, .9]), np.array([.3, .4, .5])
        self.assertAlmostEqual(run.wmedian_gap(np.arange(3), a, r, np.ones(3, int)), 0.2 - 0.4)

    def test_dropped_design_leaves_the_rest(self):
        a, r = np.array([.1, .2, .9]), np.array([.3, .4, .5])
        self.assertAlmostEqual(run.wmedian_gap(np.arange(3), a, r, np.array([0, 1, 1])), 0.55 - 0.45)
        self.assertTrue(np.isnan(run.wmedian_gap(np.arange(3), a, r, np.zeros(3, int))))

    def test_identical_choosers_have_zero_gap_and_point_interval(self):
        rs = np.random.RandomState(0)
        t = np.arange(10)
        a = rs.rand(10)
        fam = np.array(["x"] * 10)
        got = run.design_boot([("x", t, a, a)], fam, ["x"], 50, rs)
        self.assertEqual(got, (0.0, 0.0, 0.0))

    def test_interval_widens_when_designs_disagree(self):
        rs = np.random.RandomState(1)
        fam = np.array(["x"] * 30)
        t = np.arange(30)
        a = rs.rand(30) * 0.1
        r_same = a + 0.05
        r_mixed = a + rs.choice([-0.3, 0.4], 30)
        lo1, hi1 = run.design_boot([("x", t, a, r_same)], fam, ["x"], 300, np.random.RandomState(2))[1:]
        lo2, hi2 = run.design_boot([("x", t, a, r_mixed)], fam, ["x"], 300, np.random.RandomState(2))[1:]
        self.assertLess(hi1 - lo1, hi2 - lo2)


if __name__ == "__main__":
    unittest.main()
