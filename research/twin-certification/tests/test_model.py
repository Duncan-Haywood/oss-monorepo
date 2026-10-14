import math, random, unittest
from twin_certification import *


class T(unittest.TestCase):
    def test_betainc_matches_binomial_identity(self):
        # I_p(k+1, n-k) = P(Bin(n,p) >= k+1)
        for n, k, p in [(20, 3, 0.1), (200, 0, 0.01), (57, 10, 0.3), (1000, 5, 0.004)]:
            self.assertAlmostEqual(betainc(k + 1, n - k, p), 1 - binom_cdf(k, n, p), places=10)
        self.assertAlmostEqual(betainc(1, 1, 0.37), 0.37, places=12)
        self.assertAlmostEqual(betainc(0.5, 0.5, 0.5), 0.5, places=12)

    def test_zero_failure_sample_size(self):
        self.assertEqual(n_zero_freq(0.01, 0.05), 299)
        n = n_zero_freq(0.01, 0.05)
        self.assertLessEqual((1 - 0.01) ** n, 0.05)
        self.assertGreater((1 - 0.01) ** (n - 1), 0.05)
        self.assertEqual(c_freq(n, 0.01, 0.05), 0)
        self.assertEqual(c_freq(n - 1, 0.01, 0.05), -1)

    def test_uniform_prior_is_bayes_zero_failure(self):
        # Beta(1,1): P(p >= eps | 0, n) = (1-eps)^(n+1)
        for n in (10, 100):
            self.assertAlmostEqual(post_exceed(1, 1, n, 0, 0.02), 0.98 ** (n + 1), places=12)

    def test_freq_rule_is_valid_and_maximal(self):
        for n in (100, 300, 1000):
            c = c_freq(n, 0.01, 0.05)
            self.assertLessEqual(false_cert(n, c, 0.01), 0.05)
            self.assertGreater(false_cert(n, c + 1, 0.01), 0.05)

    def test_false_cert_is_worst_at_boundary_and_matches_simulation(self):
        n, c, eps = 150, 2, 0.02
        self.assertGreater(false_cert(n, c, eps), false_cert(n, c, 0.03))
        rng = random.Random(1)
        hits = sum(sum(rng.random() < eps for _ in range(n)) <= c for _ in range(20000))
        self.assertAlmostEqual(hits / 20000, false_cert(n, c, eps), delta=0.01)

    def test_bayes_prior_inflates_size_beyond_delta(self):
        eps, delta, n = 0.01, 0.05, 150
        a, b = power_prior(2, 20000, 0.05)
        c = c_bayes(n, a, b, eps, delta)
        self.assertGreater(c, c_freq(n, eps, delta))
        self.assertGreater(false_cert(n, c, eps), delta)

    def test_prior_averaged_error_at_most_delta(self):
        eps, delta = 0.02, 0.05
        for n, pt, m in [(50, 0.002, 100), (120, 0.01, 30), (300, 0.02, 10)]:
            a, b = prior(pt, m)
            c = c_bayes(n, a, b, eps, delta)
            self.assertLessEqual(prior_false_cert(n, c, a, b, eps), delta + 1e-12)

    def test_uniform_prior_zero_failure_n(self):
        # (1-eps)^(n+1) <= delta: one fewer trial than the exact zero-failure test, and it is not valid there
        n = n_zero_bayes(1, 1, 0.01, 0.05)
        self.assertEqual(n, n_zero_freq(0.01, 0.05) - 1)
        self.assertGreater(false_cert(n, 0, 0.01), 0.05)

    def test_power_prior_limits(self):
        self.assertEqual(power_prior(3, 1000, 0.0), (0.5, 0.5))
        a, b = power_prior(3, 1000, 1.0)
        self.assertEqual((a, b), (3.5, 997.5))

    def test_max_weight(self):
        eps, delta, n = 0.01, 0.05, 299
        w = max_weight(2, 20000, eps, delta, n, 0.06)
        self.assertGreater(w, 0.0)
        self.assertLess(w, 1.0)
        a, b = power_prior(2, 20000, w)
        self.assertLessEqual(false_cert(n, c_bayes(n, a, b, eps, delta), eps), 0.06)
        a, b = power_prior(2, 20000, min(1.0, w * 1.5 + 1e-3))
        self.assertGreater(false_cert(n, c_bayes(n, a, b, eps, delta), eps), 0.06)

    def test_heavier_twin_weight_never_lowers_threshold_for_optimistic_twin(self):
        eps, delta, n = 0.01, 0.05, 400
        cs = [c_bayes(n, *power_prior(2, 20000, w), eps, delta) for w in (0, 0.003, 0.01, 0.03, 0.1, 1)]
        self.assertEqual(cs, sorted(cs))


if __name__ == "__main__":
    unittest.main()
