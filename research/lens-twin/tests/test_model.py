import random
import unittest

from lens_twin.model import (distort, undistort_radius, twin_range, range_ratio, brake_point, brake_first_order, line_bow,
                             lsq_scale, fit_scale, grid_points, estimate_k1, observe)


class T(unittest.TestCase):
    def test_pinhole_is_identity(self):
        self.assertEqual(distort(0.3, -0.2, 0.0), (0.3, -0.2))
        self.assertAlmostEqual(twin_range(2.0, 0.5, 0.0), 2.0)

    def test_undistort_inverts(self):
        for k1 in (-0.3, 0.0, 0.2):
            rd = 0.5 * (1 + k1 * 0.25)
            self.assertAlmostEqual(undistort_radius(rd, k1), 0.5, places=10)

    def test_undistort_rejects_fold_over(self):
        with self.assertRaises(ValueError):
            undistort_radius(5.0, -0.3)

    def test_range_ratio_closed_form(self):
        for k1 in (-0.3, 0.1):
            for R in (0.8, 1.5, 4.0):
                self.assertAlmostEqual(twin_range(R, 0.5, k1) / R, range_ratio(R, 0.5, k1), places=12)

    def test_barrel_overstates_range_so_policy_stops_short(self):
        self.assertGreater(twin_range(1.0, 0.5, -0.3), 1.0)
        self.assertLess(brake_point(1.0, 0.5, -0.3), 1.0)
        self.assertGreater(brake_point(1.0, 0.5, 0.3), 1.0)

    def test_brake_first_order_small_k1(self):
        k1 = -0.01
        exact = brake_point(2.0, 0.5, k1) - 2.0
        self.assertAlmostEqual(exact / brake_first_order(2.0, 0.5, k1), 1.0, delta=0.05)

    def test_line_bow_exact(self):
        self.assertAlmostEqual(line_bow(0.4, 0.3, -0.25), -0.25 * 0.4 * 0.09, places=14)

    def test_scale_closed_form(self):
        self.assertAlmostEqual(fit_scale(-0.3, 0.8), lsq_scale(-0.3, 0.8), places=3)

    def test_k1_recovery_noiseless_and_noisy(self):
        pts = grid_points()
        self.assertAlmostEqual(estimate_k1(pts, observe(pts, -0.27)), -0.27, places=12)
        rng = random.Random(1)
        est = [estimate_k1(pts, observe(pts, -0.27, 0.002, rng)) for _ in range(200)]
        self.assertAlmostEqual(sum(est) / len(est), -0.27, delta=0.01)


if __name__ == "__main__":
    unittest.main()
