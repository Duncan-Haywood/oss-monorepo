import math
import unittest

from gravity_twin.model import (force, equilibria, nearest_stable, offset_first_order, simulate, twin_gains, holds)


class T(unittest.TestCase):
    def test_equilibrium_is_root(self):
        for kp, ths, gff in ((3.0, 1.0, 0.0), (1.5, 2.0, 0.8), (10.0, 0.3, 1.2)):
            e = nearest_stable(kp, 1.0, ths, gff)
            self.assertAlmostEqual(force(e, kp, 1.0, ths, gff), 0.0, places=10)

    def test_twin_has_no_offset_and_sim_matches_equilibrium(self):
        kp, kd = twin_gains(4.0, 0.7)
        th, w = simulate(kp, kd, 1.0, 1.0, 0.0, 80.0)
        e = nearest_stable(kp, 1.0, 1.0)
        self.assertAlmostEqual(th, e, places=6)
        self.assertGreater(1.0 - e, 0.05)          # twin would say 0

    def test_first_order_sag_small_angle(self):
        ths = 0.05
        kp = 3.0
        sag = ths - nearest_stable(kp, 1.0, ths)
        self.assertAlmostEqual(sag / offset_first_order(kp, 1.0, ths), 1.0, places=2)

    def test_upright_threshold(self):
        kd = 2.0
        self.assertTrue(holds(1.2, kd, 1.0, math.pi, math.pi - 0.05))
        self.assertFalse(holds(0.8, kd, 1.0, math.pi, math.pi - 0.05))
        self.assertTrue(any(s and abs(t - math.pi) < 1e-6 for t, s in equilibria(1.2, 1.0, math.pi)))
        self.assertFalse(any(s and abs(t - math.pi) < 1e-6 for t, s in equilibria(0.8, 1.0, math.pi)))

    def test_exact_feedforward_removes_sag(self):
        e = nearest_stable(3.0, 1.0, 1.3, gff=1.0)
        self.assertAlmostEqual(e, 1.3, places=9)


if __name__ == "__main__":
    unittest.main()
