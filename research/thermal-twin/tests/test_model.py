import math
import unittest

from thermal_twin.model import (LAM_C, steady_phi, lam_max, simulate, runaway_time, ghost_time, rhs, tau_overestimate)


class T(unittest.TestCase):
    def test_fixed_point_is_root(self):
        for lam in (0.01, 0.1, 0.14):
            p = steady_phi(lam)
            self.assertAlmostEqual(p * (1 - p) ** 2, lam, places=9)
            self.assertAlmostEqual(rhs(p, lam), 0.0, places=8)
            self.assertLess(p, 1 / 3)

    def test_fold(self):
        self.assertIsNotNone(steady_phi(LAM_C - 1e-4))
        self.assertIsNone(steady_phi(LAM_C + 1e-4))
        lm, arg = lam_max(0.0)
        self.assertAlmostEqual(lm, LAM_C, places=8)
        self.assertAlmostEqual(arg, 1 / 3, places=4)

    def test_dynamics_converge_to_fixed_point(self):
        ts, ps = simulate(0.1, 60.0, dt=5e-3)
        self.assertAlmostEqual(ps[-1], steady_phi(0.1), places=6)

    def test_runaway_above_fold(self):
        ts, ps = simulate(0.2, 100.0, dt=1e-3)
        self.assertGreaterEqual(ps[-1], 0.999)
        self.assertAlmostEqual(ts[-1], runaway_time(0.2), delta=0.05)

    def test_ghost_scaling(self):
        eps = 1e-4
        r = runaway_time(LAM_C + eps, n=2000000) / ghost_time(eps)
        self.assertLess(abs(r - 1), 0.05)

    def test_small_lam_twin_is_close(self):
        self.assertLess(abs(steady_phi(1e-4) / 1e-4 - 1), 1e-3)

    def test_tau_overestimate_continuous(self):
        self.assertAlmostEqual(tau_overestimate(1 / 3 - 1e-9), tau_overestimate(1 / 3 + 1e-9), places=6)

    def test_resistance_lowers_fold(self):
        self.assertLess(lam_max(1.0)[0], LAM_C)


if __name__ == "__main__":
    unittest.main()
