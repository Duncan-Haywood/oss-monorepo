import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_sliprate.model import torque_bounds  # noqa: E402
from robofab_sliprate.sim import late_rate, run  # noqa: E402


class T(unittest.TestCase):
    def test_late_rate_recovers_slope(self):
        ts = [0.05 * i for i in range(1, 21)]
        self.assertAlmostEqual(late_rate(ts, [-2.0 * t for t in ts]), -2.0, places=6)

    def test_bracket_ordering(self):
        b = torque_bounds(40, 0.5)
        self.assertLess(b["lower"], b["upper"])

    def test_falls_far_below_bracket(self):
        ts, a, d = run(40, 0.1, 0.5, 3, t_end=0.5)
        self.assertGreater(d[-1], 100.0)  # drop in mm

    def test_creeps_slowly_above_bracket(self):
        ts, a, d = run(40, 1.2, 0.5, 3, t_end=0.5)
        self.assertLess(abs(late_rate(ts, a, 0.2)), 10.0)
        self.assertLess(d[-1], 5.0)

    def test_creep_rate_depends_on_solver_settings(self):
        r1 = late_rate(*run(40, 1.2, 0.5, 3, t_end=0.5)[:2], 0.2)
        r2 = late_rate(*run(40, 1.2, 0.5, 3, t_end=0.5, impratio=10.0)[:2], 0.2)
        self.assertLess(abs(r2), 0.2 * abs(r1))

    def test_torsion_lowers_creep(self):
        r3 = late_rate(*run(40, 1.2, 0.5, 3, t_end=0.5)[:2], 0.2)
        r4 = late_rate(*run(40, 1.2, 0.5, 4, t_end=0.5)[:2], 0.2)
        self.assertLess(abs(r4), abs(r3))


if __name__ == "__main__":
    unittest.main()
