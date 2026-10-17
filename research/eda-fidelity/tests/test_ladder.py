import math
import os
import unittest
from eda_fidelity import ladder as L

LOG = os.path.join(os.path.dirname(__file__), "..", "experiments", "eval_log.jsonl")


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = L.load(LOG)

    def test_log_loaded(self):
        self.assertEqual(len(self.rows), 40)
        self.assertEqual(len({(r["p"], r["wb"]) for r in self.rows}), 40)

    def test_rank_stats_known_values(self):
        self.assertAlmostEqual(L.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
        self.assertAlmostEqual(L.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1.0)
        self.assertAlmostEqual(L.kendall([1, 2, 3], [1, 3, 2]), 1 / 3)
        self.assertTrue(math.isnan(L.spearman([1, 1, 1], [1, 2, 3])))
        self.assertEqual(list(L.ranks([5, 1, 1, 3])), [3.0, 0.5, 0.5, 2.0])

    def test_top_rung_is_the_logged_objective(self):
        for r in self.rows:
            self.assertEqual(L.truth(r), r["cells"] * r["cycles"])

    def test_costs_increase_up_the_ladder(self):
        for r in self.rows:
            self.assertEqual(L.rung_cost(r, 0), 0.0)
            self.assertLess(L.rung_cost(r, 1), L.rung_cost(r, 2))

    def test_halving_cost_and_result_are_consistent(self):
        perm = list(range(40))
        best, cost = L.halving(self.rows, perm, 40)
        self.assertGreaterEqual(best, min(L.truth(r) for r in self.rows))
        self.assertGreater(cost, 0)
        # more first-rung designs can only cost more
        self.assertLessEqual(L.halving(self.rows, perm, 9)[1], cost)

    def test_random_search_respects_budget(self):
        perm = list(range(40))
        best, cost = L.random_search(self.rows, perm, 20.0)
        self.assertLessEqual(cost, 20.0)
        self.assertTrue(math.isfinite(best))
        self.assertEqual(L.random_search(self.rows, perm, 0.0)[0], math.inf)

    def test_full_pool_halving_finds_optimum_at_budget_20(self):
        for s in range(5):
            perm = list(__import__("random").Random(s).sample(range(40), 40))
            self.assertEqual(L.halving_at_budget(self.rows, perm, 20.0)[0], min(L.truth(r) for r in self.rows))


if __name__ == "__main__":
    unittest.main()
