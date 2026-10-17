import math
import unittest

from deadband_noise_twin.model import (deadband, stall, stall_compensated, trajectory, steps_to_tol,
                                 twin_steps_to_tol, twin_rms, stationary_rms)


class T(unittest.TestCase):
    def test_deadband_shape(self):
        self.assertEqual(deadband(0.05, 0.1), 0.0)
        self.assertAlmostEqual(deadband(0.3, 0.1), 0.2)
        self.assertAlmostEqual(deadband(-0.3, 0.1), -0.2)

    def test_stall_and_geometric_rate(self):
        K, d, x0 = 0.5, 0.1, 2.0
        tr = trajectory(x0, K, d, 40)
        self.assertAlmostEqual(tr[-1], stall(K, d), places=9)
        for k in (1, 5, 10):
            self.assertAlmostEqual(tr[k] - stall(K, d), (1 - K) ** k * (x0 - stall(K, d)), places=12)

    def test_tolerance_reachable_iff_above_stall(self):
        K, d = 0.5, 0.1
        self.assertIsNone(steps_to_tol(2.0, K, 0.19, d))
        self.assertIsNotNone(steps_to_tol(2.0, K, 0.2001, d))
        self.assertEqual(steps_to_tol(2.0, K, 0.01), twin_steps_to_tol(2.0, K, 0.01))

    def test_compensation_exact(self):
        K, d = 0.5, 0.1
        under = trajectory(2.0, K, d, 200, dh=0.06)[-1]
        self.assertAlmostEqual(under, stall_compensated(K, d, 0.06), places=9)
        tr = trajectory(2.0, K, d, 200, dh=0.15)[-2:]
        self.assertAlmostEqual(abs(tr[0]), stall_compensated(K, d, 0.15), places=9)
        self.assertAlmostEqual(abs(tr[1]), stall_compensated(K, d, 0.15), places=9)
        self.assertLess(tr[0] * tr[1], 0)

    def test_twin_rms_matches_linear_simulation(self):
        self.assertAlmostEqual(stationary_rms(0.5, 0.0, 0.05, n=300000) / twin_rms(0.5, 0.05), 1.0, delta=0.03)


if __name__ == "__main__":
    unittest.main()
