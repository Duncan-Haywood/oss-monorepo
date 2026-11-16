import math, unittest
from robofab_armaccel.model import Arm, G, min_jerk, move, min_time


def ke(arm, q, qd, h=1e-6):
    """Kinetic energy from forward-kinematics velocities (independent of mass_matrix)."""
    l1, l2 = arm.l1, arm.l2
    def pts(q1, q2):
        a, b = q1, q1 + q2
        e1 = (l1 * math.cos(a), l1 * math.sin(a))
        c1 = (e1[0] / 2, e1[1] / 2)
        c2 = (e1[0] + l2 / 2 * math.cos(b), e1[1] + l2 / 2 * math.sin(b))
        tip = (e1[0] + l2 * math.cos(b), e1[1] + l2 * math.sin(b))
        return c1, c2, tip
    p0, p1 = pts(*q), pts(q[0] + qd[0] * h, q[1] + qd[1] * h)
    v = [[(p1[i][k] - p0[i][k]) / h for k in range(2)] for i in range(3)]
    t = 0.5 * arm.m1 * sum(x * x for x in v[0]) + 0.5 * arm.m2 * sum(x * x for x in v[1]) + 0.5 * arm.mp * sum(x * x for x in v[2])
    t += 0.5 * (arm.m1 * l1 ** 2 / 12) * qd[0] ** 2 + 0.5 * (arm.m2 * l2 ** 2 / 12) * (qd[0] + qd[1]) ** 2
    return t


