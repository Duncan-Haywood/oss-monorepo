import math
import random
import unittest

from interference_twin.model import (echo_power, clear_range, mean_inv_d2, mean_interference, mean_rise_range, pd_one_interferer,
                                     pd_frame_mc, pd_given_geometry, binom_tail, mission_success_fixed, draw_geometry, range_at_pd,
                                     draw_d2)

SNR0, R0, T, C, D0, R = 1000.0, 50.0, 10.0, 5e5, 5.0, 200.0


class Tst(unittest.TestCase):
    def test_clear_range_solves_threshold(self):
        r = clear_range(SNR0, R0, T)
        self.assertAlmostEqual(echo_power(r, SNR0, R0), T, places=9)

    def test_mean_inv_d2_numeric(self):
        rng = random.Random(1)
        n = 400000
        m = sum(1.0 / draw_d2(D0, R, rng) for _ in range(n)) / n
        self.assertAlmostEqual(m, mean_inv_d2(D0, R), delta=0.02 * mean_inv_d2(D0, R))

    def test_mean_rise_range_solves_threshold(self):
        r = mean_rise_range(SNR0, R0, T, C, D0, R, 0.1, 4)
        S = echo_power(r, SNR0, R0)
        self.assertAlmostEqual(S, T * (1 + mean_interference(C, D0, R, 0.1, 4)), places=7)

    def test_no_interference_q0(self):
        S = echo_power(100.0, SNR0, R0)
        self.assertEqual(pd_one_interferer(S, T, C, D0, R, 0.0), 1.0)
        self.assertEqual(pd_given_geometry(S * 2, T, draw_geometry(3, D0, R, random.Random(2)), C, 0.0), 1.0)

    def test_pd_below_threshold_is_zero(self):
        self.assertEqual(pd_one_interferer(T * 0.5, T, C, D0, R, 0.2), 0.0)

    def test_closed_form_matches_mc(self):
        rng = random.Random(7)
        for r in (60.0, 100.0, 140.0):
            S = echo_power(r, SNR0, R0)
            exact = pd_one_interferer(S, T, C, D0, R, 0.2)
            mc = pd_frame_mc(S, T, C, D0, R, 0.2, 1, 40000, rng)
            self.assertAlmostEqual(exact, mc, delta=0.012)

    def test_geometry_enumeration_k1_matches_closed_form_average(self):
        rng = random.Random(11)
        S = echo_power(100.0, SNR0, R0)
        avg = sum(pd_given_geometry(S, T, draw_geometry(1, D0, R, rng), C, 0.2) for _ in range(40000)) / 40000
        self.assertAlmostEqual(avg, pd_one_interferer(S, T, C, D0, R, 0.2), delta=0.01)

    def test_binom_tail(self):
        self.assertAlmostEqual(binom_tail(10, 0, 0.3), 1.0)
        self.assertAlmostEqual(binom_tail(3, 2, 0.5), 0.5)
        self.assertAlmostEqual(binom_tail(5, 5, 0.9), 0.9 ** 5)

    def test_mission_success_monotone_in_distance(self):
        g = draw_geometry(3, D0, R, random.Random(4))
        vals = [mission_success_fixed(echo_power(r, SNR0, R0), T, g, C, 0.1, 10, 3) for r in (50, 80, 110, 140)]
        self.assertTrue(all(b <= a + 1e-12 for a, b in zip(vals, vals[1:])))

    def test_range_at_pd_bisection(self):
        r = range_at_pd(lambda x: 1.0 if x <= 77.0 else 0.0, 0.5, 1.0, 200.0)
        self.assertAlmostEqual(r, 77.0, places=6)


if __name__ == "__main__":
    unittest.main()
