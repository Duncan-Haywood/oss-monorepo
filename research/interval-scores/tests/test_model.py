import math, random, unittest
from interval_scores import *


class T(unittest.TestCase):
    def test_zero_at_quantiles_positive_elsewhere(self):
        for kind in ("normal", "cauchy"):
            z = quantile(0.95, kind)
            self.assertAlmostEqual(regret(-z, z, 0.1, kind), 0, 9)
            for l, u in [(-z * .5, z), (-z, z * 1.7), (-z + .3, z + .3), (-3 * z, 3 * z)]:
                self.assertGreater(regret(l, u, 0.1, kind), 0)

    def test_regret_matches_score_difference_by_quadrature(self):
        for kind in ("normal", "cauchy"):
            z = quantile(0.95, kind)
            m, _ = paired_moments((-1.4 * z, 1.4 * z), (-z, z), 0.1, kind)
            self.assertAlmostEqual(m, scale_regret(1.4, 0.1, kind), 3)

    def test_optimal_score(self):
        z = quantile(0.95)
        m1 = sum(score(-z, z, (i + .5) / 1000 * 16 - 8, 0.1) * pdf((i + .5) / 1000 * 16 - 8) * 16 / 1000 for i in range(1000))
        self.assertAlmostEqual(m1, optimal_score(0.1), 3)

    def test_curvature(self):
        d = 1e-3
        self.assertAlmostEqual(shift_regret(d, 0.1) / (curvature(0.1) * d * d), 1, 3)

    def test_quantile(self):
        self.assertAlmostEqual(quantile(0.975), 1.959964, 5)
        self.assertAlmostEqual(cdf(quantile(0.9, "cauchy"), "cauchy"), 0.9, 12)

    def test_coverage_n(self):
        self.assertGreater(coverage_n(0.1, 0.2), 0)

    def test_simulated_regret_cauchy(self):
        rng = random.Random(1)
        z = quantile(0.95, "cauchy")
        a, b = (-0.6 * z, 0.6 * z), (-z, z)
        n = 200000
        ds = [score(*a, y, 0.1) - score(*b, y, 0.1) for y in (math.tan(math.pi * (rng.random() - .5)) for _ in range(n))]
        mean = sum(ds) / n
        se = math.sqrt(sum((d - mean) ** 2 for d in ds) / n / n)
        self.assertLess(abs(mean - scale_regret(0.6, 0.1, "cauchy")), 4 * se)


if __name__ == "__main__":
    unittest.main()
