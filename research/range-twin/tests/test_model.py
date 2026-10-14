import math
import random
import unittest

from range_twin.model import (clip, run_p, steps_to_tol, twin_steps, real_steps, run_pi, twin_radius, overshoot,
                              settle_index, fitted_gain_factor)


class T(unittest.TestCase):
    def test_clip(self):
        self.assertEqual(clip(5, 2), 2)
        self.assertEqual(clip(-5, 2), -2)
        self.assertEqual(clip(1, 2), 1)

    def test_no_range_limit_matches_twin_law(self):
        for k in (0.2, 0.5, 0.8):
            xs = run_p(k, 1e18, 37.0, 200)
            self.assertEqual(steps_to_tol(xs, 0.01), twin_steps(k, 37.0, 0.01))

    def test_exact_step_count(self):
        bad = 0
        for k in (0.1, 0.25, 0.5, 0.9):
            for x0 in (1.5, 3, 10, 100, 1234.5):
                for tol in (0.1, 1e-3):
                    xs = run_p(k, 1.0, x0, 20000)
                    if steps_to_tol(xs, tol) != real_steps(k, 1.0, x0, tol):
                        bad += 1
        self.assertEqual(bad, 0)

    def test_twin_underestimates_beyond_range(self):
        self.assertLess(twin_steps(0.25, 100, 0.01), real_steps(0.25, 1.0, 100, 0.01))
        self.assertEqual(twin_steps(0.25, 0.9, 0.01), real_steps(0.25, 1.0, 0.9, 0.01))

    def test_scale_invariance(self):
        ref = None
        for r in (0.01, 1.0, 100.0):
            xs = run_pi(0.5, 0.1, r, 20 * r, 4000)
            v = overshoot(xs) / r
            ref = v if ref is None else ref
            self.assertAlmostEqual(v, ref, places=9)

    def test_pi_within_range_equals_twin(self):
        a = run_pi(0.5, 0.1, 1e18, 10.0, 300)
        b = run_pi(0.5, 0.1, 100.0, 10.0, 300)
        self.assertEqual(a, b)
        self.assertLess(twin_radius(0.5, 0.1), 1)
        self.assertLess(abs(a[-1]), 1e-6)

    def test_settle_index(self):
        self.assertEqual(settle_index([5, 3, 0.5, 0.2, 0.1], 1.0), 2)
        self.assertEqual(settle_index([0.1], 1.0), 0)

    def test_fitted_gain_factor_matches_least_squares(self):
        rng = random.Random(1)
        r, l = 1.0, 3.0
        xs = [rng.uniform(-l, l) for _ in range(400000)]
        num = sum(x * clip(x, r) for x in xs)
        den = sum(x * x for x in xs)
        self.assertAlmostEqual(num / den, fitted_gain_factor(r, l), places=2)
        self.assertEqual(fitted_gain_factor(5.0, 3.0), 1.0)


if __name__ == "__main__":
    unittest.main()
