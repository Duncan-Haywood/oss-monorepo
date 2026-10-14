import itertools
import math
import random
import unittest

from ransac_twin.model import (comb_ratio, budget, betabinom_pmf, real_pmf, failure, twin_failure, real_budget,
                               sampled_failure)


class T(unittest.TestCase):
    def test_comb_ratio_enumeration(self):
        N, s = 7, 3
        for n_in in range(N + 1):
            good = sum(all(i < n_in for i in c) for c in itertools.combinations(range(N), s))
            self.assertAlmostEqual(comb_ratio(n_in, N, s), good / math.comb(N, s))

    def test_pmf_normalised_and_mean(self):
        pmf = real_pmf(50, 0.5, 4.0)
        self.assertAlmostEqual(sum(pmf), 1.0, places=12)
        self.assertAlmostEqual(sum(k * w for k, w in enumerate(pmf)), 25.0, places=9)

    def test_budget_textbook(self):
        # s=2, inlier fraction 0.5 -> q=0.25, p=0.99 -> ceil(log .01 / log .75) = 17
        self.assertEqual(budget(0.25, 0.99), 17)

    def test_large_kappa_is_binomial_and_point_mass_is_twin(self):
        N, s, K = 40, 2, 10
        binom = [math.comb(N, k) * 0.5 ** N for k in range(N + 1)]
        for a, b in zip(real_pmf(N, 0.5, 1e7), binom):
            self.assertAlmostEqual(a, b, places=6)
        point = [0.0] * (N + 1)
        point[20] = 1.0
        self.assertAlmostEqual(failure(K, N, s, point), twin_failure(K, N, s, 0.5), places=12)

    def test_variation_makes_budget_larger(self):
        N, s = 100, 2
        kt = real_budget(N, s, real_pmf(N, 0.5, 1e7), 0.99)
        kr = real_budget(N, s, real_pmf(N, 0.5, 3.0), 0.99)
        self.assertGreater(kr, kt)

    def test_failure_vs_sampler(self):
        N, s, K = 30, 2, 6
        rng = random.Random(1)
        n_in = 12
        mc = sum(sampled_failure(K, N, s, n_in, rng) for _ in range(20000)) / 20000
        self.assertAlmostEqual(mc, (1 - comb_ratio(n_in, N, s)) ** K, delta=0.01)


if __name__ == "__main__":
    unittest.main()
