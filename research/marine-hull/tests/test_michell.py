import math
import unittest

from marine_hull.michell import (G, _j_numeric, _j_wigley, wave_resistance_wigley, wigley_volume,
                                 wigley_wetted)

L, B, T = 4.0, 0.4, 0.25


class MichellTests(unittest.TestCase):
    def test_closed_form_matches_quadrature(self):
        for th in (0.1, 0.8, 1.3):
            a, b = _j_wigley(th, 2.0, L, B, T), _j_numeric(th, 2.0, L, B, T)
            self.assertAlmostEqual(a, b, delta=1e-6 * abs(a))

    def test_wetted_area_between_bounds(self):
        s = wigley_wetted(L, B, T)
        self.assertGreater(s, 2 * L * T * 2 / 3)      # more than the two lateral planes' lower bound
        self.assertLess(s, L * (2 * T + B) * 1.2)

    def test_volume(self):
        self.assertAlmostEqual(wigley_volume(L, B, T), 4 / 9 * L * B * T)

    def test_resistance_scales_with_beam_squared(self):
        u = 0.4 * math.sqrt(G * L)
        r1 = wave_resistance_wigley(u, L, B, T)
        r2 = wave_resistance_wigley(u, L, 2 * B, T)
        self.assertAlmostEqual(r2 / r1, 4.0, places=6)

    def test_theta_resolution(self):
        u = 0.3 * math.sqrt(G * L)
        a, b = wave_resistance_wigley(u, L, B, T, nth=800), wave_resistance_wigley(u, L, B, T, nth=3200)
        self.assertAlmostEqual(a / b, 1.0, places=3)

    def test_far_apart_hulls_average_to_two_singles(self):
        u = 0.4 * math.sqrt(G * L)
        one = wave_resistance_wigley(u, L, B, T)
        many = [wave_resistance_wigley(u, L, B, T, n_hulls=2, sep=s) for s in (40 + 0.01 * i for i in range(200))]
        self.assertAlmostEqual(sum(many) / len(many) / (2 * one), 1.0, delta=0.03)


if __name__ == "__main__":
    unittest.main()
