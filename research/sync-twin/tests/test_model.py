import math, random, unittest
from sync_twin import *


def simulate(a, b, s2, ell, delta, s, w, reps, seed):
    """Monte Carlo fused MSE with a random-Fourier-feature signal (kernel exact in expectation for any feature count)."""
    rng = random.Random(seed)
    K = 8
    tot = 0.0
    for _ in range(reps):
        om = [rng.gauss(0, 1.0 / ell) for _ in range(K)]
        ph = [rng.uniform(0, 2 * math.pi) for _ in range(K)]
        amp = math.sqrt(2.0 * s2 / K)
        x = lambda t: amp * sum(math.cos(o * t + p) for o, p in zip(om, ph))
        u = delta + rng.gauss(0, s)
        yA = x(0.0) + rng.gauss(0, math.sqrt(a))
        yB = x(-u) + rng.gauss(0, math.sqrt(b))
        tot += (w * yA + (1 - w) * yB - x(0.0)) ** 2
    return tot / reps


class M(unittest.TestCase):
    def test_timing_var_limits(self):
        self.assertEqual(timing_var(1.0, 1.0, 0.0, 0.0), 0.0)
        self.assertAlmostEqual(timing_var(1.0, 1.0, 1e-3, 0.0), 1e-6, places=9)   # ~ s2 delta^2/ell^2
        self.assertAlmostEqual(timing_var(1.0, 1.0, 1e9, 0.0), 2.0)                # decorrelated: 2 s2
        self.assertAlmostEqual(timing_var(2.0, 0.5, 0.0, 1e6), 4.0, places=3)

    def test_small_error_adds_in_quadrature(self):
        g1 = timing_var(1.0, 1.0, 0.03, 0.04)
        g2 = 0.03 ** 2 + 0.04 ** 2
        self.assertAlmostEqual(g1 / g2, 1.0, delta=0.005)

    def test_timing_var_matches_numerical_integral(self):
        s2, ell, d, s = 1.3, 0.7, 0.4, 0.3
        n, lim, tot = 4001, 8.0, 0.0
        for i in range(n):
            j = -lim * s + 2 * lim * s * i / (n - 1)
            dens = math.exp(-j * j / (2 * s * s)) / (s * math.sqrt(2 * math.pi))
            tot += dens * 2 * s2 * (1 - math.exp(-(d + j) ** 2 / (2 * ell * ell))) * (2 * lim * s / (n - 1))
        self.assertAlmostEqual(timing_var(s2, ell, d, s), tot, places=5)

    def test_fused_mse_matches_simulation(self):
        a, b, s2, ell, delta, s = 0.01, 0.04, 1.0, 1.0, 0.1, 0.05
        g = timing_var(s2, ell, delta, s)
        for w in (twin_weight(a, b), 0.5):
            sim = simulate(a, b, s2, ell, delta, s, w, 200000, 3)
            self.assertAlmostEqual(sim / fused_mse(w, a, b, g), 1.0, delta=0.03)

    def test_twin_weight_is_optimal_at_g0_and_claim(self):
        a, b = 0.02, 0.05
        self.assertAlmostEqual(real_mse_twin_weight(a, b, 0.0), twin_claim(a, b))
        self.assertAlmostEqual(opt_weight(a, b, 0.0), twin_weight(a, b))

    def test_excess_ratio_formula_and_optimal_mse(self):
        a, b, g = 0.01, 0.04, 0.02
        self.assertAlmostEqual(excess_ratio(a, b, g), 1 + a * g / (b * (a + b)))
        self.assertAlmostEqual(opt_mse(a, b, g), fused_mse(opt_weight(a, b, g), a, b, g))
        for w in [i / 100 for i in range(101)]:
            self.assertLessEqual(opt_mse(a, b, g), fused_mse(w, a, b, g) + 1e-15)

    def test_breakeven_is_equal_to_sensor_a_alone(self):
        a, b = 0.03, 0.02
        self.assertAlmostEqual(real_mse_twin_weight(a, b, breakeven_g(a, b)), a)
        self.assertLess(real_mse_twin_weight(a, b, 0.5 * breakeven_g(a, b)), a)
        self.assertGreater(real_mse_twin_weight(a, b, 2 * breakeven_g(a, b)), a)

    def test_budget_g(self):
        a, b, eps = 0.01, 0.04, 0.1
        self.assertAlmostEqual(excess_ratio(a, b, budget_g(a, b, eps)), 1 + eps)

    def test_rms_roundtrip(self):
        self.assertAlmostEqual(g_to_rms(rms_to_g(0.3, 1.0, 0.5), 1.0, 0.5), 0.3)
        self.assertEqual(g_to_rms(2.5, 1.0, 1.0), math.inf)

    def test_randomizing_correct_range_is_optimal_and_wrong_is_worse(self):
        a, b, g = 0.01, 0.04, 0.05
        best = wrong_range_mse(a, b, g, g)
        self.assertAlmostEqual(best, opt_mse(a, b, g))
        for gr in (0.0, 0.01, 0.2, 1.0):
            self.assertGreater(wrong_range_mse(a, b, g, gr), best)


if __name__ == "__main__":
    unittest.main()
