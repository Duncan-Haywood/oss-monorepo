import math, random, unittest
from runlength_twin import *


class T(unittest.TestCase):
    def test_bruteforce(self):
        for n in (1, 2, 5, 30):
            for rho in (0.0, 0.3, 0.81, 0.97):
                self.assertAlmostEqual(rel_var(n, rho), rel_var_bruteforce(n, rho), places=10)

    def test_n1_is_two(self):
        self.assertAlmostEqual(rel_var(1, 0.7), 2.0, places=12)

    def test_asymptote(self):
        rho = 0.5
        self.assertAlmostEqual(rel_var(10 ** 7, rho) * 10 ** 7, 2 * (1 + rho) / (1 - rho), places=4)

    def test_n_exact_is_minimal(self):
        for rho in (0.1, 0.6, 0.9):
            n = n_exact(0.05, rho)
            self.assertLessEqual(1.959964 * math.sqrt(rel_var(n, rho)), 0.05)
            self.assertGreater(1.959964 * math.sqrt(rel_var(n - 1, rho)), 0.05)
            self.assertLess(abs(n - n_asym(0.05, rho)) / n, 0.02)

    def test_sizing_ratio(self):
        self.assertAlmostEqual(sizing_ratio(0.4, 0.4), 1.0)
        self.assertGreater(sizing_ratio(0.8, 0.2), 1)
        self.assertLess(sizing_ratio(0.2, 0.8), 1)

    def test_coverage(self):
        self.assertAlmostEqual(coverage(500, 0.5, 0.5), 0.95, places=4)
        self.assertLess(coverage(500, 0.9, 0.3), 0.95)
        self.assertGreater(coverage(500, 0.3, 0.9), 0.95)

    def test_simulation_matches(self):
        ac, n = 0.7, 50
        sim = simulate_rel_var(ac, n, 20000, seed=3)
        self.assertLess(abs(sim / rel_var(n, ac * ac) - 1), 0.05)

    def test_closed_pole_and_gain(self):
        K = riccati_gain(0.9, 1.0, 1.0, 1.0)
        self.assertAlmostEqual(closed_pole(K, 0.9, 1.0), 0.9 - K)
        self.assertTrue(0 < K < 0.9)

    def test_pilot_rho_ar1(self):
        rng = random.Random(1)
        x, xs = 0.0, []
        for _ in range(20000):
            x = 0.6 * x + rng.gauss(0, 1)
            xs.append(x)
        self.assertAlmostEqual(pilot_rho(xs), 0.36, delta=0.03)

    def test_pilot_rho_negative_pole(self):
        rng = random.Random(2)
        x, xs = 0.0, []
        for _ in range(20000):
            x = -0.6 * x + rng.gauss(0, 1)
            xs.append(x)
        self.assertAlmostEqual(pilot_rho(xs), 0.36, delta=0.03)

    def test_bad_rho(self):
        with self.assertRaises(ValueError):
            rel_var(10, 1.0)


if __name__ == "__main__":
    unittest.main()
