import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import intervalcov as ic


class T(unittest.TestCase):
    def test_pmf_sums_to_one(self):
        self.assertAlmostEqual(sum(ic.binom_pmf(200, 0.03)), 1.0, places=12)

    def test_beta_cdf_matches_binomial_identity(self):
        # P(Bin(n,p) <= k) = 1 - I_p(k+1, n-k)
        n, k, p = 40, 3, 0.07
        direct = sum(ic.binom_pmf(n, p)[: k + 1])
        self.assertAlmostEqual(1 - ic.beta_cdf(p, k + 1, n - k), direct, places=10)

    def test_cp_zero_failures_closed_form(self):
        # upper bound at k=0 solves (1-p)^n = alpha
        n = 100
        self.assertAlmostEqual(ic.cp_upper(0, n), 1 - 0.05 ** (1 / n), places=9)

    def test_cp_never_undercovers(self):
        for n in (20, 60):
            prof = ic.coverage_profile(ic.cp_upper, n, ic.rate_grid(0.002, 0.3, 80))
            self.assertGreaterEqual(min(prof), 0.95 - 1e-9)

    def test_wald_undercovers_at_low_rate(self):
        # at k=0 Wald gives bound 0, so covers nothing: coverage = P(K>0) at small p
        c = ic.coverage(ic.wald_upper, 50, 0.01)
        self.assertLess(c, 0.5)

    def test_zero_failure_n_rule_of_three(self):
        self.assertEqual(ic.zero_failure_n(ic.rule_of_three_upper, 0.01), 300)
        self.assertEqual(ic.zero_failure_n(ic.cp_upper, 0.01), 299)


if __name__ == "__main__":
    unittest.main()
