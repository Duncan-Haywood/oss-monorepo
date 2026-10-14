import math, random, unittest
from doppler_twin import *


class M(unittest.TestCase):
    def test_no_contamination_median_is_pi_over_2(self):
        n = 201
        self.assertAlmostEqual(var_median_exact(n, 0.0, 5.0) * n, math.pi / 2, delta=0.02)
        self.assertAlmostEqual(var_median_asym(n, 0.0, 5.0) * n, math.pi / 2, places=12)

    def test_exact_median_matches_monte_carlo(self):
        rng = random.Random(3)
        va, vb, sa, sb = mc_var(51, 0.1, 10.0, 20000, rng)
        self.assertLess(abs(va - var_mean(51, 0.1, 10.0)), 4 * sa)
        self.assertLess(abs(vb - var_median_exact(51, 0.1, 10.0)), 4 * sb)

    def test_asymptotic_close_to_exact_at_moderate_n(self):
        self.assertAlmostEqual(var_median_asym(101, 0.1, 10.0) / var_median_exact(101, 0.1, 10.0), 1.0, delta=0.02)

    def test_claim_ratio_and_2d_geometry_cancels(self):
        self.assertAlmostEqual(cov_claim_ratio(0.1, 10.0), 11.0)
        r = ls2d_cov_ratio_mc(30, 0.1, 10.0, 20000, random.Random(5))
        self.assertAlmostEqual(r, 11.0, delta=0.6)

    def test_coverage_limits_and_monotone(self):
        self.assertAlmostEqual(coverage_mean(40, 1e-12, 5.0), 0.95, places=3)
        c = [coverage_mean(40, e, 10.0) for e in (0.01, 0.05, 0.1, 0.3)]
        self.assertTrue(all(a > b for a, b in zip(c, c[1:])))

    def test_coverage_matches_simulation(self):
        rng = random.Random(9)
        n, eps, tau, reps = 30, 0.1, 10.0, 40000
        hit = sum(abs(sum(sample(n, eps, tau, rng)) / n) <= 1.959963984540054 / math.sqrt(n) for _ in range(reps))
        p = coverage_mean(n, eps, tau)
        self.assertLess(abs(hit / reps - p), 4 * math.sqrt(p * (1 - p) / reps))

    def test_band_is_interval_and_crossover_is_on_its_edge(self):
        for tau in (3.0, 10.0):
            lo, hi = median_wins_band(tau, grid=4000)
            wins = [var_median_asym(1, i / 4000, tau) < var_mean(1, i / 4000, tau) for i in range(1, 4000)]
            first = wins.index(True)
            last = len(wins) - 1 - wins[::-1].index(True)
            self.assertTrue(all(wins[first:last + 1]))
            self.assertAlmostEqual(crossover_eps(tau), lo, delta=1 / 2000)
        self.assertIsNone(median_wins_band(1.0))
        self.assertIsNone(crossover_eps(1.0))

    def test_kurtosis_formula(self):
        rng = random.Random(1)
        x = sample(400000, 0.1, 10.0, rng)
        m2 = sum(t * t for t in x) / len(x)
        m4 = sum(t ** 4 for t in x) / len(x)
        self.assertAlmostEqual(m4 / m2 ** 2 - 3, excess_kurtosis(0.1, 10.0), delta=1.0)  # heavy tails: sample kurtosis is noisy, ~5% tolerance


if __name__ == "__main__":
    unittest.main()
