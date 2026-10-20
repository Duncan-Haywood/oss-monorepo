import math
import unittest
from robofab_motorcurve.model import Arm
from robofab_motorcurve import topp, trap


class TestMotorCurve(unittest.TestCase):
    def setUp(self):
        self.arm = Arm(0.18, 0.18, 0.18, 0.18, 0.15)
        self.qa = self.arm.ik(0.2, -0.05, -1)
        self.qb = self.arm.ik(0.15, 0.1, -1)

    def T(self, w0, n=400):
        return topp.solve(self.arm, self.qa, self.qb, 5.0, n=n, w0=w0)["T"]

    def test_none_is_constant_limit(self):
        self.assertAlmostEqual(self.T(None), self.T(1e9), places=9)

    def test_time_rises_as_no_load_speed_falls(self):
        t = [self.T(w) for w in (None, 12.0, 8.0, 5.0, 3.0)]
        for a, b in zip(t, t[1:]):
            self.assertLessEqual(a, b + 1e-12)
        self.assertGreater(t[-1], 1.2 * t[0])

    def test_profile_keeps_joint_speed_below_no_load_speed(self):
        for w0 in (4.0, 8.0):
            prof = topp.solve(self.arm, self.qa, self.qb, 5.0, n=400, w0=w0)
            self.assertLess(topp.peak_joint_speed(self.qa, self.qb, prof), w0)

    def test_profile_obeys_the_torque_speed_line(self):
        w0 = 6.0
        prof = topp.solve(self.arm, self.qa, self.qb, 5.0, n=400, w0=w0)
        dq = (self.qb[0] - self.qa[0], self.qb[1] - self.qa[1])
        for k in range(5, prof["n"] - 4):    # the last nodes carry a first-order finite-difference error in sdd that shrinks as 1/n
            a, b, g = topp.coeffs(self.arm, self.qa, self.qb, k * prof["ds"])
            for i in range(2):
                tau = a[i] * prof["sdd"][k] + b[i] * prof["u"][k] + g[i]
                lim = 5.0 * (1 - abs(dq[i]) * math.sqrt(prof["u"][k]) / w0)
                self.assertLessEqual(abs(tau), 1.05 * lim + 0.02)   # sdd is a finite difference: 5% slack

    def test_trapezoid_none_matches_constant_limit(self):
        a = trap.move(self.arm, self.qa, self.qb, 0.5, 0.2)
        b = trap.move(self.arm, self.qa, self.qb, 0.5, 0.2, w0=None)
        self.assertEqual(a, b)

    def test_trapezoid_slower_with_lower_no_load_speed(self):
        t = [trap.min_time_trap(self.arm, self.qa, self.qb, 5.0, 0.05, 1e9, 0.2, w0=w) for w in (None, 10.0, 5.0)]
        self.assertLessEqual(t[0], t[1] + 1e-9)
        self.assertLess(t[1], t[2])

    def test_trapezoid_infeasible_when_speed_reaches_w0(self):
        # the cruise speed of a very short move exceeds a tiny w0 whatever the torque: no feasible T below tmax only if tmax is small
        self.assertIsNone(trap.min_time_trap(self.arm, self.qa, self.qb, 5.0, 0.05, 1e9, 0.2, tmax=0.05, w0=5.0))

    def test_profile_beats_trapezoid_with_motor_curve(self):
        w0 = 6.0
        t = self.T(w0, 800)
        bt = trap.best_trap(self.arm, self.qa, self.qb, 5.0, 0.05, 1e9, fracs=(0.05, 0.1, 0.2, 0.3, 0.5), w0=w0)
        self.assertLess(t, bt[0])


if __name__ == "__main__":
    unittest.main()
