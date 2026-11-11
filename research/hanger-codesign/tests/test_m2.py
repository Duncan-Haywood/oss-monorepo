"""Milestone 2a wiring: the simulated Cusick test's gradient, geometry and limits."""
import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments" / "m2_cusick"))
import cusick  # noqa: E402


class TestCusick(unittest.TestCase):
    def setUp(self):
        self.sp = cusick.Specimen(0.027, 12.52, 150.0, h=0.0075)

    def test_gradient_matches_finite_difference(self):
        X = self.sp.start(3)
        v = X[self.sp.free].ravel()
        _, g = self.sp.energy_grad(v, X)
        d = np.random.default_rng(0).standard_normal(v.size) * 1e-4
        e = 1e-3
        fd = (self.sp.energy_grad(v + e * d, X)[0] - self.sp.energy_grad(v - e * d, X)[0]) / (2 * e)
        self.assertAlmostEqual(fd / (g @ d), 1.0, places=5)

    def test_flat_specimen_is_dc_one_and_area_close_to_disc(self):
        self.assertAlmostEqual(self.sp.dc(self.sp.X0), 1.0, places=9)
        self.assertLess(abs(self.sp.flat_area() / (math.pi * cusick.R_SPEC ** 2) - 1), 0.02)

    def test_straight_down_hang_is_dc_zero(self):
        X = self.sp.X0.copy()
        r = self.sp.rho0
        out = r > cusick.R_DISC
        X[out, :2] *= (cusick.R_DISC * 0.999 / r[out])[:, None]
        X[out, 2] = -(r[out] - cusick.R_DISC)
        self.assertLess(abs(self.sp.dc(X)), 0.02)

    def test_bending_isotropic(self):
        # a cylindrical bend about the y axis and about the 45-degree axis cost the same energy
        sp = cusick.Specimen(0.1, 1e-6, 0.0, h=0.005)
        k = 5.0
        def bent(theta):
            X = sp.X0.copy()
            u = X[:, 0] * math.cos(theta) + X[:, 1] * math.sin(theta)
            X[:, 2] = 0.5 * k * u * u
            return sp.energy_grad(X[sp.free].ravel(), X)[0]
        e0, e45 = bent(0.0), bent(math.pi / 4)
        self.assertLess(abs(e45 / e0 - 1), 0.05)

    def test_bending_length(self):
        self.assertAlmostEqual(cusick.bending_length(0.0246 * 1.0, 24.6), 1.0, places=9)


if __name__ == "__main__":
    unittest.main()
