import math, unittest
from order_flow_liquidity import *


class T(unittest.TestCase):
    def test_gm_posterior_is_logit_linear_in_net_flow(self):
        for m in (0.1, 0.4, 0.8):
            for B, S in ((5, 2), (0, 7), (13, 13), (30, 4)):
                self.assertAlmostEqual(bayes_price_bruteforce(B, S, m, 0.3), gm_price(B - S, m, 0.3), places=12)

    def test_b_star_round_trip_and_limits(self):
        for mu, q in ((0.2, 1.0), (0.5, 0.8), (0.9, 0.6)):
            m = mu * (2 * q - 1)
            self.assertAlmostEqual(informed_fraction_for_b(b_star(m), q), mu, places=12)
        self.assertAlmostEqual(b_star(0.01) * 0.02, 1.0, places=3)   # small m: b* ~ 1/(2m)
        self.assertLess(b_star(0.99), 0.2)

    def test_lmsr_at_b_star_prices_like_gm_and_wrong_b_regret_positive(self):
        m = 0.3
        self.assertAlmostEqual(excess_log_loss(30, m, b_star(m)), 0.0, places=12)
        for lam in (0.5, 0.8, 1.25, 2.0):
            self.assertGreater(excess_log_loss(30, m, b_star(m) / lam), 1e-6)

    def test_peak_regret_overconfident_exceeds_underconfident_and_is_scale_free(self):
        def peak(m, lam):
            bs = b_star(m)
            ns = sorted(set(max(1, int(x / (m * m))) for x in [0.02 * 1.15 ** i for i in range(40)]))
            return max(excess_log_loss(n, m, bs / lam) for n in ns if n <= 1500)
        for m in (0.1, 0.3):
            self.assertGreater(peak(m, 2.0), peak(m, 0.5))
            self.assertGreater(peak(m, 4.0), peak(m, 0.25))
        self.assertAlmostEqual(peak(0.1, 2.0) / peak(0.05, 2.0), 1.0, delta=0.02)

    def test_gm_maker_zero_expected_profit_and_state_conditional_signs(self):
        m, n, p0 = 0.3, 25, 0.2
        p1, q0 = gm_mm_pnl(n, m, 1, p0), gm_mm_pnl(n, m, 0, p0)
        self.assertAlmostEqual(p0 * p1 + (1 - p0) * q0, 0.0, places=10)
        self.assertLess(p1, 0)      # the rare state is where informed traders win
        self.assertGreater(q0, 0)
        self.assertAlmostEqual(gm_mm_pnl(n, m, 1, 0.5), 0.0, places=10)   # symmetric prior: 0 in each state

    def test_lmsr_loss_below_b_ln2_bound_worst_case(self):
        b = 3.0
        for n in (5, 50, 300):
            for state in (0, 1):
                self.assertGreaterEqual(lmsr_mm_pnl(n, 0.9, b, state), -b * math.log(2) - 1e-9)

    def test_lmsr_earns_from_pure_noise_flow(self):
        self.assertGreater(lmsr_mm_pnl(40, 0.0, 2.0, 1), 0)

    def test_mixture_price_reduces_to_gm_for_point_prior(self):
        self.assertAlmostEqual(mixture_price(9, 4, [0.3], [1.0]), gm_price(5, 0.3), places=12)

    def test_mixture_is_between_extremes_and_scale_free_in_direction(self):
        ms, w = [0.1, 0.5], [0.5, 0.5]
        p = mixture_price(20, 5, ms, w)
        self.assertGreater(p, gm_price(15, 0.1))
        self.assertLess(p, gm_price(15, 0.5))

    def test_wald_trade_count_matches_simulation_roughly(self):
        import random
        rng = random.Random(3)
        m, tgt = 0.3, 0.95
        k = flow_slope(m)
        tot, N = 0, 4000
        for _ in range(N):
            F, t = 0, 0
            while gm_price(F, m) < tgt:
                F += 1 if rng.random() < (1 + m) / 2 else -1
                t += 1
            tot += t
        approx = trades_to_confidence(m, tgt)
        self.assertLess(abs(tot / N - approx) / approx, 0.15)


if __name__ == "__main__":
    unittest.main()
