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

    def test_exact_step_count_random_grid_including_tol_above_range(self):
        # tol >= R (the state reaches tol while still speed-capped) was wrong in 9 of 24 audit probes (2026-11-07)
        rng = random.Random(7)
        bad = 0
        for _ in range(400):
            k, x0, tol = rng.uniform(0.05, 0.95), rng.uniform(0.01, 300), rng.uniform(1e-3, 3.0)
            if steps_to_tol(run_p(k, 1.0, x0, 20000), tol) != real_steps(k, 1.0, x0, tol):
                bad += 1
        self.assertEqual(bad, 0)
        self.assertEqual(real_steps(0.25, 1.0, 1.6, 1.1), 2)   # by hand: 1.6 -> 1.35 -> 1.1

    def test_conditional_integration_by_hand(self):
        # kp=0.5, ki=0.1, R=1, x0=3. While |x| > R, z stays 0 and x drops by kp*R = 0.5 per step:
        # 3 -> 2.5 -> 2.0 -> 1.5 -> 1.0. At x = 1.0 (not > R) z = 1 and x = 1 - 0.5 - 0.1 = 0.4;
        # then z = 1.4 and x = 0.4 - 0.2 - 0.14 = 0.06.
        xs = run_pi(0.5, 0.1, 1.0, 3.0, 6, freeze=True)
        for got, want in zip(xs, [3.0, 2.5, 2.0, 1.5, 1.0, 0.4, 0.06]):
            self.assertAlmostEqual(got, want, places=12)
        # without the freeze the integrator winds up from the first step: z = 1, x = 3 - 0.5 - 0.1 = 2.4
        self.assertAlmostEqual(run_pi(0.5, 0.1, 1.0, 3.0, 1)[1], 2.4, places=12)

    def test_conditional_integration_holds_within_range_overshoot(self):
        # whitepaper claim 2: for (0.5, 0.1) the frozen loop overshoots by the within-range value (0.211R) at any x0
        ref = overshoot(run_pi(0.5, 0.1, 1.0, 1.0, 2000))
        self.assertAlmostEqual(ref, 0.21136, places=5)
        for x0 in (2.0, 10.0, 1000.0):
            self.assertAlmostEqual(overshoot(run_pi(0.5, 0.1, 1.0, x0, 6000, freeze=True)), ref, places=9)
        self.assertGreater(overshoot(run_pi(0.5, 0.1, 1.0, 1000.0, 6000)), 800)   # unfrozen: 870R

    def test_twin_radius_is_the_decay_rate_of_the_linear_loop(self):
        # Independent of the characteristic polynomial: the linear PI loop is v+ = A v with v = (x, z),
        # A = [[1-kp-ki, -ki], [1, 1]]; ||A^n||^(1/n) -> spectral radius (Gelfand).
        def norm_root(kp, ki, n=3000):
            a = [[1 - kp - ki, -ki], [1.0, 1.0]]
            m, scale = [[1.0, 0.0], [0.0, 1.0]], 0.0
            for _ in range(n):
                m = [[m[i][0] * a[0][j] + m[i][1] * a[1][j] for j in range(2)] for i in range(2)]
                s = max(abs(v) for row in m for v in row)
                m = [[v / s for v in row] for row in m]
                scale += math.log(s)
            return math.exp(scale / n)
        for kp, ki in ((0.5, 0.1), (0.3, 0.05), (0.5, 0.2), (0.2, 0.01)):   # last pair has real roots
            self.assertAlmostEqual(twin_radius(kp, ki), norm_root(kp, ki), places=2)
        self.assertAlmostEqual(twin_radius(0.5, 0.1), math.sqrt(0.5), places=12)   # complex pair: |z|^2 = det = 1-kp


if __name__ == "__main__":
    unittest.main()
