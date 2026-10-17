import math
import unittest

from mount_twin.model import (chord, dead_reckon, fit_rotation, fit_std, integrate, random_path, rot, lap_error_3d,
                              simulate_lap_3d)


class T(unittest.TestCase):
    def test_estimate_is_rotated_truth(self):
        ths, vbs = random_path(300, turn=0.3, seed=1)
        true = integrate(ths, vbs)
        est = dead_reckon(ths, vbs, 0.2)
        for t, p in zip(true, est):
            q = rot(-0.2, t)
            self.assertAlmostEqual(q[0], p[0], places=9)
            self.assertAlmostEqual(q[1], p[1], places=9)

    def test_error_is_chord_times_displacement(self):
        ths, vbs = random_path(200, turn=0.2, seed=2)
        true = integrate(ths, vbs)
        est = dead_reckon(ths, vbs, 0.15)
        for t, p in zip(true, est):
            err = math.hypot(t[0] - p[0], t[1] - p[1])
            self.assertAlmostEqual(err, chord(0.15) * math.hypot(*t), places=9)

    def test_closed_loop_hides_error(self):
        n = 400
        ths = [2 * math.pi * (k + 0.5) / n for k in range(n)]
        vbs = [(2 * math.pi / n, 0.0)] * n
        true = integrate(ths, vbs)
        est = dead_reckon(ths, vbs, 0.3)
        self.assertLess(math.hypot(true[-1][0] - est[-1][0], true[-1][1] - est[-1][1]), 1e-9)
        self.assertGreater(max(math.hypot(a[0] - b[0], a[1] - b[1]) for a, b in zip(true, est)), 0.1)

    def test_fit_recovers_angle_noiseless(self):
        ths, vbs = random_path(100, turn=0.2, seed=3)
        true = integrate(ths, vbs)
        est = dead_reckon(ths, vbs, -0.25)
        self.assertAlmostEqual(fit_rotation(est, true), -0.25, places=9)

    def test_fit_std_matches_formula(self):
        import random
        ths, vbs = random_path(100, turn=0.2, seed=4)
        true = integrate(ths, vbs)
        est = dead_reckon(ths, vbs, 0.1)
        r = random.Random(0)
        a = []
        for _ in range(3000):
            ref = [(p[0] + r.gauss(0, 0.5), p[1] + r.gauss(0, 0.5)) for p in true]
            a.append(fit_rotation(est, ref))
        m = sum(a) / len(a)
        sd = (sum((x - m) ** 2 for x in a) / (len(a) - 1)) ** 0.5
        self.assertAlmostEqual(sd / fit_std(0.5, est), 1.0, delta=0.05)

    def test_3d_vertical_drift_closed_form(self):
        x, y, z = simulate_lap_3d(0.1, 5.0, 3)
        self.assertAlmostEqual(z, lap_error_3d(0.1, 5.0, 3), places=6)
        self.assertLess(math.hypot(x, y), 1e-6)


if __name__ == "__main__":
    unittest.main()
