import math, unittest
from robofab_jawcap import model, topp
from robofab_jawcap.model import Arm, G, min_time, min_time_capped

M = 0.00595
ARM = Arm(0.12, 0.12, 0.12, 0.12, 0.105 + M)
QA, QB = ARM.ik(0.15, 0.0, -1), ARM.ik(0.05, 0.1, -1)
F0 = M * G / 1.0   # static hold force at mu = 0.5


class T(unittest.TestCase):
    def test_jaw_interval_endpoints_sit_on_the_disc(self):
        w = topp.wrist_coeffs(ARM, QA, QB, 0.4)
        u, rmax = 3.0, 25.0
        lo, hi = topp.jaw_interval(w, u, rmax)
        (pr, pz), (qr, qz) = w
        for sdd in (lo, hi):
            self.assertAlmostEqual(math.hypot(qr * u + pr * sdd, G + qz * u + pz * sdd), rmax, places=6)
        mid = 0.5 * (lo + hi)
        self.assertLess(math.hypot(qr * u + pr * mid, G + qz * u + pz * mid), rmax)

    def test_cap_below_static_hold_is_infeasible(self):
        self.assertIsNone(topp.solve(ARM, QA, QB, 5.0, jaw_cap=0.9 * F0, mass=M))

    def test_loose_cap_changes_nothing(self):
        free = topp.solve(ARM, QA, QB, 5.0)
        loose = topp.solve(ARM, QA, QB, 5.0, jaw_cap=1e4 * F0, mass=M)
        self.assertAlmostEqual(free["T"], loose["T"], delta=1e-9)

    def test_time_falls_as_cap_loosens(self):
        ts = [topp.solve(ARM, QA, QB, 5.0, jaw_cap=k * F0, mass=M)["T"] for k in (1.2, 1.5, 2.0, 4.0, 10.0, 50.0)]
        self.assertTrue(all(a >= b - 1e-9 for a, b in zip(ts, ts[1:])))

    def test_cap_and_torque_hold_on_the_computed_profile(self):
        # the force is recomputed by an independent finite-difference of the kinematics (wrist_force)
        for k in (1.25, 2.0, 5.0):
            p = topp.solve(ARM, QA, QB, 5.0, jaw_cap=k * F0, mass=M)
            f = topp.wrist_force(ARM, QA, QB, p, M)["force"]
            self.assertLessEqual(f, k * F0 * 1.05)
            self.assertLessEqual(max(topp.peak_torque(ARM, QA, QB, p)), 5.0 * 1.03)

    def test_cap_binds_when_tight(self):
        p = topp.solve(ARM, QA, QB, 5.0, jaw_cap=1.5 * F0, mass=M)
        f = topp.wrist_force(ARM, QA, QB, p, M)["force"]
        self.assertGreater(f, 1.4 * F0)

    def test_not_slower_than_capped_min_jerk(self):
        for k in (1.25, 2.0, 5.0):
            p = topp.solve(ARM, QA, QB, 5.0, jaw_cap=k * F0, mass=M)
            tj = min_time_capped(ARM, QA, QB, 5.0, M, k * F0)
            self.assertLessEqual(p["T"], tj + 1e-6)

    def test_capped_min_jerk_respects_both_limits(self):
        tj = min_time_capped(ARM, QA, QB, 5.0, M, 2.0 * F0)
        r = model.move(ARM, QA, QB, tj, n=100, mass=M)
        self.assertLessEqual(r["force"], 2.0 * F0 * 1.001)
        self.assertLessEqual(max(r["tau1"], r["tau2"]), 5.0 * 1.001)
        r2 = model.move(ARM, QA, QB, tj * 0.98, n=100, mass=M)
        self.assertTrue(r2["force"] > 2.0 * F0 or max(r2["tau1"], r2["tau2"]) > 5.0)

    def test_capped_min_jerk_matches_uncapped_when_loose(self):
        a = min_time_capped(ARM, QA, QB, 5.0, M, 1e9)
        b = min_time(ARM, QA, QB, 5.0, dt=0.001)
        self.assertAlmostEqual(a, b, delta=0.0015)


if __name__ == "__main__":
    unittest.main()
