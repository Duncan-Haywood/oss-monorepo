import math
import random
import unittest

from interleave_twin.model import (q_lag, residual_real, residual_twin, residual_enum, copies_needed_twin, copies_needed_real,
                                   best_design, best_spacing_for_deadline, simulate)


class TestInterleave(unittest.TestCase):
    def test_closed_form_matches_enumeration(self):
        for p, lam in ((0.1, 0.0), (0.2, 0.7), (0.3, 0.9), (0.05, 0.5)):
            for r, g in ((2, 1), (3, 1), (3, 2), (4, 3)):
                offs = [i * g for i in range(r)]
                self.assertAlmostEqual(residual_real(p, lam, r, g), residual_enum(p, lam, offs), places=12)

    def test_enumeration_with_irregular_offsets(self):
        p, lam = 0.25, 0.8
        v = residual_enum(p, lam, [0, 1, 5])
        self.assertAlmostEqual(v, p * q_lag(p, lam, 1) * q_lag(p, lam, 4), places=12)

    def test_zero_correlation_is_twin(self):
        for r in (1, 2, 5):
            self.assertAlmostEqual(residual_real(0.3, 0.0, r, 1), residual_twin(0.3, r), places=14)

    def test_marginal_is_p(self):
        self.assertAlmostEqual(residual_real(0.3, 0.9, 1, 1), 0.3, places=14)
        self.assertAlmostEqual(residual_enum(0.3, 0.9, [0]), 0.3, places=14)

    def test_spacing_recovers_independence(self):
        p, lam = 0.2, 0.8
        self.assertLess(abs(residual_real(p, lam, 2, 80) - p * p), 2 * p * (1 - p) * lam ** 80)
        # monotone decreasing in g
        v = [residual_real(p, lam, 3, g) for g in range(1, 20)]
        self.assertTrue(all(a > b for a, b in zip(v, v[1:])))

    def test_ratio_formula_r2(self):
        p, lam, g = 0.2, 0.7, 2
        ratio = residual_real(p, lam, 2, g) / residual_twin(p, 2)
        self.assertAlmostEqual(ratio, 1 + lam ** g * (1 - p) / p, places=12)

    def test_monte_carlo(self):
        rng = random.Random(1)
        for r, g in ((2, 1), (3, 2)):
            mc = simulate(0.3, 0.8, r, g, 150000, rng)
            ex = residual_real(0.3, 0.8, r, g)
            se = math.sqrt(ex * (1 - ex) / 150000)
            self.assertLess(abs(mc - ex), 4 * se)

    def test_copies_needed(self):
        self.assertEqual(copies_needed_twin(0.1, 1e-3), 3)
        r = copies_needed_real(0.1, 0.8, 1e-3, 1)
        self.assertLessEqual(residual_real(0.1, 0.8, r, 1), 1e-3)
        self.assertGreater(residual_real(0.1, 0.8, r - 1, 1), 1e-3)

    def test_best_design_is_optimal_and_feasible(self):
        p, lam, eps = 0.2, 0.8, 1e-3
        lat, r, g, res = best_design(p, lam, eps, 6)
        self.assertLessEqual(res, eps)
        self.assertEqual(lat, (r - 1) * g)
        for rr in range(2, 7):
            for gg in range(1, 400):
                if (rr - 1) * gg < lat:
                    self.assertGreater(residual_real(p, lam, rr, gg), eps)

    def test_deadline_spacing(self):
        g, res = best_spacing_for_deadline(0.2, 0.8, 12, 3)
        self.assertEqual(g, 6)
        self.assertAlmostEqual(res, residual_real(0.2, 0.8, 3, 6))


if __name__ == "__main__":
    unittest.main()
