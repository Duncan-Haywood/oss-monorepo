import math, random, unittest
from lmsr_fees import *


class T(unittest.TestCase):
    def test_band_width_and_target(self):
        for q in (0.01, 0.3, 0.9):
            for f in (0.02, 0.2):
                lo, hi = band(q, f)
                self.assertAlmostEqual(hi - lo, f / (1 + f), 12)
                self.assertLessEqual(lo, q); self.assertGreaterEqual(hi, q)
                self.assertEqual(trade_target(0.5 * (lo + hi), q, f), 0.5 * (lo + hi))
                self.assertAlmostEqual(trade_target(0.001, q, f), lo, 12) if lo > 0.001 else None

    def test_target_is_profit_maximiser(self):
        b, f, q, p = 3.0, 0.1, 0.7, 0.4
        best = trade_target(p, q, f)
        grid = [0.01 * i for i in range(1, 100)]
        vals = [trader_profit(p, x, q, b, f) for x in grid]
        self.assertAlmostEqual(grid[max(range(len(vals)), key=vals.__getitem__)], best, delta=0.0101)
        self.assertGreaterEqual(trader_profit(p, best, q, b, f), max(vals) - 1e-12)

    def test_zero_edge_no_trade(self):
        self.assertEqual(trade_target(0.5, 0.5, 0.05), 0.5)
        self.assertGreater(trader_profit(0.5, 0.6, 0.7, 1.0, 0.0), 0)

    def test_signal_thresholds_exact(self):
        p, f = 0.3, 0.1
        up, down = signal_thresholds(p, f)
        for l, moves in ((up * 1.001, True), (up * 0.999, False)):
            self.assertEqual(trade_target(p, sigmoid(logit(p) + l), f) > p, moves)
        for l, moves in ((down * 1.001, True), (down * 0.999, False)):
            self.assertEqual(trade_target(p, sigmoid(logit(p) - l), f) < p, moves)
        self.assertEqual(signal_thresholds(0.95, 0.1)[0], math.inf)

    def test_threshold_at_half_is_two_atanh_f(self):
        for f in (0.02, 0.1, 0.5):
            u, d = signal_thresholds(0.5, f)
            self.assertAlmostEqual(u, 2 * math.atanh(f), 12)
            self.assertAlmostEqual(d, u, 12)
        a = 0.7                                                     # cliff at f = 2a-1
        lam = math.log(a / (1 - a))
        self.assertAlmostEqual(math.tanh(lam / 2), 2 * a - 1, 12)

    def test_maker_pnl_fee_bound(self):
        rng = random.Random(3)
        b = 2.0
        for f in (0.0, 0.05, 0.3):
            for _ in range(500):
                p, s, pnl, fees, path, _ = market_run(8, 0.7, f, b, rng)
                self.assertGreaterEqual(pnl, -b * math.log(2) + fees - 1e-9)
                self.assertAlmostEqual(fees, fee_revenue(path, b, f), 9)

    def test_monotone_fee_closed_form(self):
        b, f = 2.0, 0.1
        path = [0.5, 0.6, 0.75, 0.9]
        self.assertAlmostEqual(fee_revenue(path, b, f), f * b * math.log(0.5 / 0.1), 12)

    def test_fee_zero_recovers_bayes(self):
        rng = random.Random(4)
        for _ in range(50):
            p, s, pnl, fees, path, lams = market_run(6, 0.7, 0.0, 1.0, random.Random(rng.random()))
            self.assertAlmostEqual(logit(p), sum(lams), 9)
            self.assertEqual(fees, 0.0)
            self.assertGreaterEqual(pnl, -math.log(2) - 1e-9)


if __name__ == "__main__":
    unittest.main()
