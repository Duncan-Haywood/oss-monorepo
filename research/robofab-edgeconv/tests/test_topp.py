import math, unittest
from robofab_edgeconv import model, topp
from robofab_edgeconv.model import Arm, min_time


class T(unittest.TestCase):
    def test_single_joint_closed_form(self):
        # zero gravity, elbow straight, only joint 1 moves: constant inertia m11, no Coriolis, so the
        # time-optimal move is bang-bang with T = 2 sqrt(dtheta * m11 / tau)
        old = model.G
        model.G = 0.0
        try:
            arm = Arm(0.2, 0.15, 0.3, 0.2, 0.1)
            m11 = arm.mass_matrix(0.0)[0]
            d, tau = 0.8, 3.0
            p = topp.solve(arm, (0.1, 0.0), (0.1 + d, 0.0), tau, n=400)
            self.assertAlmostEqual(p["T"], 2 * math.sqrt(d * m11 / tau), delta=0.01 * p["T"])
        finally:
            model.G = old

    def test_zero_gravity_time_scales_inverse_sqrt_torque(self):
        old = model.G
        model.G = 0.0
        try:
            arm = Arm(0.12, 0.12, 0.12, 0.12, 0.105)
            qa, qb = (0.3, -1.0), (1.0, -0.4)
            t1 = topp.solve(arm, qa, qb, 2.0)["T"]
            t4 = topp.solve(arm, qa, qb, 8.0)["T"]
            self.assertAlmostEqual(t1 / t4, 2.0, delta=0.03)
        finally:
            model.G = old

    def test_limit_respected_and_not_slower_than_min_jerk(self):
        arm = Arm(0.12, 0.12, 0.12, 0.12, 0.105)
        qa, qb = arm.ik(0.15, 0.0, -1), arm.ik(0.05, 0.1, -1)
        for tau in (2.0, 5.0):
            p = topp.solve(arm, qa, qb, tau)
            self.assertIsNotNone(p)
            self.assertLessEqual(max(topp.peak_torque(arm, qa, qb, p)), tau * 1.03)
            tj = min_time(arm, qa, qb, tau)
            self.assertLessEqual(p["T"], tj + 1e-9)

    def test_gravity_beyond_limit_is_infeasible(self):
        arm = Arm(0.5, 0.5, 5.0, 5.0, 1.0)
        self.assertIsNone(topp.solve(arm, (0.0, 0.5), (0.5, 0.5), 0.5))

    def test_force_at_rest_is_static_bound(self):
        arm = Arm(0.12, 0.12, 0.12, 0.12, 0.105)
        qa, qb = arm.ik(0.15, 0.0, -1), arm.ik(0.05, 0.1, -1)
        p = topp.solve(arm, qa, qb, 5.0)
        f = topp.wrist_force(arm, qa, qb, p, 0.00595)
        self.assertGreaterEqual(f["force"], 0.00595 * model.G / 1.0 - 1e-9)


if __name__ == "__main__":
    unittest.main()


class Convergence(unittest.TestCase):
    def test_time_converges_with_node_count(self):
        # (robofab-edgeconv) with gravity and a joint speed cap there is no closed form, so check that the
        # solver's time falls with n and that successive changes shrink
        arm = Arm(0.12, 0.12, 0.12, 0.12, 0.2)
        T = [topp.solve(arm, (0.3, -1.2), (1.0, -0.6), 5.0, n=n, wmax=1.0)["T"] for n in (100, 400, 1600, 6400)]
        d = [T[i] - T[i + 1] for i in range(3)]
        self.assertTrue(all(x > 0 for x in d), T)
        self.assertLess(d[1], d[0])
        self.assertLess(d[2], d[1])
