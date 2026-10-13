import math
import random
import unittest

from footprint_twin.model import (swept_width, theta_star, pass_prob, pass_prob_geometric, required_gap, circle_twin_pass,
                                  calibrated_radius, gap_for_success)

L, W = 1.0, 0.5


class Tst(unittest.TestCase):
    def test_swept_width_matches_corners(self):
        for th in (0.0, 0.1, 0.3, 0.6):
            g = swept_width(L, W, th)
            self.assertTrue(pass_prob_geometric(L, W, g + 1e-9, th))
            self.assertFalse(pass_prob_geometric(L, W, g - 1e-6, th))

    def test_theta_star_boundary(self):
        g = 0.7
        ts = theta_star(L, W, g)
        self.assertAlmostEqual(swept_width(L, W, ts), g, places=9)

    def test_pass_prob_vs_monte_carlo(self):
        rng = random.Random(3)
        for g, s in ((0.6, 0.08), (0.8, 0.15), (0.9, 0.3)):
            n = 60000
            mc = sum(pass_prob_geometric(L, W, g, rng.gauss(0, s)) for _ in range(n)) / n
            self.assertAlmostEqual(mc, pass_prob(L, W, g, s), delta=0.006)

    def test_edges(self):
        self.assertEqual(pass_prob(L, W, 0.49, 0.1), 0.0)
        self.assertAlmostEqual(pass_prob(L, W, 0.999, 1e-4), 1.0, places=6)

    def test_required_gap_inverts_pass_prob(self):
        for s in (0.02, 0.05, 0.1):
            g = required_gap(L, W, s, 0.95)
            self.assertAlmostEqual(pass_prob(L, W, g, s), 0.95, places=9)

    def test_calibrated_circle_matches_at_sigma0_only(self):
        rho = calibrated_radius(L, W, 0.05, 0.95)
        self.assertAlmostEqual(2 * rho, required_gap(L, W, 0.05, 0.95), places=12)
        self.assertGreater(required_gap(L, W, 0.15, 0.95), 2 * rho)

    def test_circle_twin_is_step(self):
        self.assertEqual(circle_twin_pass(W / 2, 0.5), 1.0)
        self.assertEqual(circle_twin_pass(math.hypot(L, W) / 2, 1.0), 0.0)

    def test_mission_gap_larger_than_single(self):
        self.assertGreater(gap_for_success(L, W, 0.05, 0.95, 5), required_gap(L, W, 0.05, 0.95))

    def test_rejects_wide_gap(self):
        with self.assertRaises(ValueError):
            pass_prob(L, W, 1.2, 0.1)


if __name__ == "__main__":
    unittest.main()
