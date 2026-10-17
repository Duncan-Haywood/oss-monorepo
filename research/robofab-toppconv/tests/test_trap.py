import math, unittest
from robofab_toppconv import topp, trap
from robofab_toppconv.model import Arm, G, min_time_capped

M = 0.00595
ARM = Arm(0.12, 0.12, 0.12, 0.12, 0.105 + M)
QA, QB = ARM.ik(0.15, 0.0, -1), ARM.ik(0.05, 0.1, -1)
BIG = 1e9


class T(unittest.TestCase):
    def test_profile_is_continuous_and_reaches_one(self):
        for f in (0.1, 0.3, 0.5):
            self.assertAlmostEqual(trap.trap(0.0, f)[0], 0.0)
            self.assertAlmostEqual(trap.trap(1.0, f)[0], 1.0, places=9)
            self.assertAlmostEqual(trap.trap(f, f)[0], trap.trap(f + 1e-9, f)[0], places=6)
            self.assertAlmostEqual(trap.trap(0.5, f)[1], 1.0 / (1.0 - f))

    def test_position_integrates_velocity(self):
        f, n = 0.2, 20000
        p = sum(trap.trap((k + 0.5) / n, f)[1] for k in range(n)) / n
        self.assertAlmostEqual(p, 1.0, places=4)

    def test_speed_limit_binds_with_loose_torque(self):
        dmax = max(abs(QB[0] - QA[0]), abs(QB[1] - QA[1]))
        w = 1.0
        T = trap.min_time_trap(ARM, QA, QB, 1e3, M, BIG, 0.1, wmax=w)
        self.assertAlmostEqual(T, dmax / (0.9 * w), delta=2e-3)

    def test_time_falls_as_speed_limit_loosens(self):
        ts = [trap.min_time_trap(ARM, QA, QB, 5.0, M, BIG, 0.2, wmax=w) for w in (1.0, 2.0, 4.0)]
        self.assertGreater(ts[0], ts[1])
        self.assertGreater(ts[1], ts[2])

    def test_result_respects_limits(self):
        T = trap.min_time_trap(ARM, QA, QB, 5.0, M, 2 * M * G, 0.25, wmax=3.0)
        r = trap.move(ARM, QA, QB, T * 1.001, 0.25, mass=M)
        self.assertLessEqual(max(r["tau1"], r["tau2"]), 5.0 * 1.002)
        self.assertLessEqual(r["force"], 2 * M * G * 1.002)

    def test_time_optimal_never_slower_than_best_trapezoid(self):
        for w in (None, 3.0, 1.0):
            prof = topp.solve(ARM, QA, QB, 5.0, wmax=w)
            bt = trap.best_trap(ARM, QA, QB, 5.0, M, BIG, wmax=w)
            self.assertLessEqual(prof["T"], bt[0] * 1.005)

    def test_best_trapezoid_not_slower_than_min_jerk_when_speed_limited(self):
        w = 1.0
        mj = min_time_capped(ARM, QA, QB, 5.0, M, BIG, wmax=w)
        bt = trap.best_trap(ARM, QA, QB, 5.0, M, BIG, wmax=w)
        self.assertLess(bt[0], mj)

    def test_infeasible_when_gravity_exceeds_torque(self):
        self.assertIsNone(trap.min_time_trap(ARM, QA, QB, 0.01, M, BIG, 0.2, tmax=5.0))

    def test_scurve_is_smooth_and_reaches_one(self):
        for f in (0.1, 0.3, 0.5):
            for j in (0.25, 0.5, 1.0):
                self.assertAlmostEqual(trap.trap(0.0, f, j)[0], 0.0)
                self.assertAlmostEqual(trap.trap(1.0, f, j)[0], 1.0, places=9)
                self.assertAlmostEqual(trap.trap(0.5, f, j)[1], 1.0 / (1.0 - f))
                # velocity and acceleration are continuous at the ramp ends (jerk-limited)
                e = 1e-7
                a0, a1 = trap.trap(f - e, f, j), trap.trap(f + e, f, j)
                self.assertAlmostEqual(a0[1], a1[1], places=5)
                self.assertAlmostEqual(a0[2], a1[2], places=3)
                self.assertAlmostEqual(trap.trap(e, f, j)[2], 0.0, places=3)

    def test_scurve_position_integrates_velocity(self):
        n = 20000
        p = sum(trap.trap((k + 0.5) / n, 0.2, 0.5)[1] for k in range(n)) / n
        self.assertAlmostEqual(p, 1.0, places=4)

    def test_j_zero_is_the_trapezoid(self):
        for x in (0.05, 0.3, 0.95):
            self.assertEqual(trap.trap(x, 0.2, 0.0), trap.trap_plain(x, 0.2))

    def test_scurve_peak_accel_exceeds_trapezoid(self):
        # same f, same peak speed, shorter constant-acceleration phase: higher peak acceleration
        self.assertGreater(trap.trap(0.1, 0.2, 1.0)[2], trap.trap(0.1, 0.2, 0.0)[2])

    def test_scurve_never_faster_than_trapezoid_on_same_grid(self):
        fr = (0.05, 0.2, 0.4)
        for w in (None, 1.0):
            t0 = trap.best_trap(ARM, QA, QB, 5.0, M, BIG, wmax=w, fracs=fr)[0]
            t1 = trap.best_trap(ARM, QA, QB, 5.0, M, BIG, wmax=w, fracs=fr, j=1.0)[0]
            self.assertGreaterEqual(t1, t0 * 0.995)


if __name__ == "__main__":
    unittest.main()
