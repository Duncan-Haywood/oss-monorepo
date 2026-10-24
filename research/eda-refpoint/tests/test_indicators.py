import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from eda_refpoint import indicators as ind, study   # noqa: E402


class T(unittest.TestCase):
    TRUE = [(0.0, 1.0), (0.5, 0.5), (1.0, 0.0)]

    def test_perfect_set_is_perfect(self):
        self.assertAlmostEqual(ind.hv_ratio(self.TRUE, self.TRUE, (1.1, 1.1)), 1.0)
        self.assertEqual(ind.recall(self.TRUE, self.TRUE), 1.0)
        self.assertEqual(ind.igd_plus(self.TRUE, self.TRUE), 0.0)
        self.assertEqual(ind.eps_add(self.TRUE, self.TRUE), 0.0)

    def test_missing_point_known_values(self):
        found = [(0.0, 1.0), (1.0, 0.0)]
        self.assertAlmostEqual(ind.recall(found, self.TRUE), 2 / 3)
        # (0.5, 0.5) is worse than both found points by 0.5 in one coordinate: distance 0.5 to each; others are 0
        self.assertAlmostEqual(ind.igd_plus(found, self.TRUE), 0.5 / 3)
        self.assertAlmostEqual(ind.eps_add(found, self.TRUE), 0.5)

    def test_dominated_extra_points_change_nothing(self):
        found = self.TRUE + [(0.9, 0.9)]
        self.assertAlmostEqual(ind.hv_ratio(found, self.TRUE, (1.1, 1.1)), 1.0)

    def test_hv_ratio_depends_on_reference_point(self):
        found = [(0.0, 1.0), (1.0, 0.0)]
        near, far = ind.hv_ratio(found, self.TRUE, (1.01, 1.01)), ind.hv_ratio(found, self.TRUE, (5, 5))
        self.assertLess(near, far)      # a far reference point rewards the extreme points, so the missing middle costs less

    def test_kendall(self):
        self.assertEqual(study.kendall([1, 2, 3], [10, 20, 30]), 1.0)
        self.assertEqual(study.kendall([1, 2, 3], [3, 2, 1]), -1.0)

    def test_study_scores_real_table(self):
        from eda_proposers import table
        sp = table.Space(table.load_table(study.TABLE))
        o = study.orders(sp, 8, 2)
        sc = study.score(sp, o, 8, lambda f, t: ind.hv_ratio(f, t, (1.1,) * 3))
        self.assertEqual(set(sc), {"random", "annealing", "genetic", "nsga2", "tpe"})
        self.assertTrue(all(0 < v.min() <= 1 for v in sc.values()))


if __name__ == "__main__":
    unittest.main()
