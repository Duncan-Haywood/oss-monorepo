import random
import unittest
from fractions import Fraction as F
from statistics import pvariance
from multi_observation_elicitation import *

SUP = [F(-2), F(0), F(1), F(5)]
PR = [F(1, 5), F(3, 10), F(1, 4), F(1, 4)]


class T(unittest.TestCase):
    def test_pair_kernel_unbiased_exact(self):
        _, s2, _ = moments(SUP, PR)
        self.assertEqual(expected_kernel(pair_kernel, SUP, PR, 2), s2)

    def test_third_moment_and_degree_two_functionals_exact(self):
        mu, s2, _ = moments(SUP, PR)
        m3 = sum(p * (y - mu) ** 3 for y, p in zip(SUP, PR))
        self.assertEqual(expected_kernel(third_moment_kernel, SUP, PR, 3), m3)

    def test_sq_kernels_exact(self):
        mu, s2, _ = moments(SUP, PR)
        self.assertEqual(expected_kernel(sq_mean_kernel, SUP, PR, 2), mu ** 2)
        self.assertEqual(expected_kernel(sq_var_kernel, SUP, PR, 4), s2 ** 2)

    def test_score_is_strictly_proper(self):
        _, s2, _ = moments(SUP, PR)
        base = expected_score(s2, pair_kernel, SUP, PR, 2)
        for d in (F(-1), F(1, 3), F(2)):
            self.assertEqual(expected_score(s2 + d, pair_kernel, SUP, PR, 2) - base, d * d)

    def test_pair_kernel_variance_formula_exact(self):
        _, s2, m4 = moments(SUP, PR)
        mean = expected_kernel(pair_kernel, SUP, PR, 2)
        ex2 = expected_kernel(lambda y: pair_kernel(y) ** 2, SUP, PR, 2)
        self.assertEqual(ex2 - mean ** 2, var_pair_kernel(m4, s2))

    def test_sample_variance_variance_formula_exact(self):
        _, s2, m4 = moments(SUP, PR)
        for m in (2, 3, 4):
            k = lambda y, m=m: sum((v - sum(y) / m) ** 2 for v in y) / (m - 1)
            mean = expected_kernel(k, SUP, PR, m)
            ex2 = expected_kernel(lambda y: k(y) ** 2, SUP, PR, m)
            self.assertEqual(mean, s2)
            self.assertEqual(ex2 - mean ** 2, var_sample_variance(m4, s2, m))

    def test_degrees(self):
        d = min_observations()
        self.assertEqual((d["variance"], d["third central moment"], d["variance^2"]), (2, 3, 4))

    def test_gaussian_and_laplace_scale_constants(self):
        self.assertAlmostEqual(sd_rel_sigma_variance(3), 2 ** 0.5 / 2)
        from math import pi, sqrt
        self.assertAlmostEqual(sd_rel_sigma_gini(2 / sqrt(pi), 2), sqrt(pi / 2 - 1))
        self.assertAlmostEqual(sd_rel_sigma_gini(1.5, 4.0), sqrt(1.75) / 1.5)
        self.assertLess(sd_rel_sigma_gini(1.5, 4.0), sd_rel_sigma_variance(6))    # Laplace: Gini beats variance
        self.assertGreater(sd_rel_sigma_gini(2 / sqrt(pi), 2), sd_rel_sigma_variance(3))  # Gaussian: variance wins

    def test_detection_formula_power_gaussian(self):
        rho, N = 0.25, round(detection_pairs(0.25, 3.0))
        rng = random.Random(1)
        from statistics import NormalDist
        thr = 1 + NormalDist().inv_cdf(0.95) * (2 / N) ** 0.5   # report r=1 (sigma^2=1), flag if mean h exceeds it
        hits = trials = 0
        for _ in range(3000):
            s = (1 + rho) ** 0.5   # true sigma^2 = r (1+rho): the verifier under-reports by the relative amount rho
            ys = [rng.gauss(0, s) for _ in range(2 * N)]
            hits += disjoint_pair_score(ys) > thr; trials += 1
        se = (2 / N) ** 0.5   # normal approximation with the alternative's own sd (1+rho) se: slightly below the nominal 0.8
        approx = NormalDist().cdf((rho - NormalDist().inv_cdf(0.95) * se) / ((1 + rho) * se))
        self.assertAlmostEqual(hits / trials, approx, delta=0.04)
        self.assertGreater(hits / trials, 0.7)

    def test_pooled_beats_disjoint(self):
        rng = random.Random(2)
        a, b = [], []
        for _ in range(6000):
            ys = [rng.gauss(0, 1) for _ in range(20)]
            a.append(disjoint_pair_score(ys)); b.append(pooled_pair_score(ys))
        ratio = pvariance(a) / pvariance(b)
        self.assertAlmostEqual(ratio, 1.9, delta=0.1)  # exact for Gaussian: (2/10)/(2/19)

    def test_correlated_draws_bias(self):
        rng = random.Random(3)
        rho, n = 0.6, 200000
        tot = 0.0
        for _ in range(n):
            z, e1, e2 = rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1)
            y1 = rho ** 0.5 * z + (1 - rho) ** 0.5 * e1; y2 = rho ** 0.5 * z + (1 - rho) ** 0.5 * e2
            tot += (y1 - y2) ** 2 / 2
        self.assertAlmostEqual(tot / n, biased_target(1.0, rho), delta=0.01)


if __name__ == "__main__":
    unittest.main()
