import itertools, random, unittest
from router_impurity import *


class T(unittest.TestCase):
    def test_shared_and_random_routing_hit_the_conflict_ceiling(self):
        d, r, tw, tb, K = 12, 3, 0.2, 1.0, 4
        u = [1 / K] * K
        ceil = conflict_ceiling(d, r, tw, tb, K)
        for m in (1, 2, 4, 7):
            self.assertAlmostEqual(floor(d, r, tw, tb, u, random_router(K, m)), ceil, places=12)
        self.assertAlmostEqual(shared_floor(d, r, tw, tb, u), ceil, places=12)

    def test_perfect_router_leaves_only_within_cluster_conflict(self):
        d, r, tw, tb, K = 12, 3, 0.2, 1.0, 5
        u = [1 / K] * K
        self.assertAlmostEqual(floor(d, r, tw, tb, u, noisy_router(K, 0.0)), perfect_floor(d, r, tw, tb, u), places=12)
        self.assertAlmostEqual(purity(u, noisy_router(K, 0.0)), 1.0, places=12)

    def test_noisy_router_matches_quadratic_closed_form(self):
        K, u = 6, [1 / 6] * 6
        for q in (0.0, 0.1, 0.4, 5 / 6):
            self.assertAlmostEqual(impurity(u, noisy_router(K, q)), 2 * q - q * q * K / (K - 1), places=12)

    def test_block_router_removed_share_is_linear_in_modules(self):
        K = 8
        u = [1 / K] * K
        for m in range(1, K + 1):
            self.assertAlmostEqual(removed_fraction(u, block_router(K, m)), (m - 1) / (K - 1), places=12)
        self.assertEqual(modules_for_target(8, 0.5), 5)
        self.assertEqual(modules_for_target(8, 1.0), 8)

    def test_routing_error_first_order_cost(self):
        u = [0.25] * 4
        h = 1e-6
        slope = (impurity(u, noisy_router(4, h)) - impurity(u, noisy_router(4, 0))) / h
        self.assertAlmostEqual(slope, 2.0, places=4)

    def test_purity_bounds_and_nonuniform_prior(self):
        u = [0.7, 0.2, 0.1]
        R = [[0.9, 0.1], [0.3, 0.7], [0.0, 1.0]]
        p = purity(u, R)
        self.assertGreaterEqual(p, sum(x * x for x in u) - 1e-12)   # any router is at least as pure as none
        self.assertLessEqual(p, 1.0)

    def test_purity_estimator_is_unbiased_by_enumeration(self):
        pi = [0.5, 0.3, 0.2]
        for n in (2, 3, 4):
            exp = 0.0
            for lab in itertools.product(range(3), repeat=n):
                w = 1.0
                counts = [0, 0, 0]
                for c in lab:
                    w *= pi[c]
                    counts[c] += 1
                exp += w * purity_from_counts(counts)
            self.assertAlmostEqual(exp, sum(x * x for x in pi), places=12)

    def test_simulation_matches_law(self):
        d, r, tw, tb, K = 8, 2, 0.3, 1.0, 3
        u = [1 / K] * K
        for R in (noisy_router(K, 0.0), noisy_router(K, 0.3), random_router(K, 1)):
            sim = simulate_floor(d, r, tw, tb, u, R, 1500, random.Random(7), burn=30, lag=30)
            ex = floor(d, r, tw, tb, u, R)
            self.assertLess(abs(sim - ex) / ex, 0.08)


if __name__ == "__main__":
    unittest.main()
