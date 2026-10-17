import math
import unittest
from robofab_toppconv.model import Arm
from robofab_toppconv import topp


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


if __name__ == "__main__":
    unittest.main()
