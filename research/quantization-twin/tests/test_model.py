import math, unittest
from quantization_twin import *


class M(unittest.TestCase):
    def test_no_quantization_matches_exact(self):
        a, Q, R = 0.9, 1.0, 1.0
        Ks = [0.3, opt_gain(a, Q, R), 0.8]
        sim = simulate_mse(Ks, a, Q, R, 0.0, 200000, seed=1)
        for K, s in zip(Ks, sim):
            self.assertAlmostEqual(s / mse(K, a, Q, R), 1.0, delta=0.03)

    def test_sheppard_gain_reduces_to_twin_at_zero_step(self):
        self.assertAlmostEqual(sheppard_gain(0.9, 1, 1, 0.0), opt_gain(0.9, 1, 1), places=12)

    def test_sheppard_gain_smaller_with_coarser_step(self):
        g = [sheppard_gain(0.9, 1, 1, D) for D in (0, 1, 2, 4)]
        self.assertTrue(all(g[i] > g[i + 1] for i in range(3)))

    def test_quantize_rounds_to_grid(self):
        self.assertEqual(quantize(0.74, 0.5), 0.5)
        self.assertEqual(quantize(0.76, 0.5), 1.0)
        self.assertEqual(quantize(-0.3, 0.5), -0.5)

    def test_sheppard_mse_formula_accurate_when_noise_dithers(self):
        a, Q, R, D = 0.9, 1.0, 1.0, 1.0   # D < sigma_v: quantization noise nearly white
        K = 0.5
        s = simulate_mse([K], a, Q, R, D, 300000, seed=2)[0]
        f = mse(K, a, Q, R + D * D / 12)
        self.assertAlmostEqual(s / f, 1.0, delta=0.05)

    def test_paired_simulation_deterministic(self):
        a = simulate_mse([0.4, 0.6], 0.9, 1, 1, 1.0, 2000, seed=5)
        b = simulate_mse([0.4, 0.6], 0.9, 1, 1, 1.0, 2000, seed=5)
        self.assertEqual(a, b)


if __name__ == "__main__":
    unittest.main()
