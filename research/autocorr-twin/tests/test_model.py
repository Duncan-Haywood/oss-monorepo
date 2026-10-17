import math, random, unittest
from autocorr_twin import *


class M(unittest.TestCase):
    def test_iid_case(self):
        self.assertAlmostEqual(ar1_mean_var(50, 0.0), 1.0 / 50, places=14)
        self.assertAlmostEqual(naive_coverage(50, 0.0), 0.95, places=3)

    def test_mean_var_matches_covariance_sum(self):
        n, phi = 7, 0.6
        tot = sum(phi ** abs(i - j) for i in range(n) for j in range(n))
        self.assertAlmostEqual(ar1_mean_var(n, phi), tot / n ** 2, places=13)

    def test_inflation_limit(self):
        self.assertAlmostEqual(ar1_inflation(20000, 0.9), ar1_inflation_limit(0.9), delta=0.02)
        self.assertAlmostEqual(ar1_inflation_limit(0.9), 19.0)

    def test_ess_and_run_length(self):
        self.assertAlmostEqual(ess(100000, 0.5), 100000 / 3.0, delta=5)
        self.assertAlmostEqual(run_length(1.0, 0.1), 1.96 ** 2 / 0.01)

    def test_mean_var_monte_carlo(self):
        rng = random.Random(1)
        n, phi, reps = 40, 0.7, 20000
        ms = [sum(ar1_path(phi, n, rng)) / n for _ in range(reps)]
        v = sum(m * m for m in ms) / reps
        self.assertAlmostEqual(v, ar1_mean_var(n, phi), delta=0.06 * ar1_mean_var(n, phi))

    def test_mm1_moments(self):
        self.assertAlmostEqual(mm1_wait_mean(0.5), 1.0)
        self.assertAlmostEqual(mm1_wait_var(0.5), 3.0)
        self.assertAlmostEqual(mm1_asym_var(0.5), 29.0)
        rng = random.Random(2)
        ws = mm1_waits(0.5, 600000, rng, burn=5000)
        self.assertAlmostEqual(sum(ws) / len(ws), 1.0, delta=0.05)

    def test_mm1_asym_var_simulation(self):
        rng = random.Random(3)
        ws = mm1_waits(0.5, 2000000, rng, burn=5000)
        b, L = 100, 20000
        bm = [sum(ws[i * L:(i + 1) * L]) / L for i in range(b)]
        m = sum(bm) / b
        v = sum((x - m) ** 2 for x in bm) / (b - 1) * L
        self.assertAlmostEqual(v, mm1_asym_var(0.5), delta=0.2 * mm1_asym_var(0.5))

    def test_cis(self):
        xs = [float(i % 2) for i in range(3000)]
        m, h = batch_ci(xs, 30)
        self.assertAlmostEqual(m, 0.5)
        self.assertLess(h, 0.01)
        m, h = naive_ci(xs)
        self.assertAlmostEqual(m, 0.5)


if __name__ == "__main__":
    unittest.main()
