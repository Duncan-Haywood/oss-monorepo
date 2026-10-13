import unittest, math
from replicated_execution import *


class T(unittest.TestCase):
    def test_p_others_hypergeometric_vs_limit(self):
        self.assertAlmostEqual(p_others(10, 4, 1), 1.0)
        self.assertAlmostEqual(p_others(10, 4, 2), 3 / 9)
        self.assertAlmostEqual(p_others(10, 4, 3), (3 / 9) * (2 / 8))
        self.assertAlmostEqual(p_others(100000, 30000, 3), 0.3 ** 2, places=3)
        self.assertEqual(p_others(10, 2, 3), 0.0)

    def test_payoff_matches_monte_carlo(self):
        n, m, k, G, S = 30, 12, 3, 1.0, 2.0
        p = p_others(n, m, k)
        for pi in (0.4, 0.8, 1.0):
            mc = simulate_focal(n, m, k, pi, G, S, 200000, seed=1)
            self.assertAlmostEqual(mc, cheat_payoff(p, pi, k, G, S), delta=0.02)

    def test_pi_star_is_indifference(self):
        p, k, G, S = 0.6, 3, 1.0, 0.3
        ps = pi_star(p, k, G, S)
        self.assertAlmostEqual(cheat_payoff(p, ps, k, G, S), 0.0, places=9)
        self.assertIsNone(pi_star(0.1, 3, 1.0, 5.0))

    def test_min_stake_threshold(self):
        p, G = 0.4, 2.0
        S = min_stake(p, G)
        self.assertAlmostEqual(cheat_payoff(p, 1.0, 2, G, S), 0.0, places=9)
        self.assertTrue(unique_honest(p, 2, G, S))
        self.assertFalse(unique_honest(p, 2, G, S * 0.99))
        self.assertEqual(min_stake(1.0, 1.0), math.inf)

    def test_replicator_basin(self):
        p, k, G, S = 0.7, 3, 1.0, 0.8
        ps = pi_star(p, k, G, S); self.assertIsNotNone(ps)
        self.assertLess(replicator(p, k, G, S, ps * 0.9), 0.05)
        self.assertGreater(replicator(p, k, G, S, min(0.999, ps * 1.1)), 0.95)

    def test_basin_stake(self):
        p, k, G = 0.5, 3, 1.0
        S = min_stake_basin(p, k, G, 0.2)
        self.assertAlmostEqual(pi_star(p, k, G, S), 0.8, places=9)

    def test_public_rate_stake_free_and_mc(self):
        n, m, k = 60, 24, 3
        exact = math.comb(m, k) / math.comb(n, k)
        bad, caught = simulate_corruption(n, m, k, 200000, "informed", lam=1.0, seed=3)
        self.assertAlmostEqual(bad, exact, delta=0.003); self.assertEqual(caught, 0.0)
        self.assertEqual(attack_rate_public(0.4, 3), 0.4 ** 3)

    def test_leaky_linear_in_lambda(self):
        n, m, k = 60, 24, 3
        exact = math.comb(m, k) / math.comb(n, k)
        bad, _ = simulate_corruption(n, m, k, 200000, "informed", lam=0.3, seed=4)
        self.assertAlmostEqual(bad, 0.3 * exact, delta=0.003)
        self.assertAlmostEqual(attack_rate_leaky(0.4, 3, 0.3, False), 0.3 * 0.4 ** 3)

    def test_blind_always_caught_with_honest_present(self):
        bad, caught = simulate_corruption(50, 10, 3, 50000, "blind", seed=5)
        exact = math.comb(10, 3) / math.comb(50, 3)
        self.assertAlmostEqual(bad, exact, delta=0.002)
        self.assertAlmostEqual(bad + caught, 1 - math.comb(40, 3) / math.comb(50, 3), delta=0.004)
        self.assertGreater(caught, 10 * bad)

    def test_min_k_public(self):
        self.assertEqual(min_k_public(0.5, 0.01), 7)
        self.assertLessEqual(0.5 ** min_k_public(0.5, 0.01), 0.01)
        self.assertGreater(0.5 ** (min_k_public(0.5, 0.01) - 1), 0.01)

    def test_optimal_k_interior(self):
        k, cost, S = optimal_k(0.3, 10.0, 1.0, 0.5)
        self.assertGreaterEqual(k, 2)
        for kk in (k - 1, k + 1):
            if kk >= 2:
                p = 0.3 ** (kk - 1)
                self.assertGreaterEqual(kk * 1.0 + 0.5 * min_stake(p, 10.0), cost - 1e-12)


if __name__ == "__main__":
    unittest.main()
