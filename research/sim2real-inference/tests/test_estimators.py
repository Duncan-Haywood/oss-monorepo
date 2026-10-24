"""Reproduce the analytic results of twin-evaluation, twin-pilot and twin-certification from the one library."""
import math, random, unittest
from sim2real_inference import *

P = dict(mu=1.0, s=1.0, se=1.0, b=0.7, g=1.0, tau=1.0)


def draw(n, m, rng, p=P):
    R, T, X = [], [], []
    for _ in range(n):
        c = rng.gauss(0, 1)
        R.append(p["mu"] + p["s"] * c + p["se"] * rng.gauss(0, 1))
        T.append(p["mu"] + p["b"] + p["g"] * p["s"] * c + p["tau"] * rng.gauss(0, 1))
    for _ in range(m):
        X.append(p["mu"] + p["b"] + p["g"] * p["s"] * rng.gauss(0, 1) + p["tau"] * rng.gauss(0, 1))
    return R, T, X


def mc(method, n, m, reps, seed):
    rng = random.Random(seed)
    e = [estimate(method, *draw(n, m, rng)) for _ in range(reps)]
    mean = sum(e) / reps
    return mean, sum((x - mean) ** 2 for x in e) / (reps - 1)


class Estimators(unittest.TestCase):
    def test_every_method_unbiased_despite_twin_bias(self):
        for meth in LAMBDAS:
            mean, _ = mc(meth, 20, 180, 4000, 1)
            self.assertLess(abs(mean - P["mu"]), 0.04, meth)

    def test_twin_evaluation_variance_formula(self):
        sR, sT, cov, rho = moments(1, 1, 1, 1)
        self.assertAlmostEqual(rho, 0.5)
        self.assertAlmostEqual(moments(1, 1, 1, 0)[3], math.sqrt(0.5))
        for n, N in ((20, 20), (20, 200), (50, 500)):
            lam = cov / sT ** 2
            self.assertAlmostEqual(var_ppi(sR, sT, rho, n, N, lam), var_cv(sR, rho, n, N), places=12)

    def test_ppi_variance_matches_simulation(self):
        sR, sT, _, rho = moments(1, 1, 1, 1)
        _, v = mc("ppi", 30, 270, 6000, 2)
        self.assertLess(abs(v / var_ppi(sR, sT, rho, 30, 300) - 1), 0.07)

    def test_efficiency_order_cv_beats_ppi_when_twin_scale_differs(self):
        # twin with g = 2 (twice the sensitivity): PPI (lam = 1) is worse than real-only, CV and PPI++ are better
        p = dict(P, g=2.0)
        sR, sT, cov, rho = moments(1, 1, 2, 1)
        n, N = 30, 300
        v_real = sR ** 2 / n
        self.assertGreater(var_ppi(sR, sT, rho, n, N, 1.0), v_real)
        self.assertLess(var_cv(sR, rho, n, N), v_real)

    def test_ppi_pp_and_cv_close_to_optimal_variance(self):
        sR, _, _, rho = moments(1, 1, 1, 1)
        for meth in ("cv", "ppi_pp"):
            _, v = mc(meth, 40, 360, 5000, 3)
            self.assertLess(v / var_cv(sR, rho, 40, 400), 1.12, meth)

    def test_interval_coverage(self):
        rng = random.Random(5)
        for meth in ("ppi", "ppi_pp", "cv"):
            hit, reps = 0, 1200
            for _ in range(reps):
                lo, hi = interval(meth, *draw(30, 270, rng))
                hit += lo <= P["mu"] <= hi
            self.assertGreater(hit / reps, 0.92, meth)

    def test_twin_pilot_threshold(self):
        self.assertAlmostEqual(rho_star(0.05), 0.4262, places=3)       # twin-pilot: 0.426 at r = 0.05
        for rho in (0.5, 0.707, 0.9):
            self.assertAlmostEqual(rho_star(worth_threshold(rho)), rho, places=10)
        self.assertAlmostEqual(worth_threshold(0.5), 0.0718, places=3)  # twin-evaluation: 0.072
        self.assertAlmostEqual(worth_threshold(0.707), 0.172, places=2)

    def test_optimal_allocation(self):
        sR, rho, cR, cT, C = 1.4, 0.8, 10.0, 1.0, 1000.0
        n, N, V = optimal_alloc(C, cR, cT, sR, rho)
        self.assertAlmostEqual(n * cR + N * cT, C, places=8)
        self.assertAlmostEqual(V, var_cv(sR, rho, n, N), places=10)
        for f in (0.8, 1.25):
            self.assertGreater(var_cv(sR, rho, n * f, (C - n * f * cR) / cT), V)
        n0, N0, V0 = optimal_alloc(100, 1, 0.5, 1.0, 0.5)               # twin too dear: real-only
        self.assertEqual((n0, N0, V0), (100.0, 0.0, 0.01))

    def test_context_share_equivalence(self):
        for eta, faithful, noisefree in ((0.2, 1.04, 1.25), (0.5, 1.33, 2.0), (0.8, 2.78, 5.0)):
            self.assertAlmostEqual(1 / (1 - context_rho(eta, False) ** 2), faithful, delta=0.02 * faithful)
            self.assertAlmostEqual(1 / (1 - context_rho(eta, True) ** 2), noisefree, delta=0.02 * noisefree)


class Certification(unittest.TestCase):
    def test_zero_failure_299(self):
        self.assertEqual(n_zero_freq(0.01, 0.05), 299)                  # twin-certification
        self.assertEqual(c_freq(299, 0.01, 0.05), 0)
        self.assertEqual(c_freq(298, 0.01, 0.05), -1)

    def test_size_is_binomial_cdf_step(self):
        n, eps, delta = 400, 0.01, 0.05
        c = c_freq(n, eps, delta)
        self.assertLessEqual(false_cert(n, c, eps), delta)
        self.assertGreater(false_cert(n, c + 1, eps), delta)
        self.assertGreater(power(n, c, 0.002), power(n, c, 0.005))      # power falls as p rises toward eps


if __name__ == "__main__":
    unittest.main()
