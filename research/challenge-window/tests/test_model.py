import math, random, unittest
from challenge_window import *


class T(unittest.TestCase):
    def test_closed_form_matches_dp(self):
        rng = random.Random(1)
        for _ in range(1500):
            G = rng.uniform(1, 200); S = rng.uniform(1, 300)
            rho = rng.uniform(0.02, 0.9); b = rng.uniform(0.2, 200)
            self.assertEqual(window_closed(G, S, rho, b), window_dp(G, S, rho, b), (G, S, rho, b))

    def test_window_deters_and_is_minimal(self):
        G, S, rho, b = 100, 40, 0.2, 5
        w = window_dp(G, S, rho, b)
        self.assertLessEqual(value(w, G, S, rho, b), 1e-9)
        self.assertGreater(value(w - 1, G, S, rho, b), 0)

    def test_pure_regimes(self):
        # cheap gambling only (huge bribe price): luck window
        self.assertEqual(window_dp(100, 50, 0.3, 1e9), window_luck(100, 50, 0.3))
        # stake so large that gambling never deters and bribe price is tiny: bribe window
        self.assertEqual(window_dp(100, 1e9, 0.3, 2), window_bribe(100, 0.3, 2))

    def test_adaptive_dominates_prefix_plan(self):
        rng = random.Random(2)
        for _ in range(200):
            G = rng.uniform(1, 100); S = rng.uniform(1, 100)
            rho = rng.uniform(0.05, 0.8); b = rng.uniform(0.5, 50); w = rng.randint(1, 30)
            self.assertGreaterEqual(value(w, G, S, rho, b) + 1e-9, prefix_value(w, G, S, rho, b))

    def test_window_never_below_either_pure_bound(self):
        rng = random.Random(3)
        for _ in range(300):
            G = rng.uniform(1, 100); S = rng.uniform(1, 100)
            rho = rng.uniform(0.05, 0.8); b = rng.uniform(0.5, 50)
            w = window_dp(G, S, rho, b)
            self.assertGreaterEqual(w, window_luck(G, S, rho)); self.assertGreaterEqual(w, min(window_luck(G, S, rho), window_bribe(G, rho, b)))

    def test_monotone_in_stake(self):
        ws = [window_dp(100, S, 0.2, 3) for S in (5, 10, 20, 40, 80, 160)]
        self.assertEqual(ws, sorted(ws, reverse=True))

    def test_monte_carlo_matches_value(self):
        G, S, rho, b, w = 60, 25, 0.25, 6, 9
        m, se = simulate_policy(w, G, S, rho, b, 60000, seed=5)
        self.assertLess(abs(m - value(w, G, S, rho, b)), 4 * se)

    def test_fee_funded_bribe_price_scales_window_as_one_over_stake(self):
        G, rho, th = 100, 0.2, 0.5
        for S in (20, 40, 80, 160):
            w = window_closed(G, S, rho, th * S)
            self.assertAlmostEqual(w * S, G / ((1 - rho) * th), delta=S * 1.0 + 1)

    def test_stake_for_window_inverts(self):
        G, rho = 100, 0.2
        S = stake_for_window(10, G, rho, lambda s: 0.5 * s)
        self.assertLessEqual(window_closed(G, S, rho, 0.5 * S), 10)
        self.assertGreater(window_closed(G, S * 0.98, rho, 0.5 * S * 0.98), 10)


if __name__ == "__main__":
    unittest.main()
