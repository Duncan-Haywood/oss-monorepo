import math, random, unittest
from decision_scoring import *


class T(unittest.TestCase):
    def test_exp_reward_matches_expectation(self):
        for _ in range(50):
            r, q, ts = random.random(), random.random(), random.random()
            e = q * reward(r, 1, ts) + (1 - q) * reward(r, 0, ts)
            self.assertAlmostEqual(e, exp_reward(r, q, ts), 12)

    def test_plain_brier_is_half(self):
        # tau_s = 1/2 is 1 - Brier
        self.assertAlmostEqual(reward(.3, 1, .5), 1 - .49, 12)
        self.assertAlmostEqual(reward(.3, 0, .5), 1 - .09, 12)

    def test_feasible_iff_score_centre_above_threshold(self):
        for td in (.1, .3, .5, .7, .9):
            for ts in (.1, .3, .5, .7, .9, 1.0):
                lo, hi = reserve_interval(td, ts)
                if ts >= td:
                    self.assertAlmostEqual(lo, hi, 12)
                    self.assertTrue(is_truthful(td, ts, truthful_reserve(td, ts)))
                    self.assertFalse(is_truthful(td, ts, truthful_reserve(td, ts) + .02))
                    self.assertFalse(is_truthful(td, ts, truthful_reserve(td, ts) - .02))
                else:
                    self.assertGreater(lo, hi)
                    for c in [i / 100 for i in range(0, 201)]:
                        self.assertFalse(is_truthful(td, ts, c, 400))

    def test_plain_brier_reserve_fails_above_half(self):
        self.assertTrue(is_truthful(.5, .5, .75))
        self.assertFalse(any(is_truthful(.7, .5, c / 100, 400) for c in range(0, 201)))

    def test_naive_scoring_accepts_everyone(self):
        for q in (.1, .5, .9, 1.0):
            self.assertTrue(best_response(q, .3, .5, 0.0)[1])
        self.assertAlmostEqual(eq_loss(.3, .5, 0.0), naive_loss(.3), 3)
        self.assertAlmostEqual(opt_loss(.3), .255, 12)

    def test_recentred_reserve_attains_optimum(self):
        for td in (.2, .5, .8):
            self.assertAlmostEqual(eq_loss(td, td, 1 - td * td), opt_loss(td), 3)

    def test_rent_closed_form_and_minimum(self):
        for td in (.2, .5, .8):
            self.assertAlmostEqual(rent(td, td), td ** 3 / 3, 12)
            num = 0.0
            n = 20000
            ts = min(td + .15, 1.0)
            for i in range(n):
                q = (i + .5) / n
                if q <= td:
                    num += exp_reward(q, q, ts) - truthful_reserve(td, ts)
            self.assertAlmostEqual(num / n, rent(td, ts), 5)
            self.assertGreater(rent(td, ts), rent(td, td) - 1e-12)

    def test_misreport_in_accept_region(self):
        td, ts = .6, .6
        c0 = truthful_reserve(td, ts)
        for q, r in ((.3, .4), (.5, .2), (.1, .05)):
            d = payoff(q, q, td, ts, c0) - payoff(r, q, td, ts, c0)
            self.assertAlmostEqual(d, misreport_cost(r, q), 12)

    def test_ipw_exactly_proper_and_variance(self):
        m, v = ipw_payment_moments(.8, .4, .5, .1)
        self.assertAlmostEqual(m, exp_reward(.8, .4, .5), 12)
        rng = random.Random(1)
        xs = []
        for _ in range(200000):
            if rng.random() < .1:
                y = 1 if rng.random() < .4 else 0
                xs.append(reward(.8, y, .5) / .1)
            else:
                xs.append(0.0)
        mu = sum(xs) / len(xs)
        var = sum((x - mu) ** 2 for x in xs) / len(xs)
        self.assertAlmostEqual(mu, m, delta=.05)
        self.assertLess(abs(var / v - 1), .03)

    def test_explore_cost(self):
        n = 100000
        tau, eps = .3, .1
        num = sum(eps * max((i + .5) / n - tau, 0) for i in range(n)) / n
        self.assertAlmostEqual(num, explore_cost(tau, eps), 6)


if __name__ == "__main__":
    unittest.main()
