import random, unittest
from warmup_twin import *


class M(unittest.TestCase):
    def test_bias_no_discard(self):
        self.assertAlmostEqual(ar1_bias(10, 0.0, 2.0), 2.0 / 10)
        self.assertAlmostEqual(ar1_bias(10, 0.5, 1.0), sum(0.5 ** t for t in range(10)) / 10)

    def test_bias_with_discard(self):
        n, d, phi = 30, 7, 0.8
        direct = sum(phi ** t for t in range(d, n)) / (n - d)
        self.assertAlmostEqual(ar1_bias(n, phi, 1.0, d), direct, places=13)

    def test_var_matches_covariance_sum(self):
        n, d, phi = 12, 3, 0.7
        idx = range(d, n)
        tot = sum(phi ** abs(s - t) * (1 - phi ** (2 * min(s, t))) for s in idx for t in idx)
        self.assertAlmostEqual(ar1_var(n, phi, d), tot / (n - d) ** 2, places=13)

    def test_monte_carlo(self):
        rng = random.Random(1)
        n, d, phi, delta, reps = 25, 4, 0.8, 3.0, 40000
        ms = [sum(ar1_from(phi, n, rng, delta)[d:]) / (n - d) for _ in range(reps)]
        mean = sum(ms) / reps
        v = sum((m - mean) ** 2 for m in ms) / reps
        self.assertAlmostEqual(mean, ar1_bias(n, phi, delta, d), delta=0.02)
        self.assertAlmostEqual(v, ar1_var(n, phi, d), delta=0.05 * ar1_var(n, phi, d))

    def test_best_warmup_zero_when_start_is_stationary(self):
        d, _ = best_warmup(200, 0.9, 0.0)
        self.assertEqual(d, 0)
        d, _ = best_warmup(200, 0.9, 5.0)
        self.assertGreater(d, 0)

    def test_mm1_empty_start_is_optimistic(self):
        rng = random.Random(2)
        ms = [sum(mm1_waits(0.8, 200, rng)) / 200 for _ in range(4000)]
        self.assertLess(sum(ms) / len(ms), mm1_wait_mean(0.8) - 0.3)

    def test_mser_finds_planted_transient(self):
        rng = random.Random(3)
        xs = [10.0 * 0.97 ** t + rng.gauss(0, 0.5) for t in range(2000)]
        d = mser(xs)
        self.assertGreater(d, 50)
        self.assertLess(d, 1000)
        self.assertEqual(mser([rng.gauss(0, 1) for _ in range(500)]) < 250, True)


if __name__ == "__main__":
    unittest.main()
