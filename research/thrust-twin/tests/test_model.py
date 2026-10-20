import unittest

from thrust_twin.model import (accel_real, accel_closed_form, gains, step, overshoot, twin_overshoot, G)


class T(unittest.TestCase):
    def test_closed_form_matches_unclipped_throttle(self):
        for a in (-2 * G, -10, -1, 0, 1, 10, 2 * G):
            self.assertAlmostEqual(accel_real(a, clip=False), accel_closed_form(a), places=9)

    def test_small_command_is_linear(self):
        self.assertAlmostEqual(accel_real(1e-4) / 1e-4, 1.0, places=4)

    def test_floor_is_free_fall(self):
        self.assertAlmostEqual(accel_real(-2 * G), -G)
        self.assertAlmostEqual(accel_real(-100 * G), -G)

    def test_ceiling_is_three_g_up(self):
        self.assertAlmostEqual(accel_real(10 * G), 3 * G)

    def test_asymmetry_sign(self):
        self.assertGreater(accel_real(5.0), 5.0)
        self.assertGreater(accel_real(-5.0), -5.0)   # descent braked: less downward than commanded

    def test_twin_overshoot_formula(self):
        kp, kd = gains(1.0, 0.5)
        xs = step(kp, kd, 1.0, 20, real=False)
        self.assertAlmostEqual(overshoot(xs, 1.0), twin_overshoot(0.5), places=4)

    def test_small_step_real_equals_twin(self):
        kp, kd = gains(2.0, 0.7)
        a = step(kp, kd, 1e-4, 10, real=True)
        b = step(kp, kd, 1e-4, 10, real=False)
        self.assertLess(max(abs(p - q) for p, q in zip(a, b)) / 1e-4, 1e-3)

    def test_step_is_scale_free_in_p(self):
        # a_cmd/g = wn^2 x0 / g: (wn, x0) and (2 wn, x0/4) give the same shape in scaled time/length
        k1, d1 = gains(2.0, 0.7)
        k2, d2 = gains(4.0, 0.7)
        a = step(k1, d1, 4.0, 10, dt=1e-3)
        b = step(k2, d2, 1.0, 5, dt=5e-4)
        self.assertAlmostEqual(a[-1] / 4.0, b[-1] / 1.0, places=4)
        self.assertAlmostEqual(overshoot(a, 4.0), overshoot(b, 1.0), places=4)


if __name__ == "__main__":
    unittest.main()
