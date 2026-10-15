import math
import unittest

from inertia_twin.model import *


class T(unittest.TestCase):
    def test_rolling_matches_closed_form(self):
        for k in SHAPES.values():
            a = math.radians(20)
            t = 1.0
            x, v, _ = simulate(k, a, 0.9, t)
            acc = accel_real(k, a, 0.9)
            self.assertAlmostEqual(x, 0.5 * acc * t * t, delta=2e-3)
            self.assertAlmostEqual(v, acc * t, delta=2e-3)

    def test_slipping_matches_closed_form(self):
        k, a, mu = 0.5, math.radians(40), 0.1
        self.assertLess(mu, mu_star(k, a))
        x, v, w = simulate(k, a, mu, 1.0)
        self.assertAlmostEqual(v, accel_real(k, a, mu), delta=2e-3)
        self.assertAlmostEqual(w, mu * G * math.cos(a) / k, delta=2e-3)

    def test_threshold_sharp(self):
        k, a = 0.4, math.radians(30)
        ms = mu_star(k, a)
        for mu, rolls in ((ms * 0.98, False), (ms * 1.02, True)):
            _, v, w = simulate(k, a, mu, 1.0)
            self.assertEqual(abs(v - w) < 1e-6, rolls)

    def test_twin_overstates_by_1_plus_k(self):
        a = math.radians(25)
        for k in SHAPES.values():
            self.assertAlmostEqual(accel_twin(a) / accel_real(k, a, 1.0), 1 + k)

    def test_twin_is_continuous_and_bounded(self):
        k, a = 0.5, math.radians(30)
        ms = mu_star(k, a)
        self.assertAlmostEqual(accel_real(k, a, ms - 1e-12), accel_real(k, a, ms + 1e-12), places=6)
        self.assertAlmostEqual(accel_real(k, a, 0.0), accel_twin(a))

    def test_coast_overshoot(self):
        a, v0 = math.radians(15), 2.0
        for k in SHAPES.values():
            self.assertAlmostEqual(coast_distance_real(k, a, v0) / coast_distance_twin(a, v0), 1 + k)
            d = 0.7
            self.assertAlmostEqual(coast_distance_real(k, a, launch_speed_twin(a, d)), (1 + k) * d)

    def test_coast_simulated(self):
        # launched rolling up the ramp (down-slope positive): stops at t = (1+k) v0/(g sin a) after -(1+k) v0^2/(2 g sin a)
        k, a, v0 = 0.5, math.radians(20), 1.5
        t_stop = (1 + k) * v0 / (G * math.sin(a))
        x, v, w = simulate(k, a, 0.9, t_stop, v0=-v0, w0=-v0)
        self.assertAlmostEqual(-x, coast_distance_real(k, a, v0), delta=2e-3)
        self.assertAlmostEqual(v, 0.0, delta=2e-3)

    def test_fit_gain(self):
        c = fit_gain([(0.3, 0.7 * accel_twin(0.3)), (0.5, 0.7 * accel_twin(0.5))])
        self.assertAlmostEqual(c, 0.7)


if __name__ == "__main__":
    unittest.main()
