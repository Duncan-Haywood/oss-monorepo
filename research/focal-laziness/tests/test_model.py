import unittest
from focal_laziness import *


class T(unittest.TestCase):
    def test_pay_matches_simulation(self):
        for ai, aj, d in ((1, 1, .5), (0, 0, .5), (.5, .8, .4)):
            self.assertLess(abs(simulate_pay(ai, aj, .3, d, 300000, 1) - pay(ai, aj, .3, d)), 0.006)

    def test_lazy_equilibrium_always_exists(self):
        for d in (0.1, 0.5):
            self.assertLess(effort_gain(0, .3, d, 1, .1), 0)
            self.assertGreater(lazy_pay(.3, d), 0) if d > 0 else None

    def test_deterministic_default_pays_nothing(self):
        self.assertEqual(lazy_pay(.3, 0.0), 0.0)
        self.assertEqual(lazy_pay(.3, 1.0), 0.0)

    def test_threshold_zero_gain(self):
        a = threshold(.3, .5, 1, .1)
        self.assertAlmostEqual(effort_gain(a, .3, .5, 1, .1), 0, 12)
        self.assertTrue(0 < a < 1)

    def test_threshold_rises_with_default_entropy(self):
        self.assertGreater(threshold(.3, .5, 1, .1), threshold(.3, .1, 1, .1))

    def test_basin(self):
        a = threshold(.3, .5, 1, .1)
        self.assertLess(best_response_path(a - .02, .3, .5, 1, .1, 400)[-1], 0.01)
        self.assertGreater(best_response_path(a + .02, .3, .5, 1, .1, 400)[-1], 0.99)

    def test_gold_rate_makes_effort_dominant(self):
        for d in (.5, .2):
            g = gold_rate(.3, d, 1, .1)
            self.assertAlmostEqual(gold_effort_gain(0, .3, d, 1, .1, g), 0, 12)
            self.assertGreater(gold_effort_gain(0, .3, d, 1, .1, g * 1.01), 0)
            self.assertLess(gold_effort_gain(0, .3, d, 1, .1, g * .99), 0)

    def test_effort_infeasible_when_cost_high(self):
        self.assertGreater(threshold(.3, .5, 1, .5), 1)
        self.assertLess(threshold(.3, .5, 1, .4), 1)

    def test_prior_matched_default_pays_like_honesty(self):
        self.assertAlmostEqual(lazy_pay(.3, .3), honest_pay(.3), 12)


if __name__ == "__main__":
    unittest.main()
