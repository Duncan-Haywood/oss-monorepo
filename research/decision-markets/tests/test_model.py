import math, unittest
from decision_markets import *


class T(unittest.TestCase):
    def test_gap_variance(self):
        lam, v, w = posterior(1.0, 0.7)
        self.assertAlmostEqual(w * w, 2 * lam * 1.0, 12)
        self.assertAlmostEqual(v, lam * 0.49, 12)

    def test_greedy_and_hard_limit(self):
        w = 0.8
        self.assertAlmostEqual(expected_loss(lambda d: 1.0 if d > 0 else 0.0, w, n=8000), greedy_gain(w), 3)
        self.assertAlmostEqual(expected_loss(lambda d: 0.5, w), 0.0, 9)

    def test_regret_bound(self):
        c = regret_constant()
        self.assertAlmostEqual(c, 0.2785, 3)
        for t in (0.05, 0.2, 1.0):
            for w in (0.1, 1.0, 5.0):
                self.assertLessEqual(logistic_regret(t, w), c * t + 1e-9)
        t, w = 0.4, 0.9
        self.assertAlmostEqual(expected_loss(lambda d: sigmoid(d / t), w) - greedy_gain(w), logistic_regret(t, w), 6)

    def test_inverse_propensity_closed_form(self):
        t, w = 0.7, 1.1
        q = expect_normal(lambda d: 1 / sigmoid(d / t), w, L=12, n=20000)
        self.assertAlmostEqual(q, inv_propensity_mean(2, t, w), 5)

    def test_payment_moments_monte_carlo(self):
        s, sig, t, k = 1.0, 1.0, 0.8, 2.0
        lam, v, w = posterior(s, sig)
        mean, m2 = payment_moments(k, v, 2, t, w)
        sm, s2 = simulate_payments(k, s, sig, t, 300000, seed=3)
        self.assertLess(abs(sm - mean) / mean, 0.03)
        self.assertLess(abs(s2 - m2) / m2, 0.06)

    def test_k_arm_factor(self):
        self.assertAlmostEqual(inv_propensity_mean(1, 0.5, 2.0), 1.0, 12)
        self.assertGreater(inv_propensity_mean(5, 1.0, 1.0), inv_propensity_mean(2, 1.0, 1.0))

    def test_temperature_inverts_rel_std(self):
        w, K = 1.3, 3
        t = temperature_for_rel_std(6.0, w, K)
        self.assertAlmostEqual(payment_rel_std(K, t, w), 6.0, 9)
        self.assertTrue(math.isinf(temperature_for_rel_std(2.0, w, K)))

    def test_probit_infinite_variance_below_w(self):
        w = 1.0
        lo = [inv_pi_probit_truncated(0.7, w, L) for L in (4, 6, 8)]
        hi = [inv_pi_probit_truncated(1.5, w, L) for L in (4, 6, 8)]
        self.assertGreater(lo[2], 100 * lo[0])
        self.assertLess(abs(hi[2] - hi[1]), 1e-3)

    def test_ipw_proper_even_when_policy_reads_report(self):
        pi = lambda r: sigmoid((0.4 - r) / 0.3)
        rs = (-1, 0, 0.2, 0.9)
        vals = [ipw_expected_score(r, 0.2, 0.5, 2.0, pi) for r in rs]
        for r, val in zip(rs, vals):
            self.assertAlmostEqual(val, 2.0 * ((r - 0.2) ** 2 + 0.5), 12)
        self.assertEqual(min(vals), vals[2])

    def test_unscaled_is_biased_and_hides(self):
        m, v, k, t = 0.0, 0.3, 1.0, 0.4
        r = unscaled_best_report(m, v, k, 1.0, t, 0.0)
        self.assertLess(r, -0.05)
        r2 = unscaled_best_report(m, v, k, 0.0, t, 0.0, span=6)
        self.assertGreater(r2, 4.0)

    def test_stake_bias_matches_foc(self):
        k, t, B = 4.0, 1.0, 2.0
        b = -stake_best_report(0.0, k, B, t, 0.0)
        self.assertAlmostEqual(b, B * dsig(b / t) / (2 * k * t), 6)

    def test_concavity_threshold(self):
        k, t = 1.0, 0.5
        lim = concavity_stake_limit(k, t)
        self.assertAlmostEqual(lim, 12 * math.sqrt(3) * k * t * t, 9)

        def n_max(B, g):
            f = lambda r: B * sigmoid((g - r) / t) - k * r * r
            v = [f(-6 + 12 * i / 6000) for i in range(6001)]
            return sum(1 for i in range(1, 6000) if v[i] > v[i - 1] and v[i] > v[i + 1])
        gaps = [i / 20 for i in range(-80, 81)]
        self.assertEqual(max(n_max(0.9 * lim, g) for g in gaps), 1)
        self.assertGreaterEqual(max(n_max(1.6 * lim, g) for g in gaps), 2)

    def test_symmetric_stakes_cancel_asymmetric_do_not(self):
        k, t = 5.0, 1.0
        b0, b1, Dr = equilibrium_reports(0.3, 2.0, 2.0, k, t)
        self.assertAlmostEqual(Dr, 0.3, 9)
        b0, b1, Dr = equilibrium_reports(0.3, 3.0, 1.0, k, t)
        self.assertAlmostEqual(Dr, distorted_gap(0.3, 2.0, k, t), 8)
        self.assertGreater(Dr, 0.3)

    def test_distorted_gap_monotone_in_unique_regime(self):
        k, t, dB = 3.0, 1.0, 5.0
        self.assertLess(dB, concavity_stake_limit(k, t))
        prev = -1e9
        for i in range(-40, 41):
            x = distorted_gap(i / 10, dB, k, t)
            self.assertGreater(x, prev)
            prev = x

    def test_distortion_costs_something(self):
        w, k, t = 1.0, 3.0, 0.5
        honest = expected_loss(lambda d: sigmoid(d / t), w, n=600)
        self.assertGreater(distorted_loss(4.0, k, t, w), honest)

    def test_first_order_distortion_cancels(self):
        w, k, t = 1.0, 8.0, 0.45
        hon = expected_loss(lambda d: sigmoid(d / t), w, n=600)
        e1 = distorted_loss(1.0, k, t, w) - hon
        e2 = distorted_loss(2.0, k, t, w) - hon
        self.assertGreater(e1, 0)
        self.assertAlmostEqual(e2 / e1, 4.0, delta=0.15)


if __name__ == "__main__":
    unittest.main()