class T(unittest.TestCase):
    arm = Arm(0.2, 0.15, 0.3, 0.2, 0.1)

    def test_mass_matrix_matches_kinetic_energy(self):
        q, qd = (0.4, -0.9), (1.3, -0.7)
        m11, m12, m22 = self.arm.mass_matrix(q[1])
        e = 0.5 * (m11 * qd[0] ** 2 + 2 * m12 * qd[0] * qd[1] + m22 * qd[1] ** 2)
        self.assertAlmostEqual(e, ke(self.arm, q, qd), places=5)

    def test_gravity_is_potential_gradient(self):
        a = self.arm
        def pe(q1, q2):
            return G * (a.m1 * a.l1 / 2 * math.sin(q1) + a.m2 * (a.l1 * math.sin(q1) + a.l2 / 2 * math.sin(q1 + q2))
                        + a.mp * (a.l1 * math.sin(q1) + a.l2 * math.sin(q1 + q2)))
        q, h = (0.5, -1.1), 1e-6
        g = a.gravity(*q)
        self.assertAlmostEqual(g[0], (pe(q[0] + h, q[1]) - pe(q[0] - h, q[1])) / (2 * h), places=5)
        self.assertAlmostEqual(g[1], (pe(q[0], q[1] + h) - pe(q[0], q[1] - h)) / (2 * h), places=5)

    def test_torque_matches_lagrange_energy_balance(self):
        # power balance over a move: integral of tau.qd dt = change in KE + PE
        a, qa, qb, T_ = self.arm, (0.2, -1.0), (0.9, -0.4), 0.6
        n, work = 2000, 0.0
        for k in range(n):
            s = (k + 0.5) / n
            p, v, ac = min_jerk(s)
            q = (qa[0] + (qb[0] - qa[0]) * p, qa[1] + (qb[1] - qa[1]) * p)
            qd = ((qb[0] - qa[0]) * v / T_, (qb[1] - qa[1]) * v / T_)
            qdd = ((qb[0] - qa[0]) * ac / T_ ** 2, (qb[1] - qa[1]) * ac / T_ ** 2)
            t = a.torque(q, qd, qdd)
            work += (t[0] * qd[0] + t[1] * qd[1]) * T_ / n
        def pe(q1, q2):
            return G * (a.m1 * a.l1 / 2 * math.sin(q1) + a.m2 * (a.l1 * math.sin(q1) + a.l2 / 2 * math.sin(q1 + q2))
                        + a.mp * (a.l1 * math.sin(q1) + a.l2 * math.sin(q1 + q2)))
        self.assertAlmostEqual(work, pe(*qb) - pe(*qa), places=4)   # starts and ends at rest

    def test_ik_roundtrip_and_reach(self):
        a = self.arm
        for br in (1, -1):
            q = a.ik(0.25, 0.05, br)
            x = a.fk(*q)
            self.assertAlmostEqual(x[0], 0.25, places=9)
            self.assertAlmostEqual(x[1], 0.05, places=9)
        self.assertIsNone(a.ik(0.5, 0.0))

    def test_wrist_acceleration_and_jaw_force_on_a_circle(self):
        # Elbow held straight (q2 = 0): the wrist rides a circle of radius L = l1 + l2 at angle q1(t), so by hand
        #   a_r = -L (q1'' sin q1 + q1'^2 cos q1),  a_z = L (q1'' cos q1 - q1'^2 sin q1)
        # and the per-jaw bound is m sqrt((g + a_z)^2 + a_r^2) / (2 mu). Checked at the same samples move() uses.
        a = Arm(0.2, 0.15, 0.3, 0.2, 0.1)
        L, q0, dq, T_, n, m, mu = 0.35, -0.3, 1.1, 0.4, 200, 0.006, 0.5
        az_up = ar_max = force = 0.0
        for k in range(n + 1):
            p, v, ac = min_jerk(k / n)
            q, qd, qdd = q0 + dq * p, dq * v / T_, dq * ac / T_ ** 2
            ar = -L * (qdd * math.sin(q) + qd * qd * math.cos(q))
            az = L * (qdd * math.cos(q) - qd * qd * math.sin(q))
            az_up, ar_max = max(az_up, az), max(ar_max, abs(ar))
            force = max(force, m * math.hypot(G + az, ar) / (2 * mu))
        r = move(a, (q0, 0.0), (q0 + dq, 0.0), T_, n=n, mu=mu, mass=m)
        self.assertGreater(az_up, 10)          # a real dynamic move (14 m/s^2), not a rest pose
        self.assertAlmostEqual(r["az_up"], az_up, delta=1e-3 * az_up)
        self.assertAlmostEqual(r["ar"], ar_max, delta=1e-3 * ar_max)
        self.assertAlmostEqual(r["force"], force, delta=1e-3 * force)

    def test_jaw_force_adds_upward_acceleration_to_gravity(self):
        # A pure vertical lift through q1 = 0 (wrist at the circle's side, moving straight up at mid-move):
        # accelerating upward must raise the required grip above the static m g / (2 mu).
        a = Arm(0.2, 0.15, 0.3, 0.2, 0.1)
        r = move(a, (-0.1, 0.0), (0.1, 0.0), 0.2, mass=0.006, mu=0.5)
        self.assertGreater(r["force"], 0.006 * G / 1.0 * 1.5)

    def test_faster_move_needs_more_torque_and_grip(self):
        qa, qb = (0.2, -1.0), (0.9, -0.4)
        slow, fast = move(self.arm, qa, qb, 1.0, mass=0.006), move(self.arm, qa, qb, 0.3, mass=0.006)
        self.assertGreater(max(fast["tau1"], fast["tau2"]), max(slow["tau1"], slow["tau2"]))
        self.assertGreater(fast["force"], slow["force"])

    def test_resting_grip_force_is_static_bound(self):
        r = move(self.arm, (0.3, -0.5), (0.3, -0.5), 1.0, mass=0.006, mu=0.5)
        self.assertAlmostEqual(r["force"], 0.006 * G / 1.0, places=6)

    def test_min_time_respects_limit_and_is_monotone(self):
        qa, qb = (0.2, -1.0), (0.9, -0.4)
        t5, t1 = min_time(self.arm, qa, qb, 10.0), min_time(self.arm, qa, qb, 3.0)
        self.assertLessEqual(t5, t1)
        r = move(self.arm, qa, qb, t1, n=100)
        self.assertLessEqual(max(r["tau1"], r["tau2"]), 3.0 + 1e-9)

    def test_gravity_alone_over_limit_gives_none(self):
        self.assertIsNone(min_time(self.arm, (0.2, -1.0), (0.9, -0.4), 0.01, tmax=0.5))


if __name__ == "__main__":
    unittest.main()
