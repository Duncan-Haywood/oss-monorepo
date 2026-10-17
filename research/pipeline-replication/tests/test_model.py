import math, unittest
from pipeline_replication import *


class T(unittest.TestCase):
    def test_stage_dead_limits(self):
        self.assertAlmostEqual(stage_dead(0.9, 3), 1e-3, 12)
        self.assertAlmostEqual(stage_dead(0.9, 3, 0.2), 0.2 + 0.8e-3, 12)
        self.assertEqual(stage_dead(0.5, 5, 1.0), 1.0)

    def test_binom_cdf_sums_to_one(self):
        self.assertAlmostEqual(binom_cdf(40, 40, 0.13), 1.0, 12)
        self.assertAlmostEqual(binom_cdf(10, 0, 0.1), 0.9 ** 10, 12)

    def test_no_skip_is_product(self):
        q = stage_dead(0.9, 2)
        self.assertAlmostEqual(p_ok(30, q, 0), (1 - q) ** 30, 12)

    def test_skip_monotone(self):
        v = [p_ok(50, 0.02, s) for s in range(6)]
        self.assertTrue(all(x < y for x, y in zip(v, v[1:])))

    def test_yield_bounds(self):
        self.assertAlmostEqual(useful_yield(20, 0.05, 20, 0.0), 1.0, 12)
        self.assertLess(useful_yield(20, 0.05, 3, 0.2), p_ok(20, 0.05, 3))

    def test_min_replicas_meets_target_and_minimal(self):
        r = min_replicas(48, 0.9, 0, 1e-2)
        self.assertLessEqual(1 - p_ok(48, stage_dead(0.9, r), 0), 1e-2)
        self.assertGreater(1 - p_ok(48, stage_dead(0.9, r - 1), 0), 1e-2)

    def test_skipping_reduces_replicas(self):
        self.assertLessEqual(min_replicas(48, 0.9, 3, 1e-3), min_replicas(48, 0.9, 0, 1e-3))

    def test_floor_blocks_replication(self):
        self.assertIsNone(min_replicas(48, 0.9, 0, 1e-2, rho=0.01))
        self.assertIsNotNone(min_replicas(48, 0.9, 3, 1e-2, rho=0.01))
        self.assertAlmostEqual(floor_success(48, 0.01, 0), 0.99 ** 48, 12)

    def test_approx_close(self):
        for s in (0, 2):
            ex = min_replicas(200, 0.8, s, 1e-3)
            self.assertLess(abs(r_approx(200, 0.8, s, 1e-3) - ex), 1.2)

    def test_simulation_matches_exact(self):
        L, a, r, s, rho = 20, 0.8, 2, 2, 0.01
        p, _ = simulate(L, a, r, s, rho, 40000, seed=3)
        self.assertLess(abs(p - p_ok(L, stage_dead(a, r, rho), s)), 0.01)

    def test_best_design_beats_no_skip(self):
        c0 = min(cost_per_yield(32, 0.9, r, 0, 0.1) for r in range(1, 30))
        c, r, s = best_design(32, 0.9, 0.1, smax=6)
        self.assertLessEqual(c, c0)


if __name__ == "__main__":
    unittest.main()
