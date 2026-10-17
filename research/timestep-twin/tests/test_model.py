import math, unittest
from timestep_twin import *


class M(unittest.TestCase):
    def test_closed_form_rho2_is_determinant(self):
        for m in METHODS:
            for h in (0.05, 0.3):
                for c in (0.3, 1.2):
                    Mx = step_matrix(m, h, 1.0, c)
                    self.assertAlmostEqual(Mx[0][0] * Mx[1][1] - Mx[0][1] * Mx[1][0], rho2_exact(m, h, 1.0, c), places=12)

    def test_implicit_is_resolvent_of_continuous_poles(self):
        h, k, c = 0.2, 1.0, 1.0
        lam = -c / 2 + 1j * math.sqrt(k - c * c / 4)
        z = eigs(step_matrix("implicit", h, k, c))[0]
        self.assertAlmostEqual(abs(z - 1 / (1 - h * lam)), 0.0, places=12)

    def test_twin_converges_to_exact_flow(self):
        for m in METHODS:
            self.assertAlmostEqual(equiv_sigma(m, 1e-4, 1.0, 1.0), 0.5, places=3)
            self.assertAlmostEqual(twin_overshoot(m, 1e-3, 1.0, 1.0), real_overshoot(1.0, 1.0), places=3)

    def test_real_closed_form_matches_rk4(self):
        for c in (0.4, 1.0, 1.6):
            self.assertAlmostEqual(real_overshoot(1.0, c), real_rk4_overshoot(1.0, c), places=4)
        self.assertEqual(real_overshoot(1.0, 2.5), 0.0)

    def test_zeta_overshoot_inverse(self):
        self.assertAlmostEqual(overshoot_of_zeta(zeta_of_overshoot(0.1)), 0.1, places=12)

    def test_first_order_damping_bias_and_sign_flip(self):
        h = 0.02
        for m in METHODS:
            for z in (0.3, 0.9):
                exact = equiv_sigma(m, h, 1.0, 2 * z)
                self.assertAlmostEqual(exact, sigma_first_order(m, h, 1.0, 2 * z), delta=5 * h * h)
        # implicit adds damping below zeta=1/sqrt2 and removes it above; explicit is the opposite
        self.assertGreater(equiv_sigma("implicit", 0.05, 1.0, 0.6) - 0.3, 0)
        self.assertLess(equiv_sigma("implicit", 0.05, 1.0, 1.8) - 0.9, 0)
        self.assertLess(equiv_sigma("explicit", 0.05, 1.0, 0.6) - 0.3, 0)
        self.assertGreater(equiv_sigma("explicit", 0.05, 1.0, 1.8) - 0.9, 0)
        self.assertGreater(equiv_sigma("semi-implicit", 0.05, 1.0, 1.8) - 0.9, 0)

    def test_explicit_divergence_threshold(self):
        self.assertGreater(spectral_radius("explicit", 0.5, 1.0, 0.4), 1.0)
        self.assertLess(spectral_radius("explicit", 0.5, 1.0, 0.6), 1.0)
        self.assertEqual(twin_overshoot("explicit", 0.5, 1.0, 0.4), math.inf)

    def test_tuning_hits_target_and_bias_is_first_order(self):
        for m in METHODS:
            c = tune_c(m, 0.1, 1.0, 0.10)
            self.assertAlmostEqual(twin_overshoot(m, 0.1, 1.0, c), 0.10, places=6)
        ex = [real_overshoot(1.0, tune_c("semi-implicit", h, 1.0, 0.10)) - 0.10 for h in (0.1, 0.05)]
        self.assertAlmostEqual(ex[0] / ex[1], 2.0, delta=0.1)
        # implicit/semi-implicit twins are optimistic, explicit conservative, at a 10% target
        self.assertGreater(real_overshoot(1.0, tune_c("implicit", 0.2, 1.0, 0.10)), 0.12)
        self.assertLess(real_overshoot(1.0, tune_c("explicit", 0.2, 1.0, 0.10)), 0.10)

    def test_richardson_improves_on_fixed_step(self):
        c = tune_c("implicit", 0.2, 1.0, 0.10)
        real = real_overshoot(1.0, c)
        self.assertLess(abs(richardson_overshoot("implicit", 0.05, 1.0, c) - real), 0.001)
        self.assertLess(abs(richardson_overshoot("implicit", 0.05, 1.0, c) - real), abs(twin_overshoot("implicit", 0.05, 1.0, c) - real))


if __name__ == "__main__":
    unittest.main()
