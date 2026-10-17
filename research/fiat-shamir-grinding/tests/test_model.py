import math, unittest
from fiat_shamir_grinding import *


class T(unittest.TestCase):
    def test_p_avoid_small_exact(self):
        # T=5,k=2,q=2: C(3,2)/C(5,2)=3/10
        self.assertAlmostEqual(p_avoid(5, 2, 2), 0.3, 12)

    def test_p_avoid_edges(self):
        self.assertAlmostEqual(p_avoid(100, 3, 0), 1.0, 12)
        self.assertEqual(p_avoid(10, 4, 7), 0.0)

    def test_without_replacement_is_smaller(self):
        self.assertLess(p_avoid(1000, 10, 200), p_avoid_repl(1000, 10, 200))

    def test_repl_matches_exp_law(self):
        self.assertAlmostEqual(p_avoid_repl(10**6, 100, 50000), math.exp(-50000 * 100 / 10**6), 2)

    def test_q_for_bits_tight(self):
        q = q_for_bits(10000, 50, 40)
        self.assertLessEqual(p_avoid(10000, 50, q), 2.0 ** -40)
        self.assertGreater(p_avoid(10000, 50, q - 1), 2.0 ** -40)

    def test_q_for_deterrence_tight(self):
        q = q_for_deterrence(1000, 5, 1e6, 1.0)
        self.assertLessEqual(p_avoid(1000, 5, q) * 1e6, 1.0)
        self.assertGreater(p_avoid(1000, 5, q - 1) * 1e6, 1.0)

    def test_grind_profit_sign_flip(self):
        self.assertAlmostEqual(grind_profit(100, 1, 0.1), 90.0)
        self.assertEqual(grind_profit(100, 1, 0.005), 0.0)

    def test_budget_limit(self):
        self.assertAlmostEqual(grind_profit_budget(100, 1, 0.1, 10**6), 90.0, 6)
        self.assertLess(grind_profit_budget(100, 1, 0.1, 3), 90.0)

    def test_beacon_needs_far_fewer_samples(self):
        qb = q_for_beacon(1000, 10, 1.0, 1.0)
        qg = q_for_deterrence(1000, 10, 2.0 ** 30, 1.0)
        self.assertGreater(qg, 10 * qb)

    def test_pow_optimum_matches_bruteforce(self):
        v, lp, c0, G = 5.0, 0.01, 1.0, 1e9
        x = pow_cost_opt(v, lp, c0)
        xb = overhead_best_bruteforce(v, lp, c0, G, grid=40000, xmax=1000.0)
        self.assertAlmostEqual(x, 499.0, 9)
        self.assertAlmostEqual(xb, x, delta=0.05)

    def test_pow_zero_when_verification_cheap(self):
        self.assertEqual(pow_cost_opt(0.001, 0.1, 5.0), 0.0)

    def test_simulation_matches_geometric(self):
        T_, k, q = 40, 2, 10
        p = p_avoid(T_, k, q)
        mean, first = simulate_grind(T_, k, q, trials=3000, seed=1)
        self.assertAlmostEqual(first, p, delta=0.03)
        self.assertAlmostEqual(mean, 1 / p, delta=0.15 / p * 0.5 + 0.2)


if __name__ == "__main__":
    unittest.main()
