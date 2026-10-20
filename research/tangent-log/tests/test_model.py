import math
import unittest
from tangent_log import *


class T(unittest.TestCase):
    def test_equals_log_inside(self):
        eps = .05
        for r in (.05, .2, .5, .93):
            self.assertAlmostEqual(loss(r, 1, eps), -math.log(r) + kappa(eps), 12)
            self.assertAlmostEqual(loss(r, 0, eps), -math.log(1 - r) + kappa(eps), 12)

    def test_strictly_proper_everywhere(self):
        eps = .1
        for p in (0, .02, .1, .4, .97, 1):
            for r in [i / 200 for i in range(201)]:
                self.assertGreaterEqual(exp_loss(r, p, eps), exp_loss(p, p, eps) - 1e-12)
                if abs(r - p) > 1e-9:
                    self.assertGreater(exp_loss(r, p, eps), exp_loss(p, p, eps))

    def test_range_closed_form_and_bound(self):
        for eps in (.001, .05, .2):
            R = score_range(eps)
            self.assertAlmostEqual(loss(0, 1, eps), R, 10)
            self.assertAlmostEqual(loss(1, 0, eps), R, 10)
            m = max(loss(r / 500, y, eps) for r in range(501) for y in (0, 1))
            self.assertAlmostEqual(m, R, 10)

    def test_excess_is_bregman(self):
        eps, p, r = .05, .3, .01
        self.assertAlmostEqual(exp_loss(r, p, eps) - exp_loss(p, p, eps), excess(r, p, eps), 12)

    def test_beats_brier_in_tail(self):
        eps = .001
        p = crossover(eps)
        self.assertAlmostEqual(efficiency(p, eps), 2.0, 9) if p > eps else None
        self.assertGreater(efficiency(.005, eps), 2)
        self.assertLess(efficiency(.5, .001), 2)

    def test_best_eps_is_truth(self):
        for p in (.3, .02, .001):
            self.assertAlmostEqual(best_eps(p) / p, 1, delta=0.01)
