import unittest, math
from data_valuation_replication import *


class T(unittest.TestCase):
    def test_exact_matches_bruteforce(self):
        for rho in (0.0, 0.4, 1.0):
            k, n, a, tau = 3, 3, 1.3, 0.7
            ref = shapley_bruteforce([a] * k + [tau] * n, [0] * k + list(range(1, n + 1)), rho)
            self.assertAlmostEqual(shapley_copy(k, n, a, tau, rho), ref[0], places=12)
            self.assertAlmostEqual(shapley_copy(k, n, a, tau, rho), ref[1], places=12)

    def test_integral_identity(self):
        self.assertAlmostEqual(shapley_copy(3, 4, 1.0, 0.7, 0.3), shapley_integral(3, 4, 1.0, 0.7, 0.3), places=6)

    def test_efficiency(self):
        k, n, a, tau, rho = 4, 5, 1.0, 0.8, 0.25
        pot = group_shapley(k, n, a, tau, rho) + n * shapley_honest(k, n, a, tau, rho)
        self.assertAlmostEqual(pot, value(k, n, a, tau, rho), places=12)

    def test_single_player_symmetry(self):
        n = 9
        self.assertAlmostEqual(share(1, n, 1.0, 1.0, 1.0), 1 / (n + 1), places=12)

    def test_replication_pays_even_when_copies_add_nothing(self):
        prev = group_shapley(1, 9, 1.0, 1.0, 1.0)
        for k in range(2, 30):
            cur = group_shapley(k, 9, 1.0, 1.0, 1.0)
            self.assertGreater(cur, prev); prev = cur

    def test_standalone_limit(self):
        self.assertLess(group_shapley(400, 9, 1.0, 1.0, 1.0), standalone_limit(1.0))
        self.assertAlmostEqual(group_shapley(400, 9, 1.0, 1.0, 1.0), standalone_limit(1.0), delta=0.02)

    def test_naive_share_tends_to_one(self):
        self.assertGreater(share(400, 9, 1.0, 1.0, 0.0), 0.97)

    def test_loo_zero_for_true_copies(self):
        self.assertEqual(group_loo(2, 9, 1.0, 1.0, 1.0), 0.0)
        self.assertGreater(group_loo(1, 9, 1.0, 1.0, 1.0), 0.0)

    def test_best_k_free_copies_hits_cap_and_costly_copies_stop(self):
        self.assertEqual(best_k(9, 1.0, 1.0, 1.0, 0.0, kmax=50), 50)
        self.assertEqual(best_k(9, 1.0, 1.0, 1.0, 0.06, kmax=50), 1)


if __name__ == "__main__":
    unittest.main()
