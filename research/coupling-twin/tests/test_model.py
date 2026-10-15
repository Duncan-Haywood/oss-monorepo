import math
import random
import unittest

from coupling_twin.model import (spectral_radius, stable_gain_limit, simulate, steps_to_tol, fitted_diag_gain,
                                 real_rate_twin_fit, sample_logs, fit_diag, fit_full, mc_fit)


def tail_rate(k, c12, c21):
    xs = simulate(k, c12, c21, (1.0, 0.3), 400)
    return (xs[400] / xs[100]) ** (1 / 300)


class T(unittest.TestCase):
    def test_uncoupled_is_twin(self):
        self.assertAlmostEqual(spectral_radius(0.7, 0, 0), 0.3)
        self.assertEqual(stable_gain_limit(0, 0), 2.0)

    def test_symmetric_limit_shrinks(self):
        self.assertAlmostEqual(stable_gain_limit(0.25, 0.25), 2 / 1.25)
        self.assertLess(spectral_radius(1.59, 0.25, 0.25), 1)
        self.assertGreater(spectral_radius(1.61, 0.25, 0.25), 1)

    def test_antisymmetric_limit(self):
        self.assertAlmostEqual(stable_gain_limit(0.5, -0.5), 2 / 1.25)
        self.assertAlmostEqual(spectral_radius(2 / 1.25, 0.5, -0.5), 1.0)

    def test_no_stable_gain_when_coupling_dominates(self):
        self.assertEqual(stable_gain_limit(1.2, 1.2), 0.0)
        for k in (0.01, 0.5, 1.0):
            self.assertGreater(spectral_radius(k, 1.2, 1.2), 1)

    def test_simulation_matches_formula(self):
        for c12, c21 in ((0.3, 0.3), (0.3, -0.5), (0.4, 0.1)):
            for k in (0.5, 1.0, 1.3):
                self.assertAlmostEqual(tail_rate(k, c12, c21), spectral_radius(k, c12, c21), places=3)

    def test_deadbeat_twin_gain_rate_is_coupling(self):
        self.assertAlmostEqual(spectral_radius(1.0, 0.4, 0.4), 0.4)
        self.assertEqual(steps_to_tol(0.4, 1e-6), 16)

    def test_fitted_gain_and_rate(self):
        self.assertEqual(fitted_diag_gain(0.3, 0.5), 1.15)
        self.assertAlmostEqual(real_rate_twin_fit(0.3, 0.0), 0.3)
        c, r = 0.3, 0.5
        self.assertAlmostEqual(real_rate_twin_fit(c, r), c * (1 + r) / (1 + c * r))

    def test_ols_unbiased_for_fitted_gain(self):
        m, _, cm, _ = mc_fit(200, 0.3, 0.6, 0.5, 400)
        self.assertAlmostEqual(m, 1.18, delta=0.01)
        self.assertAlmostEqual(cm, 0.3, delta=0.01)

    def test_full_fit_variance_inflation(self):
        _, vd, _, vf = mc_fit(200, 0.3, 0.8, 0.5, 2000)
        self.assertAlmostEqual(vf / (0.25 / 200 / (1 - 0.64)), 1, delta=0.1)
        self.assertAlmostEqual(vd / ((0.25 + 0.09 * 0.36) / 200), 1, delta=0.1)  # diag fit: sigma^2 + c^2 (1-rho^2)

if __name__ == "__main__":
    unittest.main()
