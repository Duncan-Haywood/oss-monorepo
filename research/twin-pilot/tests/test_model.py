import math, random, unittest
from twin_pilot import *


class M(unittest.TestCase):
    def test_threshold_matches_worth_it_condition(self):
        for r in (0.01, 0.05, 0.172, 0.5):
            rs = rho_star(r)
            self.assertAlmostEqual((1 - math.sqrt(1 - rs * rs)) ** 2 / (rs * rs), r, places=10)
            self.assertAlmostEqual(rel_var_forced(rs, r), 1.0, places=10)   # tie with real-only exactly at rho*
        self.assertAlmostEqual(rho_star(0.072), 0.5, places=2)

    def test_gain_slope_is_derivative_at_threshold(self):
        r, h = 0.05, 1e-6
        rs = rho_star(r)
        d = (rel_var_forced(rs - h, r) - rel_var_forced(rs + h, r)) / (2 * h)
        self.assertAlmostEqual(d, gain_slope(r), places=5)

    def test_alloc_spends_budget_and_beats_real_only(self):
        n, N = alloc(0.8, 1000.0, 1.0, 0.05)
        self.assertAlmostEqual(n + 0.05 * N, 1000.0, places=8)
        self.assertLess(var_of_alloc(n, N, 0.8), var_of_alloc(1000.0, 0.0, 0.8))
        self.assertEqual(alloc(0.3, 1000.0, 1.0, 0.05), (1000.0, 0.0))     # below rho* = 0.426: real-only

    def test_plan_is_exact_when_rho_hat_is_right_and_regret_is_second_order(self):
        self.assertAlmostEqual(rel_regret_alloc(0.8, 0.8, 1000.0, 1.0, 0.05), 0.0, places=12)
        a = rel_regret_alloc(0.82, 0.8, 1000.0, 1.0, 0.05)
        b = rel_regret_alloc(0.84, 0.8, 1000.0, 1.0, 0.05)
        self.assertGreater(a, 0)
        self.assertAlmostEqual(b / a, 4.0, delta=0.6)                      # doubling the error ~ quadruples the regret

    def test_sample_correlation_is_centred_and_has_fisher_sd(self):
        rng = random.Random(1)
        xs = [sample_corr(0.6, 40, rng) for _ in range(6000)]
        m = sum(xs) / len(xs)
        sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))
        self.assertAlmostEqual(m, 0.6, delta=0.01)
        self.assertAlmostEqual(sd, (1 - 0.36) / math.sqrt(40), delta=0.012)

    def test_two_stage_is_unbiased_and_covers(self):
        rng = random.Random(3)
        ests, hit, K = [], 0, 1500
        for _ in range(K):
            e, (lo, hi), _, n, N = two_stage(20, 400.0, 1.0, 0.05, 1.0, 1.0, 1.0, 0.7, 1.0, 0.0, rng)
            ests.append(e)
            hit += lo <= 1.0 <= hi
            self.assertLessEqual(n * 1.0 + N * 0.05, 400.0 + 1.0 + 0.05)
        self.assertLess(abs(sum(ests) / K - 1.0), 0.02)
        self.assertGreater(hit / K, 0.92)


if __name__ == "__main__":
    unittest.main()
