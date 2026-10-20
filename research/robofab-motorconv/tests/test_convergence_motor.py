import unittest
from robofab_motorconv.model import Arm
from robofab_motorconv import topp


class TestNodeConvergenceMotor(unittest.TestCase):
    def setUp(self):
        self.arm = Arm(0.18, 0.18, 0.18, 0.18, 0.15)
        self.qa = self.arm.ik(0.2, -0.05, -1)
        self.qb = self.arm.ik(0.15, 0.1, -1)

    def T(self, n, w0):
        return topp.solve(self.arm, self.qa, self.qb, 5.0, n=n, mass=0.05, mu=0.5, w0=w0)["T"]

    def test_converges_under_motor_line(self):
        for w0 in (20.0, 6.0):
            a, b, c = (self.T(n, w0) for n in (400, 1600, 6400))
            self.assertLess(abs(c - b) / c, 0.01)
            self.assertLess(abs(c - b), abs(b - a) + 1e-9)

    def test_constant_limit_is_w0_infinity_limit(self):
        self.assertAlmostEqual(self.T(400, None), self.T(400, 1e9), places=4)


if __name__ == "__main__":
    unittest.main()
