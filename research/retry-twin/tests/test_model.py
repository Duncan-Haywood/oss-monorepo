import math, random, unittest
from retry_twin import *


class M(unittest.TestCase):
    def test_real_fail_is_product_and_reduces_to_twin(self):
        a, b = 2.4, 1.6
        s = 1.0
        for k in range(30):
            self.assertAlmostEqual(real_fail(a, b, k), s, places=12)
            s *= (b + k) / (a + b + k)
        p = 0.6
        a, b = beta_params(p, 1e-6)
        self.assertAlmostEqual(real_fail(a, b, 5), twin_fail(p, 5), places=4)

    def test_beta_params_mean_and_correlation(self):
        a, b = beta_params(0.6, 0.2)
        self.assertAlmostEqual(a / (a + b), 0.6)
        self.assertAlmostEqual(1 / (a + b + 1), 0.2)

    def test_monte_carlo_matches_exact(self):
        rng = random.Random(3)
        a, b = beta_params(0.6, 0.2)
        n = 100000
        xs = [sample_attempts(a, b, rng, 40) for _ in range(n)]
        for k in (1, 3, 8, 20):
            emp = sum(x > k for x in xs) / n
            se = math.sqrt(real_fail(a, b, k) * (1 - real_fail(a, b, k)) / n)
            self.assertLess(abs(emp - real_fail(a, b, k)), 4 * se)

    def test_expected_attempts_closed_form(self):
        for a, b in ((2.4, 1.6), (0.6, 0.4), (5.0, 3.0)):
            for K in (0, 1, 7, 50):
                self.assertAlmostEqual(expected_attempts(a, b, K), sum(real_fail(a, b, k) for k in range(K)), places=9)

    def test_budgets_are_minimal_and_tail_law(self):
        a, b = beta_params(0.6, 0.2)
        for d in (0.1, 0.01, 0.001):
            k = real_budget(a, b, d)
            self.assertLessEqual(real_fail(a, b, k), d)
            self.assertGreater(real_fail(a, b, k - 1), d)
            kt = twin_budget(0.6, d)
            self.assertLessEqual(twin_fail(0.6, kt), d)
            self.assertGreater(twin_fail(0.6, kt - 1), d)
        self.assertLess(abs(asym_budget(a, b, 1e-6) / real_budget(a, b, 1e-6) - 1), 0.02)

    def test_best_cap_is_argmax_of_value(self):
        for a, b, w, c in ((2.4, 1.6, 10, 1), (0.6, 0.4, 10, 1), (11.4, 7.6, 10, 1), (2.4, 1.6, 3, 1), (2.4, 1.6, 50, 1)):
            vals = [value(a, b, K, w, c) for K in range(0, 400)]
            self.assertAlmostEqual(vals[best_cap(a, b, w, c)], max(vals), places=9)

    def test_twin_value_matches_independent_limit(self):
        p = 0.6
        a, b = beta_params(p, 1e-7)
        for K in (1, 4, 9):
            self.assertAlmostEqual(value(a, b, K, 10, 1), twin_value(p, K, 10, 1), places=3)

    def test_pair_moment_fit_recovers_parameters(self):
        rng = random.Random(5)
        a, b = beta_params(0.6, 0.2)
        pairs = [sample_pair(a, b, rng) for _ in range(200000)]
        p, rho = fit_pair_moments(pairs)
        self.assertLess(abs(p - 0.6), 0.005)
        self.assertLess(abs(rho - 0.2), 0.01)


if __name__ == "__main__":
    unittest.main()
