import math
import random
import unittest

from tilt_twin.model import (Q, p_true, second_moment, is_relvar, optimal_theta, run_is,
                             estimate, naive_relvar, ess)


class T(unittest.TestCase):
    def test_theta_zero_is_naive(self):
        b, n = 4.0, 4
        p = p_true(b, n)
        self.assertAlmostEqual(second_moment(b, n, 0.0), p, places=15)
        self.assertAlmostEqual(is_relvar(b, n, 0.0), (1 - p) / p, places=9)
        self.assertAlmostEqual(naive_relvar(p, 1), (1 - p) / p, places=12)

    def test_unbiased_and_variance_match_simulation(self):
        b, n, th = 12.0, 4, 3.0
        rng = random.Random(1)
        v = run_is(b, n, th, 400000, rng)
        m = sum(v) / len(v)
        p = p_true(b, n)
        self.assertLess(abs(m - p) / p, 0.02)
        var = sum((x - m) ** 2 for x in v) / (len(v) - 1)
        self.assertAlmostEqual(var / p ** 2, is_relvar(b, n, th), delta=0.05 * is_relvar(b, n, th))

    def test_optimal_shift_near_b_over_n_and_beats_neighbours(self):
        b, n = 16.0, 4
        t = optimal_theta(b, n)
        self.assertAlmostEqual(t, b / n, delta=0.35)
        for d in (-0.5, 0.5):
            self.assertLess(second_moment(b, n, t), second_moment(b, n, t + d))

    def test_overtilt_blows_up(self):
        b, n = 12.0, 4
        self.assertGreater(is_relvar(b, n, 6.0), 1e3 * is_relvar(b, n, b / n))

    def test_ess_bounds(self):
        self.assertEqual(ess([0.0, 0.0]), 0.0)
        self.assertAlmostEqual(ess([1.0, 1.0, 0.0]), 2.0)

    def test_estimate_interval(self):
        m, lo, hi = estimate([1.0, 2.0, 3.0])
        self.assertAlmostEqual(m, 2.0)
        self.assertLess(lo, m)
        self.assertGreater(hi, m)


if __name__ == "__main__":
    unittest.main()
