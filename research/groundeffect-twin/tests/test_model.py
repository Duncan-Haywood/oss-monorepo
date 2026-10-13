import math
import unittest

from groundeffect_twin.model import (ge, dge, equilibrium, offset_approx, simulate_hold, poly_from_matrix, poly_roots,
                                     spectral_radius, gain_margin, real_margin, critical_height, max_gain_scale,
                                     simulate_delayed, G0)

Rr = 0.1


class T(unittest.TestCase):
    def test_ge_limits(self):
        self.assertAlmostEqual(ge(1e3, Rr), 1.0, places=7)
        self.assertAlmostEqual(ge(Rr / 2.0, Rr), 4.0 / 3.0, places=12)
        self.assertGreater(ge(0.1, Rr), ge(0.2, Rr))

    def test_dge_numeric(self):
        for z in (0.06, 0.1, 0.3):
            h = 1e-6
            num = (ge(z + h, Rr) - ge(z - h, Rr)) / (2 * h)
            self.assertAlmostEqual(dge(z, Rr), num, delta=1e-4 * abs(num))

    def test_equilibrium_root_and_twin(self):
        for zr in (0.06, 0.1, 0.3):
            ze = equilibrium(zr, 25.0, Rr)
            self.assertAlmostEqual(ge(ze, Rr) * (G0 + 25.0 * (zr - ze)), G0, places=9)
            self.assertGreater(ze, zr)
        self.assertEqual(equilibrium(0.1, 25.0, Rr, use_ge=False), 0.1)

    def test_offset_sim_matches_equilibrium(self):
        zr = 0.1
        z, v = simulate_hold(zr, zr, 25.0, 7.0, Rr, dt=0.0005, T=8.0)
        self.assertAlmostEqual(z, equilibrium(zr, 25.0, Rr), places=6)
        z, v = simulate_hold(zr, zr, 25.0, 7.0, Rr, dt=0.0005, T=8.0, use_ge=False)
        self.assertAlmostEqual(z, zr, places=9)

    def test_first_order_offset_close_at_large_height(self):
        zr = 0.3
        self.assertAlmostEqual(offset_approx(zr, 25.0, Rr), equilibrium(zr, 25.0, Rr) - zr, delta=2e-4)

    def test_roots_known_polynomial(self):
        # (x-1)(x+2)(x-3) = x^3 -2x^2 -5x +6
        r = sorted(x.real for x in poly_roots([1.0, -2.0, -5.0, 6.0]))
        for a, b in zip(r, (-2.0, 1.0, 3.0)):
            self.assertAlmostEqual(a, b, places=8)

    def test_charpoly_diag(self):
        c = poly_from_matrix([[2.0, 0.0], [0.0, 3.0]])
        self.assertAlmostEqual(c[1], -5.0)
        self.assertAlmostEqual(c[2], 6.0)

    def test_spectral_radius_no_delay_limit(self):
        # tiny dt: well damped loop stable, huge gain unstable
        self.assertLess(spectral_radius(25.0, 7.0, 0.0, 0.01), 1.0)
        self.assertGreater(spectral_radius(1e5, 7.0, 0.0, 0.05), 1.0)

    def test_margin_is_boundary(self):
        kp, kd, dt = 400.0, 28.0, 0.02
        m = gain_margin(kp, kd, dt)
        self.assertLess(spectral_radius(0.999 * m * kp, 0.999 * m * kd, 0.0, dt), 1.0)
        self.assertGreater(spectral_radius(1.001 * m * kp, 1.001 * m * kd, 0.0, dt), 1.0)

    def test_real_margin_below_twin_and_monotone(self):
        kp, kd, dt = 400.0, 28.0, 0.02
        twin = gain_margin(kp, kd, dt)
        ms = [real_margin(r * Rr, kp, kd, dt, Rr)[3] for r in (3.0, 1.5, 1.0, 0.7)]
        self.assertTrue(all(a > b for a, b in zip(ms, ms[1:])))
        self.assertLess(ms[0], twin)

    def test_critical_height_matches_nonlinear_sim(self):
        kp, kd, dt = 400.0, 28.0, 0.02
        zc = critical_height(kp, kd, dt, Rr)
        self.assertIsNotNone(zc)
        f_in, _ = simulate_delayed(1.10 * zc, kp, kd, dt, Rr, 0.002)
        f_out, _ = simulate_delayed(0.95 * zc, kp, kd, dt, Rr, 0.002)
        self.assertLess(f_in, 1e-3)
        self.assertEqual(f_out, float("inf"))

    def test_max_gain_scale_consistent(self):
        kp, kd, dt = 400.0, 28.0, 0.02
        zr = 0.07
        a = max_gain_scale(zr, kp, kd, dt, Rr)
        self.assertLess(a, gain_margin(kp, kd, dt))
        # at 0.99a the nonlinear loop is stable, at 1.05a (slightly above) it is not
        self.assertLess(simulate_delayed(zr, 0.99 * a * kp, 0.99 * a * kd, dt, Rr, 0.002)[0], 1e-3)


if __name__ == "__main__":
    unittest.main()
