import unittest

from verification_markets.market_maker import LMSRMarketMaker


class TestLMSRMarketMaker(unittest.TestCase):
    def test_starts_at_fifty_fifty(self):
        m = LMSRMarketMaker(liquidity=10.0)
        self.assertAlmostEqual(m.price_yes(), 0.5)

    def test_buying_yes_increases_price(self):
        m = LMSRMarketMaker(liquidity=10.0)
        before = m.price_yes()
        m.trade(1, 5.0)
        after = m.price_yes()
        self.assertGreater(after, before)
        self.assertLess(after, 1.0)

    def test_buying_no_decreases_price(self):
        m = LMSRMarketMaker(liquidity=10.0)
        m.trade(0, 5.0)
        self.assertLess(m.price_yes(), 0.5)

    def test_price_bounded_in_unit_interval(self):
        # Large enough to push the price close to 1, but well short of the
        # magnitude where float64 exp() saturates exp(x)/(exp(x)+1) to
        # exactly 1.0 (that happens once x exceeds ~37).
        m = LMSRMarketMaker(liquidity=5.0)
        for _ in range(10):
            m.trade(1, 3.0)
        self.assertLess(m.price_yes(), 1.0)
        self.assertGreater(m.price_yes(), 0.99)
        self.assertGreater(m.price_yes(), 0.0)

    def test_trade_cost_matches_cost_function_delta(self):
        m = LMSRMarketMaker(liquidity=8.0)
        c0 = m.cost()
        paid = m.trade(1, 3.0)
        c1 = m.cost()
        self.assertAlmostEqual(paid, c1 - c0)

    def test_liquidity_must_be_positive(self):
        with self.assertRaises(ValueError):
            LMSRMarketMaker(liquidity=0)

    def test_worst_case_loss_bound(self):
        import math

        m = LMSRMarketMaker(liquidity=10.0)
        self.assertAlmostEqual(m.worst_case_loss(), 10.0 * math.log(2))


if __name__ == "__main__":
    unittest.main()
