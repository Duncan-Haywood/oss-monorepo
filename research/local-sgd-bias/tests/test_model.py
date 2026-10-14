import unittest
from local_sgd_bias import *

A = [4.0, 1.0, 0.25, 2.0]
C = [1.0, -2.0, 3.0, 0.5]


class T(unittest.TestCase):
    def test_h1_equal_a_is_gd_optimum(self):
        # H=1: w_i = eta a_i, fixed point is exactly the a-weighted optimum
        self.assertAlmostEqual(bias(A, C, 1, 0.05), 0.0, places=12)

    def test_bias_saturates_and_is_bounded(self):
        for H in (1, 2, 5, 20, 200, 2000):
            self.assertLessEqual(abs(bias(A, C, H, 0.05)), max(C) - min(C))
        self.assertAlmostEqual(bias(A, C, 5000, 0.05), saturation_bias(A, C), places=8)

    def test_fixed_point_is_fixed(self):
        eta, H = 0.05, 7
        x = fixed_point(A, C, H, eta)
        new = sum((1 / 4) * ((1 - eta * ai) ** H * x + wi * ci) for ai, ci, wi in zip(A, C, weights(A, H, eta)))
        self.assertAlmostEqual(new, x, places=12)

    def test_equal_curvature_no_bias(self):
        a = [1.0] * 4
        for H in (1, 5, 50):
            self.assertAlmostEqual(bias(a, C, H, 0.1), 0.0, places=12)

    def test_corrected_weights_unbiased(self):
        for H in (3, 30, 300):
            p = corrected_p(A, H, 0.05)
            self.assertAlmostEqual(bias(A, C, H, 0.05, p), 0.0, places=10)
        Hs = [3, 10, 40, 5]
        p = corrected_p(A, Hs, 0.05)
        self.assertAlmostEqual(bias(A, C, Hs, 0.05, p), 0.0, places=10)

    def test_monte_carlo_mean_and_variance(self):
        eta, H, s = 0.05, 6, 0.5
        mu, var = simulate(A, C, H, eta, s, rounds=60000, burn=200, seed=3)
        self.assertAlmostEqual(mu, fixed_point(A, C, H, eta), delta=0.02)
        self.assertAlmostEqual(var / stationary_var(A, H, eta, s), 1.0, delta=0.05)

    def test_inflation_moves_towards_attacker(self):
        d = inflate_gain(A, C, 3, 0.05, 1, 200)   # worker 1 has c=-2, the lowest
        self.assertLess(d, 0)
        self.assertGreater(inflate_gain(A, C, 3, 0.05, 2, 200), 0)  # worker 2 has c=3, the highest

    def test_best_H_respects_tolerance(self):
        H, t = best_H(A, C, 0.05, 1.0, 20.0, tol=0.05, Hmax=300)
        self.assertLessEqual(abs(bias(A, C, H, 0.05)), 0.05)


if __name__ == "__main__":
    unittest.main()
