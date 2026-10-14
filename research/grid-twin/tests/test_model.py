import math
import unittest

from grid_twin.model import (ratio, octile, dijkstra, mean_ratio, max_ratio, moves, flip_probability_mc,
                             flip_probability_quad, SQ2)


class T(unittest.TestCase):
    def test_moves(self):
        self.assertEqual([len(moves(k)) for k in (4, 8, 16)], [4, 8, 16])
        with self.assertRaises(ValueError):
            moves(6)

    def test_axis_and_diagonal_are_exact(self):
        for k in (4, 8, 16):
            self.assertAlmostEqual(ratio(k, 0.0), 1.0, places=12)
        self.assertAlmostEqual(ratio(4, math.pi / 4), SQ2, places=12)
        self.assertAlmostEqual(ratio(8, math.pi / 4), 1.0, places=12)
        self.assertAlmostEqual(ratio(16, math.atan2(1, 2)), 1.0, places=12)   # knight move direction

    def test_octile_equals_dijkstra(self):
        for t in ((10, 0), (10, 10), (17, 5), (-9, 23), (3, -30), (0, 0)):
            self.assertAlmostEqual(dijkstra(8, 32, t), octile(*t), places=9)

    def test_four_connected_is_manhattan(self):
        self.assertAlmostEqual(dijkstra(4, 20, (7, -11)), 18.0, places=9)

    def test_ratio_matches_octile_ratio(self):
        for phi in (0.1, 0.3, 0.6, math.pi / 8, 2.0, 4.0):
            self.assertAlmostEqual(ratio(8, phi), octile(math.cos(phi), math.sin(phi)), places=12)

    def test_closed_forms_8(self):
        self.assertAlmostEqual(mean_ratio(8, 40000), 8 * (SQ2 - 1) / math.pi, places=6)
        r, arg = max_ratio(8, 40000)
        self.assertAlmostEqual(r, math.cos(math.pi / 8) + (SQ2 - 1) * math.sin(math.pi / 8), places=6)
        self.assertAlmostEqual(arg, math.pi / 8, places=3)

    def test_closed_forms_4(self):
        self.assertAlmostEqual(mean_ratio(4, 40000), 4 / math.pi, places=6)

    def test_bias_never_below_one_and_shrinks_with_connectivity(self):
        m = {k: mean_ratio(k, 20000) for k in (4, 8, 16)}
        self.assertTrue(m[4] > m[8] > m[16] > 1.0)
        for k in (4, 8, 16):
            self.assertTrue(all(ratio(k, 0.01 * i) >= 1.0 - 1e-12 for i in range(700)))

    def test_dijkstra_16_close_to_asymptote(self):
        t = (60, 25)
        est = dijkstra(16, 70, t) / math.hypot(*t)
        self.assertLess(abs(est / ratio(16, math.atan2(25, 60)) - 1), 0.01)

    def test_scale_free(self):
        phi, length = math.pi / 8, 100.0
        for h in (4.0, 2.0, 1.0, 0.5):
            dx, dy = round(length * math.cos(phi) / h), round(length * math.sin(phi) / h)
            self.assertAlmostEqual(octile(dx, dy) * h / math.hypot(dx * h, dy * h), ratio(8, phi), delta=0.01)

    def test_flip_probability(self):
        for rho in (1.02, 1.05):
            self.assertAlmostEqual(flip_probability_mc(8, rho, 60000, seed=1), flip_probability_quad(8, rho), delta=0.006)
        self.assertEqual(flip_probability_quad(8, 1.0825), 0.0)
        self.assertAlmostEqual(flip_probability_quad(8, 1.0), 0.5, delta=0.01)


if __name__ == "__main__":
    unittest.main()
