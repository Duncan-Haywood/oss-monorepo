import math
import random
import unittest

from sweep_twin.model import (Room, Lidar, scan, snapshot, naive_points, deskew_points, fan, tilt, wall_x, naive_wall_x,
                              tilt_first_order, length_bias, converge_angle, velocity_from_converge, bearing_bias,
                              landmark_azimuth, odometry_velocity)

R, L = Room(), Lidar()


def walls(sc):
    return naive_points(sc), fan(sc, 0.0, 0.3), fan(sc, math.pi, 0.3)


class T(unittest.TestCase):
    def test_snapshot_is_exact(self):
        nv = naive_points(snapshot(R, L))
        sc = snapshot(R, L)
        f = fan(sc, 0.0, 0.3)
        self.assertLess(max(abs(nv[k][0] - R.d1) for k in f), 1e-12)
        self.assertLess(abs(tilt([nv[k] for k in f])), 1e-12)

    def test_naive_wall_matches_closed_form(self):
        sc = scan(R, L, 7.0)
        nv, f, b = walls(sc)
        for k in f:
            self.assertAlmostEqual(nv[k][0], naive_wall_x(R, L, 7.0, sc[k][1], True), places=12)
        for k in b:
            self.assertAlmostEqual(nv[k][0], naive_wall_x(R, L, 7.0, sc[k][1], False), places=12)

    def test_length_bias_exact(self):
        sc = scan(R, L, 10.0)
        nv, f, b = walls(sc)
        self.assertAlmostEqual(wall_x(nv, f) - wall_x(nv, b) - (R.d1 + R.d2), length_bias(L, 10.0), places=9)

    def test_parallel_wall_unbiased(self):
        sc = scan(R, L, 10.0)
        nv = naive_points(sc)
        for k in fan(sc, math.pi / 2, 0.3):
            self.assertAlmostEqual(nv[k][1], R.w, places=12)

    def test_deskew_exact_with_true_motion(self):
        sc = scan(R, L, 10.0, 1.5)
        dp = deskew_points(sc, 10.0, 1.5)
        # front wall measured by the deskewed points sits at the scan-start-frame wall distance d1
        for k in fan(sc, 0.0, 0.3):
            self.assertAlmostEqual(dp[k][0], R.d1, places=9)

    def test_tilt_signs_and_first_order(self):
        sc = scan(R, L, 5.0)
        nv, f, b = walls(sc)
        tf, tb = tilt([nv[k] for k in f]), tilt([nv[k] for k in b])
        self.assertLess(tf, 0)
        self.assertGreater(tb, 0)
        self.assertAlmostEqual(tf / tilt_first_order(R, L, 5.0), 1.0, delta=0.02)
        self.assertAlmostEqual((tb - tf) / converge_angle(R, L, 5.0), 1.0, delta=0.06)

    def test_spin_reversal_flips_sign(self):
        a = scan(R, L, 5.0)
        b = scan(R, Lidar(spin=-1, phi0=math.pi / 2), 5.0)
        ta = tilt([naive_points(a)[k] for k in fan(a, 0.0, 0.3)])
        tb = tilt([naive_points(b)[k] for k in fan(b, 0.0, 0.3)])
        self.assertAlmostEqual(ta, -tb, places=9)

    def test_velocity_inversion_noiseless(self):
        sc = scan(R, L, 1.0)
        nv, f, b = walls(sc)
        th = tilt([nv[k] for k in b]) - tilt([nv[k] for k in f])
        v = velocity_from_converge(Room(wall_x(nv, f), -wall_x(nv, b), R.w), L, th)
        self.assertAlmostEqual(v, 1.0, delta=0.03)

    def test_velocity_zero_noise_zero_v(self):
        sc = scan(R, L, 0.0)
        nv, f, b = walls(sc)
        self.assertLess(abs(tilt([nv[k] for k in b]) - tilt([nv[k] for k in f])), 1e-12)

    def test_bearing_bias_matches_bisection(self):
        for om in (0.5, 2.0):
            for beta in (1.0, 3.0):
                self.assertAlmostEqual(landmark_azimuth(L, om, beta) - beta, bearing_bias(L, om, beta), places=12)

    def test_odometry_bias_is_a_tf(self):
        for v0, a in ((5.0, 2.0), (0.0, 5.0), (5.0, -3.0)):
            self.assertAlmostEqual(odometry_velocity(R, L, v0, a) - (v0 + a * L.tau / 2), a * L.tau / 4, places=9)

    def test_constant_velocity_odometry_unbiased(self):
        self.assertAlmostEqual(odometry_velocity(R, L, 8.0, 0.0), 8.0, places=9)


if __name__ == "__main__":
    unittest.main()
