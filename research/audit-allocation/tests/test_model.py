import unittest, random
from audit_allocation import *


def inst(rng, n):
    return [rng.uniform(0.5, 5) for _ in range(n)], [rng.uniform(0.2, 3) for _ in range(n)]


class T(unittest.TestCase):
    def test_threshold_is_indifference(self):
        g, S = 2.0, 3.0; t = threshold(g, S)
        self.assertAlmostEqual((1 - t) * g - t * S, 0.0)

    def test_loss_matches_simulation(self):
        hs, gs, S = [1.0, 2.0, 0.5], [1.0, 2.0, 4.0], 2.0
        ps = [0.2, 0.9, 0.1]
        self.assertAlmostEqual(simulate_loss(ps, hs, gs, S, 100000, seed=3), total_loss(ps, hs, gs, S), delta=0.02)

    def test_full_budget_zero_loss(self):
        rng = random.Random(1); hs, gs = inst(rng, 6)
        B = full_cost(gs, 1.5)
        self.assertAlmostEqual(brute_force(hs, gs, 1.5, B + 1e-9)[0], 0.0, places=6)

    def test_zero_budget_full_loss(self):
        hs, gs = [1, 2, 3], [1, 1, 1]
        self.assertAlmostEqual(brute_force(hs, gs, 1.0, 0.0)[0], 6.0)

    def test_brute_force_beats_random_policies(self):
        rng = random.Random(2)
        for _ in range(30):
            hs, gs = inst(rng, 5); S = rng.uniform(0.5, 3); B = rng.uniform(0.2, 2.0)
            opt = brute_force(hs, gs, S, B)[0]
            for _ in range(200):
                w = [rng.random() for _ in hs]; s = sum(w); ps = [B * x / s for x in w]
                self.assertLessEqual(opt, total_loss(ps, hs, gs, S) + 1e-9)

    def test_greedy_within_third_and_feasible(self):
        rng = random.Random(4)
        for _ in range(300):
            n = rng.randint(2, 9); hs, gs = inst(rng, n); S = rng.uniform(0.3, 4); B = rng.uniform(0.1, 0.8) * full_cost(gs, S)
            opt = sum(hs) - brute_force(hs, gs, S, B)[0]; gr = sum(hs) - greedy(hs, gs, S, B)[0]
            self.assertGreaterEqual(gr, opt / 3 - 1e-9)
            self.assertLessEqual(gr, opt + 1e-9)

    def test_lp_bound_dominates(self):
        rng = random.Random(5)
        for _ in range(100):
            hs, gs = inst(rng, 7); S = rng.uniform(0.3, 4); B = rng.uniform(0.1, 0.9) * full_cost(gs, S)
            self.assertGreaterEqual(lp_bound(hs, gs, S, B) + 1e-9, sum(hs) - brute_force(hs, gs, S, B)[0])

    def test_uniform_never_beats_optimal_and_costs_more_to_deter(self):
        rng = random.Random(6)
        for _ in range(50):
            hs, gs = inst(rng, 6); S = rng.uniform(0.3, 3); B = rng.uniform(0.2, 1.0) * full_cost(gs, S)
            self.assertLessEqual(brute_force(hs, gs, S, B)[0], uniform_policy(hs, gs, S, B) + 1e-9)
            self.assertGreaterEqual(uniform_cost(gs, S) + 1e-12, full_cost(gs, S))

    def test_jensen_heterogeneity_lowers_cost(self):
        rng = random.Random(7)
        for _ in range(50):
            gs = [rng.uniform(0.1, 10) for _ in range(8)]; S = rng.uniform(0.1, 5); gbar = sum(gs) / 8
            self.assertLessEqual(full_cost(gs, S), 8 * threshold(gbar, S) + 1e-12)

    def test_min_stake_identical_closed_form(self):
        n, g, B = 10, 2.0, 3.0
        self.assertAlmostEqual(min_stake_for_budget([g] * n, B), g * (n / B - 1), places=6)


if __name__ == "__main__":
    unittest.main()
