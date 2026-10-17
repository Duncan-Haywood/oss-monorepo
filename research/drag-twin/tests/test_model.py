import math
import random
import unittest

from drag_twin.model import (real_speed, twin_speed, real_time_to_ratio, twin_time_to_ratio, k_matched, k_lsq_uniform,
                             terminal_real, terminal_twin, stop_dist_real, stop_dist_twin, safe_speed_real,
                             safe_speed_twin, rk4_real, fit_k_from_coastdown)


class T(unittest.TestCase):
    def test_real_coastdown_closed_form_matches_rk4(self):
        v, x = rk4_real(5.0, 0.3, 0.0, 4.0, 1e-3)
        self.assertAlmostEqual(v, real_speed(4.0, 5.0, 0.3), places=9)
        self.assertAlmostEqual(x, math.log(1 + 0.3 * 5.0 * 4.0) / 0.3, places=5)

    def test_time_to_ratio(self):
        self.assertAlmostEqual(real_speed(real_time_to_ratio(10, 4.0, 0.2), 4.0, 0.2), 0.4, places=12)
        self.assertAlmostEqual(twin_speed(twin_time_to_ratio(10, 0.8), 3.0, 0.8), 0.3, places=12)

    def test_matched_twin_is_exact_in_force_at_fit_speed(self):
        c, vf = 0.25, 6.0
        self.assertAlmostEqual(k_matched(c, vf) * vf, c * vf * vf, places=12)

    def test_lsq_uniform_formula(self):
        c, vm, n = 0.2, 8.0, 20000
        vs = [vm * (i + 0.5) / n for i in range(n)]
        k = sum(c * v ** 3 for v in vs) / sum(v * v for v in vs)
        self.assertAlmostEqual(k, k_lsq_uniform(c, vm), places=4)

    def test_terminal_speed_fit_at_terminal_is_exact(self):
        F, c = 2.0, 0.5
        vt = terminal_real(F, c)
        self.assertAlmostEqual(terminal_twin(F, k_matched(c, vt)), vt, places=12)
        self.assertGreater(terminal_twin(F, k_matched(c, 0.5 * vt)), vt)

    def test_stopping_distance_closed_forms_match_rk4(self):
        B, c, v0 = 3.0, 0.4, 7.0
        d_real = stop_dist_real(v0, B, c)
        # integrate with u = -B until v = 0
        v, x, dt = v0, 0.0, 1e-5
        while v > 0:
            v, dx = rk4_real(v, c, -B, dt, dt)
            x += dx
        self.assertAlmostEqual(x, d_real, places=3)
        k = 0.9
        v, x = v0, 0.0
        while v > 0:
            a = -k * v - B
            v += a * dt
            x += v * dt
        self.assertAlmostEqual(x, stop_dist_twin(v0, B, k), places=3)

    def test_twin_with_k_to_zero_is_constant_deceleration(self):
        self.assertAlmostEqual(stop_dist_twin(6.0, 2.0, 1e-7), 36.0 / 4.0, places=4)

    def test_safe_speed_inverts_stop_distance(self):
        self.assertAlmostEqual(stop_dist_real(safe_speed_real(5.0, 3.0, 0.4), 3.0, 0.4), 5.0, places=10)
        self.assertAlmostEqual(stop_dist_twin(safe_speed_twin(5.0, 3.0, 0.9), 3.0, 0.9), 5.0, places=9)

    def test_fit_from_noiseless_coastdown_is_between_zero_and_k_at_v0(self):
        c, v0 = 0.3, 6.0
        k = fit_k_from_coastdown(c, v0, 6.0, 0.05)
        self.assertGreater(k, 0.0)
        self.assertLess(k, c * v0)
        self.assertGreater(k, 0.0)

    def test_fit_is_deterministic_given_rng(self):
        a = fit_k_from_coastdown(0.3, 6.0, 4.0, 0.1, 0.05, random.Random(1))
        b = fit_k_from_coastdown(0.3, 6.0, 4.0, 0.1, 0.05, random.Random(1))
        self.assertEqual(a, b)


if __name__ == "__main__":
    unittest.main()
