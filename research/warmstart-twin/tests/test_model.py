import math, random, unittest
from warmstart_twin import *


class M(unittest.TestCase):
    def test_ar1_bias_var_match_direct_covariance(self):
        n, phi, a, d = 9, 0.6, 2.0, 3
        # E[x_k] = a phi^k ; Cov(x_j,x_k) for the deterministic start = (1-phi^(2 min)) phi^|j-k| (marginal variance 1)
        ks = range(d + 1, n + 1)
        m = len(ks)
        bias = sum(a * phi ** k for k in ks) / m
        var = sum((1 - phi ** (2 * min(j, k))) * phi ** abs(j - k) for j in ks for k in ks) / m ** 2
        self.assertAlmostEqual(ar1_start_bias(n, phi, a, d), bias, places=13)
        self.assertAlmostEqual(ar1_start_var(n, phi, 1.0, d), var, places=13)

    def test_ar1_stationary_limit(self):
        # a=0 and a long run: variance tends to the stationary formula (1+phi)/(1-phi)/n
        n, phi = 20000, 0.5
        self.assertAlmostEqual(n * ar1_start_var(n, phi), (1 + phi) / (1 - phi), delta=0.01)

    def test_ar1_monte_carlo(self):
        rng = random.Random(1)
        n, phi, a, reps = 30, 0.8, 2.0, 30000
        ms = [sum(ar1_path_from(phi, n, rng, a)) / n for _ in range(reps)]
        mean = sum(ms) / reps
        var = sum((x - mean) ** 2 for x in ms) / reps
        self.assertAlmostEqual(mean, ar1_start_bias(n, phi, a), delta=0.02)
        self.assertAlmostEqual(var, ar1_start_var(n, phi), delta=0.08 * ar1_start_var(n, phi))

    def test_best_deletion_helps_only_when_biased(self):
        d0, m0, mm = best_deletion(200, 0.9, 0.0)
        self.assertEqual(d0, 0)                       # a=0: deleting only adds variance
        d1, m1, mm1 = best_deletion(200, 0.9, 3.0)
        self.assertGreater(d1, 0)
        self.assertLess(m1, mm1)

    def test_state_tolerance_is_where_bias_equals_kappa_sd(self):
        n, phi, kappa = 500, 0.9, 0.25
        delta = ar1_state_tolerance(n, phi, kappa)
        b = ar1_start_bias(n, phi, delta)
        v = 1.0 / (n * n) * (n + 2 * sum((n - k) * phi ** k for k in range(1, n)))
        self.assertAlmostEqual(b, kappa * math.sqrt(v), places=12)

    def test_mm1_bias_const_series_equals_closed_form(self):
        for rho in (0.3, 0.5, 0.7):
            self.assertAlmostEqual(mm1_bias_series(rho), mm1_bias_const(rho), places=9)
        self.assertAlmostEqual(mm1_bias_const(0.5), 4.0)

    def test_mm1_bias_simulation_coupled(self):
        rng = random.Random(2)
        rho, n, reps = 0.5, 60, 20000
        tot = 0.0
        for _ in range(reps):
            e, s, w0 = 0.0, mm1_stationary_wait(rho, rng), None
            w0 = s
            we = 0.0
            ws = w0
            se = ss = 0.0
            for _ in range(n):
                se += we
                ss += ws
                x = rng.expovariate(1.0) - rng.expovariate(rho)
                we = max(0.0, we + x)
                ws = max(0.0, ws + x)
            tot += (se - ss) / n
        self.assertAlmostEqual(tot / reps, -mm1_bias_const(rho) / n, delta=0.006)

    def test_stationary_wait_mean(self):
        rng = random.Random(3)
        xs = [mm1_stationary_wait(0.5, rng) for _ in range(200000)]
        self.assertAlmostEqual(sum(xs) / len(xs), 1.0, delta=0.02)

    def test_n_star(self):
        rho = 0.5
        self.assertAlmostEqual(mm1_n_star(rho), 16.0 / 29.0, places=12)   # C^2/V = 16/29

    def test_mser_cuts_a_transient(self):
        rng = random.Random(4)
        xs = [10.0 * math.exp(-i / 40.0) + rng.gauss(0, 1) for i in range(1000)]
        self.assertGreater(mser_cut(xs), 50)


if __name__ == "__main__":
    unittest.main()
