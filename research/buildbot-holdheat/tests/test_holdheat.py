import math
import unittest

from buildbot_holdheat import hold_time, loss_ratio


class T(unittest.TestCase):
    def test_sustainable_is_infinite(self):
        self.assertEqual(hold_time(0.3, 0.3), math.inf)
        self.assertEqual(hold_time(0.2, 0.5), math.inf)

    def test_closed_form(self):
        # u = 2 rho: T_inf/Tmax = 4, reaches 1 when 1 - exp(-t) = 1/4
        self.assertAlmostEqual(hold_time(1.0, 0.5), -math.log(0.75))

    def test_monotone_in_load(self):
        self.assertGreater(hold_time(0.6, 0.5), hold_time(0.9, 0.5))

    def test_loss_ratio(self):
        self.assertAlmostEqual(loss_ratio([0.2, 0.2], [0.1, 0.1]), 4.0)

    def test_matches_euler_integration(self):
        u, rho, dt, T, t = 0.9, 0.4, 1e-5, 0.0, 0.0
        while T < 1.0:
            T += dt * ((u / rho) ** 2 - T)
            t += dt
        self.assertAlmostEqual(t, hold_time(u, rho), places=2)
