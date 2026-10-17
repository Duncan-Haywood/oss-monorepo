import math, unittest
from abstention_scoring import *


class T(unittest.TestCase):
    def test_brier_boundary_gain_equals_cost(self):
        pi, mu, c = 0.3, 1.0, 0.04
        a, b = region_brier(pi, pi, mu, c)
        for s, sgn in ((a, -1), (b, 1)):
            p = expit(logit(pi) + 2 * mu * s)
            self.assertAlmostEqual((p - pi) ** 2, c, 10)
            self.assertEqual(p > pi, sgn > 0)

    def test_log_boundary_gain_equals_cost(self):
        pi, mu, c = 0.3, 1.0, 0.05
        a, b = region_log(pi, pi, mu, c)
        for s in (a, b):
            self.assertAlmostEqual(kl(expit(logit(pi) + 2 * mu * s), pi), c, 8)

    def test_unreachable_side_is_open(self):
        a, b = region_brier(0.9, 0.9, 1.0, 0.04)   # alpha+0.2 > 1: nobody can report above
        self.assertEqual(b, math.inf); self.assertTrue(math.isfinite(a))

    def test_symmetric_silence_is_uninformative(self):
        reg = region_brier(0.5, 0.5, 1.3, 0.05)
        self.assertAlmostEqual(abstain_lr(1.3, reg), 1.0, 12)
        self.assertAlmostEqual(posterior_after_abstain(0.5, 1.3, reg), 0.5, 12)

    def test_asymmetric_silence_is_informative(self):
        reg = region_brier(0.2, 0.2, 1.0, 0.03)
        self.assertNotAlmostEqual(abstain_lr(1.0, reg), 1.0, 3)
        self.assertLess(abstain_lr(1.0, reg), 1.0)   # silence points to theta=0

    def test_zero_cost_full_reporting(self):
        reg = region_brier(0.4, 0.4, 1.0, 0.0)
        self.assertAlmostEqual(reg[0], reg[1], 12)
        self.assertAlmostEqual(abstain_prob(1, 1.0, reg), abstain_prob(1, 1.0, (0, 0)), 12)

    def test_info_decreasing_in_cost(self):
        pi, mu = 0.3, 1.0
        v = [mutual_info(pi, mu, region_brier(pi, pi, mu, c)) for c in (0.0, 0.01, 0.03, 0.08)]
        self.assertTrue(all(x > y for x, y in zip(v, v[1:])))

    def test_silence_information_positive_and_below_full(self):
        pi, mu = 0.2, 1.0
        reg = region_brier(pi, pi, mu, 0.03)
        self.assertGreater(mutual_info(pi, mu, reg), 0)
        self.assertLess(mutual_info(pi, mu, reg), mutual_info(pi, mu, region_brier(pi, pi, mu, 0.0)))

    def test_abstain_prob_matches_simulation(self):
        pi, mu = 0.3, 1.0
        reg = region_brier(pi, pi, mu, 0.03)
        sim = simulate(pi, mu, reg, 1, 40000, seed=4)
        emp = sum(1 for th, rep, k in sim if th == 1 and k == 1) / max(1, sum(1 for th, _, _ in sim if th == 1))
        self.assertAlmostEqual(emp, abstain_prob(1, mu, reg), delta=0.01)

    def test_silence_aware_aggregator_calibrated_and_better(self):
        pi, mu, n = 0.2, 0.8, 6
        reg = region_brier(pi, pi, mu, 0.05)
        sim = simulate(pi, mu, reg, n, 20000, seed=7)
        ll = {True: 0.0, False: 0.0}
        cal = 0.0; pm = 0.0
        for th, rep, k in sim:
            for u in (True, False):
                q = aggregate(pi, mu, reg, rep, k, u)
                ll[u] -= math.log(q if th else 1 - q)
            pm += aggregate(pi, mu, reg, rep, k, True); cal += th
        self.assertLess(ll[True], ll[False])
        self.assertAlmostEqual(pm / len(sim), cal / len(sim), delta=0.01)

    def test_reporter_base_rate_shifts_when_prior_low(self):
        pi, mu = 0.2, 1.0
        reg = region_brier(pi, pi, mu, 0.03)
        self.assertGreater(reporter_base_rate(pi, mu, reg), pi)

    def test_payment_decreasing_in_cost_brier_and_matches_closed_range(self):
        pi, mu = 0.5, 1.0
        p0 = expected_payment(pi, pi, mu, region_brier(pi, pi, mu, 0.0))
        p1 = expected_payment(pi, pi, mu, region_brier(pi, pi, mu, 0.05))
        self.assertGreater(p0, p1); self.assertGreater(p1, 0)


if __name__ == "__main__":
    unittest.main()
