import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from eda_equivinterval import interval as I


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = I.survivors(I.load())

    def test_groups(self):
        g = I.by_line(self.rows)
        self.assertEqual(len(g), 11)
        self.assertEqual(sum(len(v) for v in g.values()), 27)

    def test_observed_accuracy_matches_equivpredict(self):
        self.assertEqual(sum(I.hits(self.rows)), 25)

    def test_bootstrap_contains_point_and_is_deterministic(self):
        a = I.cluster_bootstrap(self.rows, n=2000, seed=1)
        self.assertEqual(a, I.cluster_bootstrap(self.rows, n=2000, seed=1))
        self.assertLessEqual(a[0], 25 / 27)
        self.assertGreaterEqual(a[1], 25 / 27)
        self.assertLess(a[0], a[1])

    def test_permutation_p_in_range(self):
        obs, p = I.permutation_p(self.rows, n=300, seed=2)
        self.assertAlmostEqual(obs, 25 / 27)
        self.assertTrue(0 < p < 0.1)

    def test_single_line_degenerate(self):
        rows = [r for r in self.rows if I.P.features(r)["line"] == 151]
        self.assertEqual(len(I.by_line(rows)), 1)


if __name__ == "__main__":
    unittest.main()
