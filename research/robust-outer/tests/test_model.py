import math, unittest
from robust_outer import *

A = [1.0, 0.25, 0.05]


class T(unittest.TestCase):
    def test_mean_recovers_noisy_local_sgd(self):
        eta, sg, N, H, al = 0.3, 0.8, 6, 5, 0.7
        m, v = bias_var(N, 0, ranks_mean(N))
        want = sum(0.5 * a * al * (worker_noise(eta, a, sg, H) / N) / (curvature(eta, a, H) * (2 - al * curvature(eta, a, H))) for a in A)
        self.assertAlmostEqual(floor(A, eta, sg, N, H, al, m, v), want, places=12)

    def test_order_statistic_moments(self):
        self.assertAlmostEqual(order_moments(2, 2)[0], 1 / math.sqrt(math.pi), places=6)     # E max of two normals
        self.assertAlmostEqual(order_moments(3, 2)[1], 0.4487 * 1 + 0, delta=2e-3)           # Var median of 3 = 0.4487
        self.assertAlmostEqual(order_moments(7, 4)[0], 0.0, places=9)

    def test_median_efficiency_tends_to_pi_over_2(self):
        self.assertAlmostEqual(efficiency(3, ranks_median(3)), 1.3463, delta=2e-3)
        self.assertAlmostEqual(efficiency(201, ranks_median(201)), math.pi / 2, delta=0.01)

    def test_trim_interpolates_between_mean_and_median(self):
        N = 15
        e = [efficiency(N, ranks_trimmed(N, t), mc=60000, seed=t) for t in (0, 2, 4, 7)]
        self.assertAlmostEqual(e[0], 1.0, delta=1e-9)
        self.assertTrue(e[0] < e[1] < e[2] < e[3])

    def test_median_bias_matches_asymptotic_and_is_bounded(self):
        m, _ = bias_var(101, 10, ranks_median(101))
        self.assertAlmostEqual(m, median_bias_asymptotic(10 / 101), delta=0.01)
        self.assertLess(m, 0.2)
        self.assertAlmostEqual(median_bias_asymptotic(0.001), 1.2533 * 0.001, delta=1e-5)
        self.assertTrue(math.isinf(bias_var(9, 5, ranks_median(9))[0]))                       # breakdown: f > (N-1)/2

    def test_trim_below_attackers_is_unbounded(self):
        self.assertTrue(math.isinf(bias_var(16, 3, ranks_trimmed(16, 2))[0]))
        self.assertTrue(math.isfinite(bias_var(16, 3, ranks_trimmed(16, 3))[0]))

    def test_bias_does_not_depend_on_alpha_and_variance_does(self):
        m, v = bias_var(15, 2, ranks_median(15))
        vl1, bl1 = floor_parts(A, 0.2, 1.0, 15, 4, 0.2, m, v)
        vl2, bl2 = floor_parts(A, 0.2, 1.0, 15, 4, 1.0, m, v)
        self.assertAlmostEqual(bl1, bl2, places=12)
        self.assertGreater(vl2, 2 * vl1)

    def test_stability_limit_unchanged(self):
        self.assertAlmostEqual(alpha_max(0.5), 4.0)

    def test_simulation_matches_exact(self):
        eta, sg, H, al, N = 0.4, 1.0, 3, 0.5, 9
        for kind, ranks, f, delta in (("median", ranks_median(9), 0, 0.0), ("median", ranks_median(9), 2, 1e6),
                                      ("trim2", ranks_trimmed(9, 2), 2, 1e6), ("mean", ranks_mean(9), 2, 1.5)):
            m, v = bias_var(N, f, ranks, delta, mc=200000)
            th = floor(A, eta, sg, N, H, al, m, v)
            emp = sim_floor(kind, A, eta, sg, N, f, delta, H, al, 60000, 500, seed=3)
            self.assertAlmostEqual(emp / th, 1.0, delta=0.06, msg=kind)

    def test_literal_local_steps_match_reduction(self):
        eta, sg, H, al, N = 0.3, 1.0, 3, 0.6, 5
        m, v = bias_var(N, 1, ranks_median(N))
        th = floor(A[:2], eta, sg, N, H, al, m, v)
        x2 = simulate_literal("median", A[:2], eta, sg, N, 1, 1e6, H, al, 12000, 300, seed=5)
        emp = sum(0.5 * a * y for a, y in zip(A[:2], x2))
        self.assertAlmostEqual(emp / th, 1.0, delta=0.08)

    def test_bias_shrinks_with_sync_interval(self):
        m, v = bias_var(15, 2, ranks_median(15))
        b = [floor_parts([0.25], 0.2, 1.0, 15, H, 0.1, m, v)[1] for H in (1, 4, 16, 64)]
        self.assertTrue(b[0] > b[1] > b[2] > b[3] * 0.999)


if __name__ == "__main__":
    unittest.main()
