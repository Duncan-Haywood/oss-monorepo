import os, sys, unittest
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import seeds as S


class RankTests(unittest.TestCase):
    def test_spearman_identity_and_reverse(self):
        a = np.array([3.0, 1.0, 2.0, 5.0])
        self.assertAlmostEqual(S.spearman(a, a * 2 + 1), 1.0)
        self.assertAlmostEqual(S.spearman(a, -a), -1.0)

    def test_pairwise_count(self):
        self.assertEqual(len(S.pairwise_spearman(np.random.default_rng(0).random((4, 9)))), 6)

    def test_winner_counts(self):
        M = np.array([[1, 2, 3], [1, 3, 2], [2, 1, 3]], float)
        self.assertEqual(S.winner_counts(M), {0: 2, 1: 1})

    def test_top_set(self):
        self.assertEqual(S.top_set(np.array([5.0, 1.0, 3.0, 2.0]), 2), {1, 3})


class IndistinguishableTests(unittest.TestCase):
    def test_clear_loser_excluded_close_cell_kept(self):
        rng = np.random.default_rng(1)
        base = rng.normal(0, 0.05, (8, 1))
        M = np.hstack([5 + base, 5.02 + base + rng.normal(0, 0.1, (8, 1)), 9 + base])
        keep = S.indistinguishable_from_best(M)
        self.assertIn(0, keep); self.assertIn(1, keep); self.assertNotIn(2, keep)

    def test_best_always_kept(self):
        M = np.random.default_rng(2).random((5, 6))
        self.assertIn(int(np.argmin(M.mean(0))), S.indistinguishable_from_best(M))


if __name__ == "__main__":
    unittest.main()
