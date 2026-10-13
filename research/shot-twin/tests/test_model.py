import math
import random
import unittest

from shot_twin.model import (pmf, cdf, phi, log_mean, arith_mean, sqrt_mean, count_threshold, real_error, best_m,
                             twin_error, matched_var, real_error_rule, sample_error)


class T(unittest.TestCase):
    def test_pmf_sums_to_one(self):
        self.assertAlmostEqual(cdf(400, 30.0), 1.0, places=12)

    def test_error_vs_simulation(self):
        rng = random.Random(3)
        m = count_threshold(log_mean(4, 12))
        self.assertAlmostEqual(sample_error(m, 4, 12, 40000, rng), real_error(m, 4, 12), delta=0.004)

    def test_log_mean_rule_is_bayes(self):
        for a, b in ((1, 5), (4, 12), (10, 30), (25.5, 60.3), (2, 3)):
            self.assertAlmostEqual(real_error_rule(log_mean, a, b), real_error(best_m(a, b), a, b), places=12)

    def test_mean_ordering(self):
        for a, b in ((1, 5), (4, 12), (10, 30)):
            self.assertLess(log_mean(a, b), sqrt_mean(a, b))
            self.assertLess(sqrt_mean(a, b), arith_mean(a, b))
            self.assertAlmostEqual(sqrt_mean(a, b), 0.5 * (arith_mean(a, b) + math.sqrt(a * b)), places=12)

    def test_arithmetic_rule_never_better(self):
        for a, b in ((1, 5), (4, 12), (10, 30), (50, 90)):
            self.assertGreaterEqual(real_error_rule(arith_mean, a, b), real_error_rule(log_mean, a, b) - 1e-15)

    def test_twin_error_matches_gaussian_formula(self):
        self.assertAlmostEqual(twin_error(4, 12, 4.0), phi(-2.0), places=12)

    def test_bright_scene_limit(self):
        # large counts: Poisson -> Gaussian, thresholds converge in relative terms
        a, b = 1000.0, 1100.0
        self.assertLess(abs(log_mean(a, b) - arith_mean(a, b)) / arith_mean(a, b), 1e-3)


if __name__ == "__main__":
    unittest.main()
