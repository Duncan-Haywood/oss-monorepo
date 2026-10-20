import math
import unittest
from robofab_motorcurve.model import Arm
from robofab_motorcurve import topp


class TestNodeConvergence(unittest.TestCase):
    def setUp(self):
        self.arm = Arm(0.18, 0.18, 0.18, 0.18, 0.15)
        self.qa = self.arm.ik(0.2, -0.05, -1)
        self.qb = self.arm.ik(0.15, 0.1, -1)

    def T(self, n, w):
        return topp.solve(self.arm, self.qa, self.qb, 5.0, n=n, mass=0.05, mu=0.5, wmax=w)["T"]

    def test_time_decreases_with_nodes_speed_limited(self):
        t = [self.T(n, 1.0) for n in (100, 400, 1600)]
        self.assertGreaterEqual(t[0], t[1])
        self.assertGreaterEqual(t[1], t[2])

    def test_converges(self):
        a, b, c = (self.T(n, 1.0) for n in (400, 1600, 6400))
        self.assertLess(abs(b - c), abs(a - b) + 1e-12)
        self.assertLess(abs(c - b) / c, 0.01)

    def test_torque_bound_converges_without_speed_limit(self):
        a, b, c = (self.T(n, None) for n in (400, 1600, 6400))
        self.assertLess(abs(c - b) / c, 0.005)
        self.assertLess(abs(c - b), abs(b - a) + 1e-9)

    def test_denser_ramp_sampling_never_shortens_trapezoid(self):
        from robofab_motorcurve import trap
        r = [trap.best_trap(self.arm, self.qa, self.qb, 5.0, 0.05, 1e9, 0.5, wmax=None, fracs=(0.01, 0.05, 0.2), ramp_samples=s)[0]
             for s in (0, 40, 160)]
        self.assertLessEqual(r[0], r[1] + 1e-3)
        self.assertLessEqual(r[1], r[2] + 1e-3)


if __name__ == "__main__":
    unittest.main()
