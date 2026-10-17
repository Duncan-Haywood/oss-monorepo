import math
import random
import unittest
from forecast_duel import *


class T(unittest.TestCase):
    def test_breakeven_is_midpoint(self):
        rA, rB = .3, .6
        self.assertAlmostEqual(mean_diff(rA, rB, breakeven(rA, rB)), 0, 12)

    def test_best_bet_maximises_growth_and_equals_kl(self):
        rA, rB, q = .7, .4, .68
        lam = best_bet(rA, rB, q)
        g = growth(lam, rA, rB, q)
        self.assertAlmostEqual(g, kl(q, breakeven(rA, rB)), 12)
        for e in (-.02, .02):
            self.assertLess(growth(lam + e, rA, rB, q), g)

    def test_no_growth_when_A_not_better(self):
        self.assertEqual(max_growth(.7, .4, .5), 0.0)
        self.assertEqual(best_bet(.7, .4, .5), 0.0) if mean_diff(.7, .4, .5) <= 0 else None

    def test_small_gap_quadratic(self):
        g = max_growth(.52, .48, .51)
        self.assertAlmostEqual(g / small_gap_growth(.52, .48, .51), 1, delta=0.01)

    def test_null_error_control_of_mixture(self):
        lams = [i / 40 for i in range(1, 20)]
        rej, _ = simulate(.7, .4, breakeven(.7, .4), .05, lams, 300, 600, 1)
        self.assertLessEqual(rej, .05 + .025)

    def test_peeking_ztest_inflates_error(self):
        rej, _ = simulate(.7, .4, breakeven(.7, .4), .05, [], 500, 500, 2, test="z")
        self.assertGreater(rej, .15)

    def test_delay_matches_prediction(self):
        rA, rB, q = .8, .2, .75
        lam = best_bet(rA, rB, q)
        rng = random.Random(3)
        ts = []
        for _ in range(300):
            ys = [rng.random() < q for _ in range(400)]
            path = run_bet(ys, rA, rB, lam)
            ts.append(next(t + 1 for t, v in enumerate(path) if v >= math.log(20)))
        self.assertAlmostEqual(sum(ts) / len(ts), delay_prediction(rA, rB, q, .05), delta=3)
