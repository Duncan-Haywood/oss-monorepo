import math
import unittest

from marine_hull.michell import (G, _simpson, torpedo_volume, torpedo_wetted, wave_resistance_torpedo)


class TorpedoTests(unittest.TestCase):
    def test_volume_matches_quadrature(self):
        L, b, d = 3.0, 0.12, 0.10
        def y(x, s):
            return b * (1 - (2 * x / L) ** 2) * (1 - (s / d) ** 2)
        v = 2.0 * _simpson(lambda x: _simpson(lambda s: y(x, s), -d, d, 200), -L / 2, L / 2, 200)
        self.assertAlmostEqual(v, torpedo_volume(L, b, d), delta=1e-9)

    def test_thin_limit_wetted_area_is_two_planes(self):
        self.assertAlmostEqual(torpedo_wetted(3.0, 1e-7, 0.1), 2 * 3.0 * 0.2, places=6)

    def test_wave_resistance_scales_with_beam_squared(self):
        u = 2.0
        r1 = wave_resistance_torpedo(u, 3.0, 0.1, 0.1, 0.5)
        r2 = wave_resistance_torpedo(u, 3.0, 0.2, 0.1, 0.5)
        self.assertAlmostEqual(r2 / r1, 4.0, places=6)

    def test_decay_with_depth_follows_two_k0(self):
        # the dominant (transverse) wave amplitude falls as exp(-k0 depth), so resistance as exp(-2 k0 depth)
        for u in (1.0, 1.5, 2.0):
            k0 = G / u ** 2
            r1 = wave_resistance_torpedo(u, 3.0, 0.1, 0.1, 0.5)
            r2 = wave_resistance_torpedo(u, 3.0, 0.1, 0.1, 0.6)
            slope = math.log(r1 / r2) / 0.1
            self.assertGreater(slope, 2.0 * k0)
            self.assertLess(slope, 2.2 * k0 + 0.8)

    def test_must_stay_submerged(self):
        with self.assertRaises(ValueError):
            wave_resistance_torpedo(2.0, 3.0, 0.1, 0.1, 0.1)

    def test_theta_resolution(self):
        a = wave_resistance_torpedo(2.0, 3.0, 0.1, 0.1, 0.5, nth=300)
        b = wave_resistance_torpedo(2.0, 3.0, 0.1, 0.1, 0.5, nth=1200)
        self.assertAlmostEqual(a / b, 1.0, delta=0.01)


if __name__ == "__main__":
    unittest.main()
