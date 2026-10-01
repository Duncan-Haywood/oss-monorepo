import math, random, unittest
from private_data_market import *


class T(unittest.TestCase):
    def test_closed_form_matches_grid(self):
        for a, s, k in [(0.5, 1, 0.3), (1, 0.2, 0.9), (0.1, 2, 5.0), (3, 0.5, 0.3), (0.01, 1, 50.0)]:
            u = best_noise(a, s, k)
            v, ug = best_noise_grid(a, s, k, lo=1e-4, hi=1e7, n=6000)
            self.assertGreaterEqual(payoff(u, a, s, k), v - 1e-9)
            self.assertLess(abs(math.log(u / ug)), 0.01)

    def test_cliff_is_exact(self):
        # kappa*a >= 1: payoff negative for every noise level; kappa*a < 1: some noise gives positive payoff
        for s in (0.1, 1.0, 5.0):
            k, a = 0.4, 2.5
            self.assertIsNone(best_noise(a, s, k))
            self.assertTrue(all(payoff(10 ** e, a, s, k) < 0 for e in [x / 4 for x in range(-24, 40)]))
            self.assertIsNotNone(best_noise(2.49, s, k))
            self.assertGreater(payoff(best_noise(2.49, s, k), 2.49, s, k), 0)

    def test_payment_is_information(self):
        rng = random.Random(3)
        mean, se = simulate_payments(2.0, 1.0, 0.5, 200000, rng, m0=0.7)
        self.assertLess(abs(mean - info(2.0, 1 / 1.5)), 4 * se)

    def test_telescoping_pathwise(self):
        worst, mean, exact = simulate_telescoping(1.0, [0.5, 0.2, 0.1], 500, random.Random(2))
        self.assertLess(worst, 1e-12)

    def test_market_capped_and_approaches_cap(self):
        r = run_market([(1.0, 0.5)] * 80, 0.2)
        self.assertLess(r["a"], cap(0.5))
        self.assertGreater(r["a"], cap(0.5) - 1e-6)
        self.assertAlmostEqual(r["total_pay"], 0.5 * math.log(r["a"] / 0.2), places=12)

    def test_geometric_rate(self):
        s, k = 1.0, 0.5
        a = 0.2
        gaps = []
        for _ in range(40):
            a += 1 / (s + best_noise(a, s, k))
            gaps.append(1 - k * a)
        self.assertAlmostEqual(gaps[-1] / gaps[-2], approach_ratio(s, k), places=4)

    def test_planner_beats_market_and_market_overcollects(self):
        w_m, us = market_welfare(20, 0.2, 1.0, 0.5)
        w_p, up = planner_symmetric(20, 0.2, 1.0, 0.5)
        self.assertGreater(w_p, w_m)
        self.assertLess(us[0], up)   # first agent adds less noise than the planner wants

    def test_heterogeneous_order_matters(self):
        ag = [(1.0 / n, 4 * 1.0 / (n * n)) for n in (1, 2, 4, 8, 16)]   # sig2 = 1/n, kappa ~ 1/n^2
        up = run_market(ag, 0.05, order=[0, 1, 2, 3, 4])["a"]
        down = run_market(ag, 0.05, order=[4, 3, 2, 1, 0])["a"]
        self.assertNotAlmostEqual(up, down, places=3)


if __name__ == "__main__":
    unittest.main()
