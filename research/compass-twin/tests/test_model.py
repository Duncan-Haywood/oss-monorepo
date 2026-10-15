import math
import random
import unittest

from compass_twin.model import (error, hard_peak, hard_first_order, soft_peak, closure_first_order, square_closure, fit_offset,
                                swing_points, offset_error_rms, solve3)


def sweep(**kw):
    return [error(2 * math.pi * i / 3600, **kw) for i in range(3600)]


class T(unittest.TestCase):
    def test_ideal_twin_has_zero_error(self):
        self.assertLess(max(abs(e) for e in sweep()), 1e-12)

    def test_hard_iron_peak_exact(self):
        for b in (0.05, 0.3, 0.8):
            self.assertAlmostEqual(max(abs(e) for e in sweep(beta=b, phi=0.7)), hard_peak(b), places=3)

    def test_hard_iron_first_order(self):
        psi = 1.1
        self.assertAlmostEqual(error(psi, beta=0.01, phi=0.4), hard_first_order(psi, 0.01, 0.4), places=4)

    def test_soft_iron_peak_exact(self):
        for r in (0.5, 0.8, 1.3):
            self.assertAlmostEqual(max(abs(e) for e in sweep(r=r)), soft_peak(r), places=3)

    def test_soft_iron_peak_location(self):
        r = 0.6
        self.assertAlmostEqual(abs(error(math.atan(1 / math.sqrt(r)), r=r)), soft_peak(r), places=10)

    def test_closure_first_order_any_phase(self):
        for phi in (0.0, 0.9, 2.5):
            self.assertAlmostEqual(square_closure(100, beta=0.01, phi=phi) / closure_first_order(100, 0.01), 1.0, places=2)

    def test_true_heading_tracking_closes(self):
        self.assertLess(square_closure(100, compass_held=False, beta=0.2, phi=1.0), 1e-9)

    def test_solve3(self):
        x = solve3([[2, 1, 0], [1, 3, 1], [0, 1, 4]], [3, 8, 9])
        self.assertAlmostEqual(2 * x[0] + x[1], 3)
        self.assertAlmostEqual(x[1] + 4 * x[2], 9)

    def test_fit_exact_without_noise(self):
        c = fit_offset(swing_points(50, 2 * math.pi, 0.0, (0.3, -0.2)))
        self.assertAlmostEqual(c[0], 0.3, places=9)
        self.assertAlmostEqual(c[1], -0.2, places=9)

    def test_full_swing_noise_law(self):
        # centre error per coordinate var 2 sigma^2 / n => RMS Euclidean 2 sigma / sqrt(n)
        n, s = 200, 0.02
        m = offset_error_rms(n, 2 * math.pi, s, 400, random.Random(3))
        self.assertAlmostEqual(m / (2 * s / math.sqrt(n)), 1.0, delta=0.12)

    def test_short_arc_is_worse(self):
        r = random.Random(4)
        full = offset_error_rms(100, 2 * math.pi, 0.02, 200, r)
        part = offset_error_rms(100, math.pi / 2, 0.02, 200, r)
        self.assertGreater(part, 5 * full)


if __name__ == "__main__":
    unittest.main()
