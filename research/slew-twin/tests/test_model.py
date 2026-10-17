import unittest

from slew_twin.model import (trajectory, increment_ratio, valid_amplitude, undershoot, settle_steps,
                            crosses_zero)


class T(unittest.TestCase):
    def test_twin_is_first_order(self):
        xs = trajectory(2.0, 0.3, n=30)
        for t in range(30):
            self.assertAlmostEqual(xs[t + 1], 0.7 * xs[t], places=12)

    def test_scale_invariance_exact(self):
        # scaling (x0, r) by a power of two scales the trajectory bit-exactly
        a = trajectory(3.0, 0.3, r=0.05, n=200)
        b = trajectory(3.0 * 64, 0.3, r=0.05 * 64, n=200)
        for u, v in zip(a, b):
            self.assertEqual(u * 64, v)

    def test_increment_ratio_is_k(self):
        for k in (0.1, 0.3, 0.6, 1.0):
            self.assertAlmostEqual(increment_ratio(k), k, places=12)

    def test_critical_ratio_2n_2n_minus_1(self):
        for n in (1, 2, 3, 5, 10):
            k, rho = 1.0 / n, 2.0 * n * (2 * n - 1)
            self.assertFalse(crosses_zero(k, rho - 1e-6))
            self.assertTrue(crosses_zero(k, rho + 1e-6))

    def test_twin_exact_at_boundary_and_not_above(self):
        for k in (0.1, 0.3, 0.6):
            r = 0.05
            A = valid_amplitude(k, r)
            self.assertEqual(trajectory(A * 0.999, k, r=r, n=300), trajectory(A * 0.999, k, n=300))
            hi = 1.01 * A
            self.assertNotEqual(trajectory(hi, k, r=r, n=300), trajectory(hi, k, n=300))

    def test_overshoot_appears_only_at_large_amplitude(self):
        self.assertEqual(undershoot(trajectory(1.0, 0.1, r=0.1, n=400)), 0.0)
        self.assertGreater(undershoot(trajectory(100.0, 0.1, r=0.02, n=2000)), 0.3)
        self.assertEqual(undershoot(trajectory(100.0, 0.1, n=2000)), 0.0)

    def test_settling_time_grows_with_amplitude_over_rate(self):
        s1 = settle_steps(1e3, 0.3, 1.0)
        s2 = settle_steps(1e4, 0.3, 1.0)
        self.assertGreater(s2, 5 * s1)


if __name__ == "__main__":
    unittest.main()
