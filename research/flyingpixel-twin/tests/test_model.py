import random
import unittest
from statistics import NormalDist

from flyingpixel_twin.model import (far_fraction, merged_range, twin_range, u_of_f, ghost_band, ghost_width, ghost_centre,
                                    ghost_width_scan, ghosts_per_edge, p_edge_has_ghost, strongest_return_edge_shift,
                                    eps_for_width, simulate_scan, ghost_persistence)


class T(unittest.TestCase):
    def test_limits_and_monotone(self):
        self.assertAlmostEqual(far_fraction(-20, 3.0), 1.0)
        self.assertAlmostEqual(far_fraction(20, 3.0), 0.0)
        self.assertAlmostEqual(far_fraction(0.0, 3.0), 3.0 / 4.0)  # w=1/2: f = kappa/(1+kappa)
        us = [i / 10 for i in range(-50, 51)]
        fs = [far_fraction(u, 0.7) for u in us]
        self.assertTrue(all(a > b for a, b in zip(fs, fs[1:])))

    def test_inverse(self):
        for kappa in (0.1, 1, 8):
            for f in (0.01, 0.3, 0.5, 0.99):
                self.assertAlmostEqual(far_fraction(u_of_f(f, kappa), kappa), f, places=9)

    def test_twin_and_far_ranges(self):
        self.assertEqual(twin_range(1.0, 10.0, 2.0), 10.0)
        self.assertEqual(twin_range(-1.0, 10.0, 2.0), 12.0)
        self.assertAlmostEqual(merged_range(-30, 10, 2, 1), 12.0)
        self.assertAlmostEqual(merged_range(0, 10, 2, 1), 11.0)  # equal energies: midpoint ghost

    def test_symmetric_width_closed_form(self):
        nd = NormalDist()
        for e in (0.01, 0.1, 0.25, 0.4):
            self.assertAlmostEqual(ghost_width(e, 1.0), 2 * nd.inv_cdf(1 - e), places=9)
            self.assertAlmostEqual(ghost_centre(e, 1.0), 0.0, places=9)
        self.assertAlmostEqual(ghost_width(0.1, 1.0), 2.5631, places=3)

    def test_no_ghost_when_tolerance_covers_gap(self):
        self.assertIsNone(ghost_band(0.5, 1.0))
        self.assertEqual(ghost_width(0.6, 2.0), 0.0)

    def test_width_matches_direct_scan(self):
        for e, k in ((0.1, 1.0), (0.05, 0.1), (0.2, 12.0), (0.01, 3.0)):
            self.assertAlmostEqual(ghost_width(e, k), ghost_width_scan(e, k, du=2e-4), places=2)

    def test_width_decreases_in_tolerance(self):
        ws = [ghost_width(e, 1.0) for e in (0.01, 0.05, 0.1, 0.2, 0.4)]
        self.assertTrue(all(a > b for a, b in zip(ws, ws[1:])))

    def test_band_moves_toward_dim_surface(self):
        # bright far wall (kappa>1) pulls the centroid to the far surface: the ghost band sits on the near side (u>0)
        self.assertGreater(ghost_centre(0.1, 10.0), 0.0)
        self.assertLess(ghost_centre(0.1, 0.1), 0.0)
        self.assertAlmostEqual(ghost_centre(0.1, 10.0), -ghost_centre(0.1, 0.1), places=9)

    def test_strongest_return_shift(self):
        self.assertAlmostEqual(strongest_return_edge_shift(1.0), 0.0)
        self.assertAlmostEqual(far_fraction(strongest_return_edge_shift(5.0), 5.0), 0.5)

    def test_eps_for_width_roundtrip(self):
        e = eps_for_width(3.0, 2.0)
        self.assertAlmostEqual(ghost_width(e, 2.0), 3.0, places=6)

    def test_per_edge(self):
        self.assertAlmostEqual(ghosts_per_edge(0.1, 1.0, 2.0), 2 * ghost_width(0.1, 1.0))
        self.assertEqual(p_edge_has_ghost(0.1, 1.0, 5.0), 1.0)
        self.assertLess(p_edge_has_ghost(0.1, 1.0, 0.1), 1.0)

    def test_scan_matches_expected_density(self):
        rng = random.Random(1)
        q, every, e, k = 1.5, 200, 0.1, 1.0
        got = simulate_scan(e, k, q, 400000, rng, every)
        self.assertAlmostEqual(got, ghost_width(e, k) * q / every, delta=0.06 * ghost_width(e, k) * q / every)

    def test_persistence_high_for_small_jitter(self):
        rng = random.Random(2)
        n, frac = ghost_persistence(0.1, 1.0, 0.1, 5, 3, rng, n_beams=20000)
        self.assertGreater(n, 1000)
        self.assertGreater(frac, 0.95)


if __name__ == "__main__":
    unittest.main()
