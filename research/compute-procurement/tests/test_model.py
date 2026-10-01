import unittest
from compute_procurement import *

class T(unittest.TestCase):
    def test_vcg_payment_closed_form(self):
        for n, k in ((5, 1), (10, 3), (30, 7), (20, 19)):
            self.assertAlmostEqual(expected_payment(n, k), k * (k + 1) / (n + 1), places=10)
    def test_cost_closed_form(self):
        for n, k in ((5, 1), (10, 3), (30, 7)):
            self.assertAlmostEqual(expected_cost(n, k), k * (k + 1) / (2 * (n + 1)), places=10)
    def test_frugality_is_two(self):
        for n, k in ((4, 1), (10, 5), (50, 10)): self.assertAlmostEqual(frugality(n, k), 2.0, places=10)
    def test_reserve_payment_matches_simulation(self):
        for n, k, r in ((10, 3, 0.4), (8, 5, 0.7), (6, 2, 0.2)):
            s = simulate(n, k, r, 1.0, 200000)
            self.assertAlmostEqual(s["payment"], expected_payment(n, k, r), delta=0.01)
            self.assertAlmostEqual(s["cost"], expected_cost(n, k, r), delta=0.005)
            self.assertAlmostEqual(s["winners"], expected_winners(n, k, r), delta=0.01)
    def test_myerson_reserve_is_v_over_2(self):
        for n, k, v in ((10, 4, 0.6), (20, 8, 0.8), (6, 5, 0.5)):
            self.assertAlmostEqual(best_reserve(n, k, v), v / 2, delta=0.002)
    def test_reserve_helps_only_below_full_value(self):
        # v >= 2 means virtual-cost cutoff exceeds support: no reserve is optimal
        self.assertGreaterEqual(buyer_utility(10, 4, 1.0, 3.0), max(buyer_utility(10, 4, i / 100, 3.0) for i in range(101)) - 1e-9)
    def test_first_price_revenue_equivalence(self):
        n, k = 8, 3
        self.assertAlmostEqual(fp_expected_payment(n, k, trials=20000), expected_payment(n, k), delta=0.02)
    def test_fp_bid_above_cost_and_increasing(self):
        b = [fp_bid(8, 3, c / 10) for c in range(9)]
        self.assertTrue(all(x >= c / 10 for c, x in enumerate(b)))
        self.assertTrue(all(b[i] < b[i + 1] for i in range(8)))
    def test_fp_no_profitable_deviation(self):
        self.assertLess(fp_deviation_gain(6, 2, 0.3), 0.005)
if __name__ == "__main__": unittest.main()
