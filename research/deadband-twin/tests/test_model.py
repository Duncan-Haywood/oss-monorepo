import math
import random
import unittest

from deadband_twin.model import (Q, dz, stall_error, run_servo, steps_to, gain_gaussian, fit_gain, k_needed,
                                 bisect_deadband, bisection_error_bound, comp_error)


class T(unittest.TestCase):
    def test_no_deadband_is_identity(self):
        self.assertEqual(dz(0.3, 0.0), 0.3)
        self.assertAlmostEqual(gain_gaussian(0.0, 1.0), 1.0)

    def test_twin_converges_real_stalls(self):
        xs = run_servo(5.0, 0.4, 0.0, 200)
        self.assertLess(abs(xs[-1]), 1e-12)
        xs = run_servo(5.0, 0.4, 0.2, 400)
        self.assertAlmostEqual(xs[-1], stall_error(0.2, 0.4), places=9)
        self.assertGreaterEqual(min(xs), stall_error(0.2, 0.4) - 1e-12)

    def test_negative_side_symmetric(self):
        self.assertAlmostEqual(run_servo(-5.0, 0.4, 0.2, 400)[-1], -0.5, places=9)

    def test_steps_to_twin(self):
        n = steps_to(5.0, 0.4, 0.01)
        xs = run_servo(5.0, 0.4, 0.0, n)
        self.assertLessEqual(abs(xs[-1]), 0.01)
        self.assertGreater(abs(xs[-2]), 0.01)

    def test_stein_gain(self):
        g = fit_gain(1.0, 1.5, 400000, random.Random(1))
        self.assertAlmostEqual(g, gain_gaussian(1.0, 1.5), delta=0.01)

    def test_compensation_residual_both_sides(self):
        for dh in (0.1, 0.3, 0.2):
            xs = run_servo(5.0, 0.4, 0.2, 600, dh=dh)
            self.assertAlmostEqual(abs(xs[-1]), comp_error(0.2, dh, 0.4), places=9)

    def test_bisection_bound(self):
        d = 0.3137
        for n in (3, 6, 10):
            self.assertLessEqual(abs(bisect_deadband(d, 0.0, 1.0, n) - d), bisection_error_bound(0.0, 1.0, n) + 1e-15)

    def test_k_needed(self):
        self.assertAlmostEqual(stall_error(0.2, k_needed(0.2, 0.05)), 0.05)


if __name__ == "__main__":
    unittest.main()
