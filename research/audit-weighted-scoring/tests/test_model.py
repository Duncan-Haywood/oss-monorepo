import unittest
from audit_weighted_scoring import *


class T(unittest.TestCase):
    def test_naive_truthful_when_audit_rate_flat(self):
        for p in (.1, .5, .8):
            self.assertAlmostEqual(naive_report(p, .3, 0.0), p, 9)

    def test_naive_distorts_under_report_dependent_audit(self):
        for p in (.2, .5, .9):
            r = naive_report(p, .2, .1)
            self.assertLess(r, p)
            self.assertAlmostEqual(r - p, naive_shift_first_order(p, .2, .1), delta=0.003)
        self.assertEqual(naive_report(.5, .2, .6), 0.0)  # steep slope: verifier hides entirely

    def test_first_order_exact_for_small_slope(self):
        self.assertAlmostEqual(naive_report(.6, .5, .01) - .6, naive_shift_first_order(.6, .5, .01), delta=1e-4)

    def test_ipw_proper_for_any_rate(self):
        g = lambda r: 0.1 + 0.8 * r * r
        for p in (.2, .5, .9):
            best = min((i / 1000 for i in range(1001)), key=lambda r: ipw_objective(r, p))
            self.assertAlmostEqual(best, p, 3)

    def test_ipw_simulation_matches_mean_and_variance(self):
        g = lambda r: 0.1 + 0.8 * r
        m, v = simulate_ipw(.7, .4, g, 600000, 5)
        self.assertAlmostEqual(m, loss(.7, .4), delta=0.01)
        self.assertAlmostEqual(v, ipw_variance(.7, .4, g), delta=0.02 * ipw_variance(.7, .4, g) + .01)

    def test_naive_simulation_matches_objective(self):
        g = lambda r: 0.1 + 0.8 * r
        self.assertAlmostEqual(simulate_naive(.7, .4, g, 400000, 2), naive_objective(.7, .4, g), delta=0.003)

    def test_neyman_meets_budget_and_beats_uniform(self):
        d = grid(1000)
        rate = neyman_rate(.1, d)
        self.assertAlmostEqual(sum(w * rate(p) for p, w in d), .1, 6)
        self.assertLess(variance_ratio(.1, d), 1.0)

    def test_neyman_optimal_vs_perturbation(self):
        d = grid(600)
        rate = neyman_rate(.1, d)
        base = payment_variance(rate, d)
        alt = lambda p: rate(p) * (1 + .3 * (p - .5))
        scale = .1 / sum(w * alt(p) for p, w in d)
        self.assertLess(base, payment_variance(lambda p: alt(p) * scale, d))

    def test_floor_costs_variance_and_bounds_payout(self):
        d = grid(1000)
        self.assertGreater(variance_ratio(.1, d, .05), variance_ratio(.1, d, 0.0))
        self.assertEqual(max_payout(.05), 20.0)


if __name__ == "__main__":
    unittest.main()
