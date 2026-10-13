import math, random, unittest
from validate_twin import *


class M(unittest.TestCase):
    def test_pmf_sums_to_one(self):
        self.assertAlmostEqual(sum(pmf_arr(500, 0.01)), 1.0, places=12)
        self.assertAlmostEqual(sum(pmf_arr(20, 0.3, 20)), 1.0, places=12)

    def test_two_sided_pvalue_at_mode_is_one(self):
        pv = pvals_two_sided(100, 0.5, 100)
        self.assertAlmostEqual(pv[50], 1.0, places=9)
        self.assertLess(pv[30], 0.001)

    def test_perfect_twin_passes_at_least_1_minus_alpha(self):
        for n, q in ((100, 0.01), (2000, 0.001), (50, 0.2)):
            self.assertGreaterEqual(diff_pass_prob(n, q, q), 0.95 - 1e-9)

    def test_diff_pass_matches_monte_carlo(self):
        n, q, c = 300, 0.005, 2.0
        M_ = 60
        pv = pvals_two_sided(n, q, M_)
        rng = random.Random(1)
        reps = 20000
        hit = 0
        for _ in range(reps):
            x = sum(1 for _ in range(n) if rng.random() < c * q)
            hit += pv[x] > 0.05
        self.assertAlmostEqual(hit / reps, diff_pass_prob(n, q, c * q), delta=0.01)

    def test_tost_needs_enough_trials(self):
        self.assertIsNone(tost_region(20, 0.01, 2.0))
        self.assertIsNotNone(tost_region(20000, 0.01, 2.0))

    def test_tost_false_validation_at_margin_at_most_alpha(self):
        for n, q, D in ((5000, 0.002, 2.0), (20000, 0.001, 1.5), (300, 0.05, 3.0)):
            self.assertLessEqual(tost_prob(n, q, D, q * D), 0.05 + 1e-9)
            self.assertLessEqual(tost_prob(n, q, D, q / D), 0.05 + 1e-9)

    def test_tost_power_grows_with_trials(self):
        a, b = tost_prob(3000, 0.005, 2.0, 0.005), tost_prob(30000, 0.005, 2.0, 0.005)
        self.assertLess(a, b)
        self.assertGreater(b, 0.99)

    def test_prior_bad_given_pass_bounds(self):
        f = lambda p: diff_pass_prob(400, 0.005, p)
        pb, pp, pbp, ppb = prior_bad_given_pass(400, 0.005, 0.7, 2.0, f)
        self.assertTrue(0 < pb < 1 and 0 < pp <= 1 and 0 < pbp < 1 and 0 < ppb < 1)
        self.assertLess(pbp, pb)  # passing is (weak) evidence of validity


if __name__ == "__main__":
    unittest.main()
