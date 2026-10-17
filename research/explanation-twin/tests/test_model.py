import math, random, unittest
from explanation_twin import *


class M(unittest.TestCase):
    def test_emax_known_values(self):
        self.assertAlmostEqual(emax(2), 1 / math.sqrt(math.pi), places=6)
        self.assertAlmostEqual(emax(3), 1.5 / math.sqrt(math.pi), places=6)
        self.assertAlmostEqual(emax(5), 1.16296, places=4)

    def test_pick_probs_sum_to_one_and_symmetry(self):
        pk, _, _ = pick_and_quote([0.0, 0.0, 0.0], 1.0)
        self.assertAlmostEqual(sum(pk), 1.0, places=6)
        self.assertAlmostEqual(pk[0], 1 / 3, places=6)

    def test_equal_means_bias_is_minus_emax_times_s(self):
        for K in (2, 5, 10):
            _, eq, et = pick_and_quote([0.0] * K, 0.7)
            self.assertAlmostEqual(eq - et, -0.7 * emax(K), places=5)

    def test_k2_closed_form_matches_quadrature(self):
        for d in (0.0, 0.5, 1.0, 3.0):
            _, eq, et = pick_and_quote([0.0, d], 1.3)
            self.assertAlmostEqual(eq - et, k2_quote_bias(d, 1.3), places=6)

    def test_bias_vanishes_when_gap_large(self):
        self.assertGreater(k2_quote_bias(6.0, 1.0), -1e-3)

    def test_gap_quote_at_zero_gap(self):
        self.assertAlmostEqual(gap_quote_mean(0.0, 1.0), 2 / math.sqrt(math.pi), places=9)
        self.assertAlmostEqual(gap_quote_mean(10.0, 1.0), 10.0, places=6)

    def test_monte_carlo_matches_quadrature(self):
        rng = random.Random(1)
        mus = [0.0, 0.3, 0.6, 1.0]
        s = 0.5
        _, eq, et = pick_and_quote(mus, s)
        r = simulate_select(mus, s * math.sqrt(10), 10, 60000, rng)
        self.assertLess(abs(r["bias"] - (eq - et)), 0.01)

    def test_fresh_report_is_unbiased(self):
        rng = random.Random(2)
        r = simulate_select([0.0] * 5, 1.0, 20, 60000, rng, n1=10)
        self.assertLess(abs(r["bias"]), 0.01)

    def test_naive_coverage_below_fresh(self):
        rng = random.Random(3)
        cn, cf = coverage_naive_fresh([0.0] * 10, 1.0, 10, 40000, rng)
        self.assertLess(cn, 0.85)
        self.assertLess(abs(cf - 0.95), 0.01)

    def test_model_error_bias_matches_simulation(self):
        rng = random.Random(4)
        r = simulate_select([0.0] * 5, 1.0, 20, 80000, rng, n1=10, tau=0.5)
        s = 1.0 / math.sqrt(10)
        self.assertLess(abs(r["bias"] - model_error_bias(5, 0.5, s)), 0.01)


if __name__ == "__main__":
    unittest.main()
