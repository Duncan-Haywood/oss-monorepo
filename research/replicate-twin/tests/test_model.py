import math, random, unittest
from replicate_twin import *


class M(unittest.TestCase):
    def test_t_quantiles_known_values(self):
        self.assertAlmostEqual(t_quant(0.975, 1), 12.7062, places=3)
        self.assertAlmostEqual(t_quant(0.975, 9), 2.2622, places=3)
        self.assertAlmostEqual(t_quant(0.975, 29), 2.0452, places=3)

    def test_coverage_unbiased_is_nominal(self):
        for r in (2, 5, 20):
            self.assertAlmostEqual(coverage(2000, r, 0.9, 0.0, 0), 0.95, places=4)

    def test_coverage_falls_with_bias(self):
        c = [coverage(2000, 20, 0.95, 3.0, d) for d in (0, 10, 30, 60)]
        self.assertTrue(all(a < b for a, b in zip(c, c[1:])))
        self.assertLess(c[0], 0.5)

    def test_mse_bias_variance_decomposition(self):
        N, r, phi, delta, d = 600, 6, 0.8, 2.0, 5
        self.assertAlmostEqual(rep_mse(N, r, phi, delta, d),
                               ar1_bias(100, phi, delta, d) ** 2 + ar1_var(100, phi, d) / r, places=14)

    def test_var_matches_covariance_sum(self):
        n, d, phi = 14, 3, 0.7
        idx = range(d, n)
        tot = sum(phi ** abs(s - t) * (1 - phi ** (2 * min(s, t))) for s in idx for t in idx)
        self.assertAlmostEqual(ar1_var(n, phi, d), tot / (n - d) ** 2, places=13)

    def test_single_run_mse_is_minimal(self):
        N, phi, delta = 4000, 0.95, 3.0
        m1 = best_d(N, 1, phi, delta)[1]
        for r in (2, 5, 20):
            self.assertGreater(best_d(N, r, phi, delta)[1], m1)

    def test_half_width_matches_simulation(self):
        rng = random.Random(3)
        N, r, phi, d = 400, 5, 0.7, 4
        n = N // r
        t = t_quant(0.975, r - 1)
        hw = [rep_ci([sum(ar1_from(phi, n, rng, 0.0)[d:]) / (n - d) for _ in range(r)], t)[1] for _ in range(20000)]
        # the simulated run starts deterministically at 0 (delta=0), which is the case ar1_var covers
        self.assertAlmostEqual(sum(hw) / len(hw), half_width(N, r, phi, d), delta=0.05 * half_width(N, r, phi, d))

    def test_coverage_matches_simulation(self):
        rng = random.Random(4)
        N, r, phi, delta, d = 300, 6, 0.9, 3.0, 8
        n, t = N // r, t_quant(0.975, r - 1)
        hit, reps = 0, 20000
        for _ in range(reps):
            m, h = rep_ci([sum(ar1_from(phi, n, rng, delta)[d:]) / (n - d) for _ in range(r)], t)
            hit += abs(m) <= h
        self.assertAlmostEqual(hit / reps, coverage(N, r, phi, delta, d), delta=0.012)

    def test_min_d_valid_reaches_floor(self):
        d = min_d_valid(1000, 10, 0.9, 3.0)
        self.assertGreaterEqual(coverage(1000, 10, 0.9, 3.0, d), 0.94)
        self.assertLess(coverage(1000, 10, 0.9, 3.0, d - 1), 0.94)


if __name__ == "__main__":
    unittest.main()
