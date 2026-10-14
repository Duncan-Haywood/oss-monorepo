import math
import unittest

from slosh_twin.model import (Tank, bang_bang_accel, min_time, residual_formula, residual, slosh_trajectory, simulate_two_mass,
                              null_times, window_halfwidth, planned_time, planned_residual, smallest_safe_order,
                              first_unsafe_order_fixed_accel, envelope_time, order_estimate, fastest_safe_time)

D = 3.0


class T(unittest.TestCase):
    def test_frequency_and_fill(self):
        t = Tank()
        self.assertAlmostEqual(t.w, math.pi, places=12)
        self.assertAlmostEqual(t.with_fill(0.5).w ** 2, t.kappa * (1 + 0.5 * 20 / 80), places=12)
        self.assertLess(t.with_fill(0.25).w, t.w)

    def test_closed_form_matches_exact_propagation(self):
        t = Tank()
        for Tm in (3.0, 4.9, 6.3, 7.1):
            self.assertAlmostEqual(residual(t, D, Tm), residual_formula(t.mu, bang_bang_accel(D, Tm), t.w, Tm), places=10)

    def test_nulls_have_zero_residual(self):
        t = Tank()
        for Tm in null_times(t.w, 4):
            self.assertLess(residual(t, D, Tm), 1e-12)

    def test_two_mass_rk4_matches_exact_and_com_is_rigid(self):
        for zeta in (0.0, 0.05):
            t = Tank(zeta=zeta)
            x1, xc, z, zd = simulate_two_mass(t, D, 4.9)
            self.assertAlmostEqual(xc, D, places=9)                  # the rigid twin is exact for the centre of mass
            self.assertAlmostEqual(z, slosh_trajectory(t, D, 4.9)[2], places=7)
            if zeta == 0:
                self.assertAlmostEqual(math.hypot(z, zd / t.w), slosh_trajectory(t, D, 4.9)[1], places=6)

    def test_damping_reduces_residual(self):
        for Tm in (4.9, 6.0, 7.0):
            self.assertLess(residual(Tank(zeta=0.05), D, Tm), residual(Tank(), D, Tm))

    def test_min_time(self):
        self.assertAlmostEqual(bang_bang_accel(D, min_time(D, 0.5)), 0.5, places=12)

    def test_window(self):
        t = Tank()
        Tn = null_times(t.w, 1)[0]
        a0 = bang_bang_accel(D, Tn)
        h = window_halfwidth(0.01, t.mu, a0, t.w)
        # the window is exact at fixed a0: residual at the edge equals tol
        self.assertAlmostEqual(residual_formula(t.mu, a0, t.w, Tn + h), 0.01, places=10)

    def test_planned_residual_matches_exact(self):
        t = Tank().with_fill(0.5)
        for n in (1, 2, 4):
            self.assertAlmostEqual(planned_residual(t, math.pi, D, n), residual(t, D, planned_time(math.pi, n)), places=10)
        self.assertLess(planned_residual(Tank(), math.pi, D, 3), 1e-12)

    def test_order_threshold_at_fixed_accel(self):
        w0 = Tank().w
        for f in (0.9, 0.75, 0.5, 0.25):
            t = Tank().with_fill(f)
            eps = t.w / w0 - 1
            est = order_estimate(0.01, t.mu, 0.5, t.w, eps)
            self.assertEqual(first_unsafe_order_fixed_accel(t, w0, 0.5, 0.01), int(math.floor(est)) + 1)

    def test_stale_calibration_costs_time(self):
        t = Tank().with_fill(0.25)
        ns = smallest_safe_order(t, math.pi, D, 0.01, 0.5)
        nr = smallest_safe_order(t, t.w, D, 0.01, 0.5)
        self.assertGreater(planned_time(math.pi, ns), 3 * planned_time(t.w, nr))
        self.assertEqual(smallest_safe_order(Tank(), math.pi, D, 0.01, 0.5), 2)        # a0 <= a_max excludes n = 1

    def test_envelope_bounds_every_move(self):
        t = Tank().with_fill(0.5)
        Te = envelope_time(t, D, 0.01)
        for Tm in (Te, Te + 0.37, Te + 1.9, Te + 5.1):
            self.assertLessEqual(residual(t, D, Tm), 0.01 + 1e-12)

    def test_fastest_safe_time_not_below_twin(self):
        t = Tank()
        self.assertGreater(fastest_safe_time(t, D, 0.5, 0.01), min_time(D, 0.5))


if __name__ == "__main__":
    unittest.main()
