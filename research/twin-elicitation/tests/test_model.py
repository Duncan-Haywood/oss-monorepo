import math, random, unittest
from twin_elicitation import *

a = 0.9
mom = lambda p: (sum(b * w for b, w in zip(*p)), sum(b * b * w for b, w in zip(*p)) - sum(b * w for b, w in zip(*p)) ** 2)


class T(unittest.TestCase):
    def test_expected_cost_matches_monte_carlo(self):
        rng = random.Random(3)
        mu, tau, k = 1.0, 0.2, 0.8
        xs = []
        while len(xs) < 100000:
            b = rng.gauss(mu, tau)
            if abs(b - mu) <= 3 * tau:
                xs.append(b)
        mc = sum(cost(a, b, k) for b in xs) / len(xs)
        self.assertAlmostEqual(expected_cost(a, truncnorm(mu, tau), k) / mc, 1.0, delta=0.005)

    def test_point_posterior_recovers_riccati_and_decision_estimate_inverts(self):
        self.assertAlmostEqual(bayes_gain(a, ([1.0], [1.0])), optimal_gain(a, 1.0), places=6)
        for b in (0.5, 1.0, 1.7):
            self.assertAlmostEqual(decision_estimate(a, optimal_gain(a, b)), b, places=9)

    def test_bayes_gain_is_more_conservative_with_spread_and_mean_is_not_sufficient(self):
        gs = [bayes_gain(a, truncnorm(1.0, t)) for t in (0.05, 0.1, 0.2, 0.3)]
        self.assertTrue(all(x > y for x, y in zip(gs, gs[1:])))
        m1, m2 = mom(truncnorm(1.0, 0.05))[0], mom(truncnorm(1.0, 0.3))[0]
        self.assertAlmostEqual(m1, m2, places=9)                                          # same mean report under Brier ...
        self.assertGreater(gs[0] - gs[-1], 0.04)                                          # ... different cost-paid gains

    def test_small_variance_law(self):
        for tau in (0.05, 0.1):
            p = truncnorm(1.0, tau)
            m, v = mom(p)
            self.assertAlmostEqual((optimal_gain(a, m) - bayes_gain(a, p)) / -small_var_shift(a, m, v), 1.0, delta=0.02)

    def test_certainty_equivalent_loss_is_quartic_in_spread(self):
        e1, e2 = ce_excess(a, truncnorm(1.0, 0.05)), ce_excess(a, truncnorm(1.0, 0.1))
        self.assertAlmostEqual(e2 / e1, 16.0, delta=2.0)
        self.assertGreater(e1, 0)

    def test_equal_squared_error_reports_have_unequal_regret(self):
        for d in (0.2, 0.5):
            self.assertGreater(regret(a, 1.0, optimal_gain(a, 1 - d)), 1.5 * regret(a, 1.0, optimal_gain(a, 1 + d)))
        self.assertLess(regret(a, 1.5, optimal_gain(a, 1.3)), regret(a, 1.5, optimal_gain(a, 0.7)))       # which side is safe depends on the plant

    def test_cap_switches_the_elicited_gain_at_a_closed_form_threshold(self):
        post = ([0.6, 2.4], [0.99, 0.01])
        ms = cap_threshold(a, 0.6, 2.4, 0.01)
        self.assertTrue(math.isfinite(ms))
        k_ignore = optimal_gain(a, 0.6)
        self.assertAlmostEqual(bayes_gain(a, post, 0.9 * ms), k_ignore, places=3)                       # low cap: ignores the rare plant
        k_hi = bayes_gain(a, post, 1.1 * ms)
        self.assertLess(k_hi, (1 + a) / 2.4 + 1e-6)                                                     # high cap: respects the cliff
        self.assertAlmostEqual(bayes_gain(a, post, math.inf), k_hi, places=3)

    def test_information_value_per_unit_variance_is_half_jbb_and_varies_with_operating_point(self):
        for b0 in (0.8, 1.0, 1.5):
            self.assertAlmostEqual(info_value(a, b0, 0.03) / 0.03 ** 2 / (0.5 * cost_bb(a, b0)), 1.0, delta=0.06)
        self.assertGreater(0.5 * cost_bb(a, 0.5), 10 * 0.5 * cost_bb(a, 2.0))


if __name__ == "__main__":
    unittest.main()
