import math
import random
import unittest

from gate_twin.model import (Phi, z_of_alpha, mixture, gain, accept_prob, mse_update, inlier_reject, outlier_accept,
                             worst_kappa, best_z, sample_mse, steady_prior, lockout_formula, INF)


def quad_mse(P, comps, K, c, n=20000):
    """Numerical integration over nu (midpoint, split at the gate edge) of the conditional error, independent of the closed forms."""
    tot = 0.0
    for w, R in comps:
        S = P + R
        lim = 12.0 * math.sqrt(S)
        beta, cv = P / S, P * R / S
        c_ = min(c, lim)
        for lo, hi, k in ((-lim, -c_, 0.0), (-c_, c_, K), (c_, lim, 0.0)):
            h = (hi - lo) / n
            for i in range(n):
                nu = lo + (i + 0.5) * h
                dens = math.exp(-nu * nu / (2 * S)) / math.sqrt(2 * math.pi * S)
                tot += w * dens * (((beta - k) * nu) ** 2 + cv) * h
    return tot


class T(unittest.TestCase):
    def test_z(self):
        self.assertAlmostEqual(z_of_alpha(0.05), 1.959964, places=5)
        self.assertAlmostEqual(z_of_alpha(0.01), 2.575829, places=5)

    def test_ungated_matches_kalman_formula(self):
        P, R = 1.0, 1.0
        K = gain(P, R)
        self.assertAlmostEqual(mse_update(P, mixture(0.0, 1, R), K, INF), P * R / (P + R), places=12)

    def test_infinite_gate_equals_huge_gate(self):
        P, K = 1.0, 0.5
        comps = mixture(0.1, 8)
        self.assertAlmostEqual(mse_update(P, comps, K, INF), mse_update(P, comps, K, 1e6), places=9)

    def test_zero_gate_leaves_prior(self):
        self.assertAlmostEqual(mse_update(2.0, mixture(0.1, 8), 0.5, 0.0), 2.0, places=12)

    def test_zero_gain_leaves_prior(self):
        self.assertAlmostEqual(mse_update(2.0, mixture(0.1, 8), 0.0, 1.5), 2.0, places=12)

    def test_matches_quadrature(self):
        for P, eps, kappa, K, c in ((1.0, 0.05, 10, 0.5, 2.5), (2.0, 0.2, 4, 0.3, 1.0), (0.5, 0.0, 1, 0.7, 0.8)):
            comps = mixture(eps, kappa)
            self.assertAlmostEqual(mse_update(P, comps, K, c), quad_mse(P, comps, K, c), places=5)

    def test_matches_monte_carlo(self):
        comps = mixture(0.05, 10)
        ex = mse_update(1.0, comps, 0.5, 2.576 * math.sqrt(2))
        mc = sample_mse(1.0, comps, 0.5, 2.576 * math.sqrt(2), 200000, random.Random(3))
        self.assertLess(abs(mc - ex) / ex, 0.02)

    def test_nominal_inlier_rejection_is_alpha(self):
        P, R, a = 1.0, 1.0, 0.01
        c = z_of_alpha(a) * math.sqrt(P + R)
        self.assertAlmostEqual(inlier_reject(P, R, c), a, places=9)
        self.assertAlmostEqual(accept_prob(P, mixture(0.0, 1, R), c), 1 - a, places=9)

    def test_outlier_accept_small_for_big_kappa(self):
        self.assertLess(outlier_accept(1.0, 1e4, 3.0), 0.03)

    def test_gating_helps_with_outliers_and_hurts_without(self):
        P, R = 1.0, 1.0
        K = gain(P, R)
        c = z_of_alpha(0.01) * math.sqrt(P + R)
        clean, dirty = mixture(0.0, 1), mixture(0.05, 10)
        self.assertGreater(mse_update(P, clean, K, c), mse_update(P, clean, K, INF))
        self.assertLess(mse_update(P, dirty, K, c), mse_update(P, dirty, K, INF))

    def test_gated_worst_kappa_finite_ungated_unbounded(self):
        P, R, K = 1.0, 1.0, 0.5
        c = z_of_alpha(0.01) * math.sqrt(P + R)
        k, v = worst_kappa(P, 0.05, R, K, c, hi=1e4)
        self.assertLess(k, 100)
        self.assertGreater(mse_update(P, mixture(0.05, 1e4), K, INF), 100 * v)

    def test_best_z_beats_twin_gate_in_real(self):
        P, R = 1.0, 1.0
        K = gain(P, R)
        comps = mixture(0.05, 10)
        z, v = best_z(P, comps, K, R)
        self.assertLessEqual(v, mse_update(P, comps, K, z_of_alpha(0.01) * math.sqrt(2)) + 1e-12)

    def test_lockout_monotone_and_zero_for_small_jump(self):
        Q, R = 0.01, 1.0
        Pss = steady_prior(Q, R)
        self.assertEqual(lockout_formula(1.0, 2.576, Q, R, Pss), 0)
        self.assertLess(lockout_formula(5.0, 2.576, Q, R, Pss), lockout_formula(10.0, 2.576, Q, R, Pss))

    def test_steady_prior_fixed_point(self):
        Q, R = 0.05, 1.0
        P = steady_prior(Q, R)
        self.assertAlmostEqual(P, P - P * P / (P + R) + Q, places=12)


if __name__ == "__main__":
    unittest.main()
