import math, unittest
from market_sandwich import *


class T(unittest.TestCase):
    def test_profit_equals_victim_extra_cost(self):
        for q, x, v, b in ((0, 3, 2, 5), (1.5, 10, 4, 7), (-3, 0.5, 8, 2)):
            extra = trade_cost(q + x, v, b) - trade_cost(q, v, b)
            self.assertAlmostEqual(sandwich_profit(q, x, v, b), extra, 10)

    def test_mixed_difference_positive_and_symmetric(self):
        m = mixed_difference(0.3, 2, 3, 4)
        self.assertGreater(m, 0)
        self.assertAlmostEqual(m, mixed_difference(0.3, 3, 2, 4), 12)

    def test_extraction_equals_tolerance_times_cost(self):
        for q in (-4, 0, 3):
            for v in (1, 5):
                for b in (5, 20):
                    for eps in (0.01, 0.1):
                        a = attack(q, v, b, eps)
                        self.assertAlmostEqual(a["profit"], eps * a["c0"], 9)
                        self.assertAlmostEqual(trade_cost(q + a["x"], v, b), victim_limit(q, v, b, eps), 9)

    def test_zero_tolerance_zero_attack(self):
        self.assertAlmostEqual(attack(0, 5, 10, 0.0)["profit"], 0.0, 12)

    def test_large_tolerance_unbounded_x(self):
        self.assertTrue(math.isinf(x_star(0, 5, 10, 5.0)))

    def test_first_order_front_run_size(self):
        b, v, eps = 200.0, 1.0, 0.02
        p = price(0, b)
        self.assertAlmostEqual(attack(0, v, b, eps)["x"] / first_order_drift_limit(p, b, eps), 1.0, delta=0.01)

    def test_fee_threshold_first_order(self):
        b, v = 100.0, 1.0
        p = price(0, b)
        r = fee_threshold(0, v, b, 1e-3) / (v * (1 - p) / (2 * b))
        self.assertAlmostEqual(r, 1.0, delta=0.01)

    def test_fee_threshold_kills_attack(self):
        a = attack(0, 5, 10, 0.05)
        phi = fee_threshold(0, 5, 10, 0.05)
        self.assertAlmostEqual(a["profit"] - phi * (a["buy"] + a["sell"]), 0.0, 10)

    def test_batch_pro_rata_unbounded_limit(self):
        q, v, b = 0.0, 5.0, 10.0
        lim = v - trade_cost(q, v, b)
        self.assertAlmostEqual(batch_pro_rata_profit(q, 1e8, v, b), lim, 5)

    def test_batch_pro_rata_zero_at_zero(self):
        self.assertAlmostEqual(batch_pro_rata_profit(0, 0.0, 5, 10), 0.0, 12)

    def test_shuffle_is_one_third_of_sandwich(self):
        self.assertAlmostEqual(shuffle_expected_profit(0, 20, 5, 10), sandwich_profit(0, 20, 5, 10) / 3, 10)

    def test_optimal_tolerance_matches_numeric(self):
        q, v, b, sig, G = 0.0, 5.0, 100.0, 10.0, 50.0
        p = price(q, b); c0 = trade_cost(q, v, b)
        e_cf = optimal_tolerance(p, b, sig, c0, G)
        e_num, _ = best_tolerance_numeric(q, v, b, sig, G)
        self.assertLess(abs(e_cf - e_num), 0.03 * e_num)

    def test_no_tolerance_when_leak_dominates(self):
        self.assertEqual(optimal_tolerance(0.5, 10, 3, 100.0, 1.0), 0.0)


if __name__ == "__main__":
    unittest.main()
