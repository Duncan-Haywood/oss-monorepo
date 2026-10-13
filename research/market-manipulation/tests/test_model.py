import unittest, math
from market_manipulation import *

Q, TAU, C, N, EPS = 0.3, 0.6, 0.05, 5, 0.01


class T(unittest.TestCase):
    def test_lmsr_price_and_profit_identity(self):
        b = 0.7; x = b * math.log(Q / (1 - Q)); y = 0.0
        self.assertAlmostEqual(lmsr_price(x, y, b), Q)
        x2 = b * math.log(TAU / (1 - TAU))
        cost = lmsr_cost(x2, y, b) - lmsr_cost(x, y, b)
        # expected payoff for belief r of holding (x2-x) YES shares, cost paid
        for r in (0.0, 0.3, 0.8, 1.0):
            self.assertAlmostEqual(r * (x2 - x) - cost, trade_profit(r, Q, TAU, b), places=9)

    def test_manip_loss_equals_extra_informed_rent(self):
        for b in (0.1, 0.5, 2.0):
            extra = informed_rent(Q, TAU, b, EPS) - informed_rent(Q, Q, b, EPS)
            self.assertAlmostEqual(extra, manip_loss(Q, Q, TAU, b), places=9)
            self.assertAlmostEqual(extra, b * kl(Q, TAU), places=9)

    def test_loss_linear_in_b(self):
        self.assertAlmostEqual(manip_loss(Q, Q, TAU, 3.0), 3 * manip_loss(Q, Q, TAU, 1.0), places=12)

    def test_informed_manipulator_cost_matches_lmsr(self):
        b = 0.4; x = b * math.log(Q / (1 - Q)); x2 = b * math.log(TAU / (1 - TAU))
        cost = lmsr_cost(x2, 0.0, b) - lmsr_cost(x, 0.0, b)      # YES shares worth 0 when Y=0
        self.assertAlmostEqual(cost, informed_manip_cost(Q, TAU, b), places=9)

    def test_entry_prob_indifference(self):
        for R in (0.06, 0.1, 0.2):
            e = entry_prob(R, C, N); s = 1 - (1 - e) ** (1 / N)
            self.assertAlmostEqual(R * e / (N * s), C, places=8)
        self.assertEqual(entry_prob(0.05, C, N), 0.0)
        self.assertEqual(entry_prob(N * C, C, N), 1.0)

    def test_gain_formula(self):
        b = 0.2
        e0 = entry_prob(informed_rent(Q, Q, b, EPS), C, N); e1 = entry_prob(informed_rent(Q, TAU, b, EPS), C, N)
        d = accuracy(1.0, Q, TAU, b, C, N, EPS) - accuracy(0.0, Q, TAU, b, C, N, EPS)
        self.assertAlmostEqual(d, e1 * (1 - Q) - e0 * Q - (1 - 2 * Q), places=12)
        self.assertAlmostEqual(accuracy(0.4, Q, TAU, b, C, N, EPS), accuracy(0, Q, TAU, b, C, N, EPS) + 0.4 * d, places=12)

    def test_regimes(self):
        self.assertFalse(helps(Q, TAU, 0.05, C, N, EPS))       # nobody enters: manipulation hurts by 1-2q
        self.assertAlmostEqual(accuracy_gain(Q, TAU, 0.05, C, N, EPS), -(1 - 2 * Q))
        self.assertTrue(helps(Q, TAU, 0.2, C, N, EPS))
        self.assertAlmostEqual(accuracy_gain(Q, TAU, 5.0, C, N, EPS), 0.0, places=12)  # everyone enters: neutral
        lo, hi = help_band(Q, TAU, C, N, EPS)
        self.assertTrue(0.05 < lo < 0.2 < hi < 5.0)
        self.assertFalse(helps(Q, TAU, lo * 0.9, C, N, EPS)); self.assertFalse(helps(Q, TAU, hi * 1.1, C, N, EPS))

    def test_upper_edge_closed_form(self):
        lo, hi = help_band(Q, TAU, C, N, EPS)
        self.assertAlmostEqual(b_upper(Q, C, N, EPS), hi, delta=0.005)
        self.assertAlmostEqual(entry_prob(informed_rent(Q, Q, b_upper(Q, C, N, EPS), EPS), C, N), 1.0)

    def test_monte_carlo_matches_formulas(self):
        b = 0.15
        r = simulate(0.5, Q, TAU, b, C, N, EPS, 120000, seed=3)
        self.assertAlmostEqual(r["accuracy"], accuracy(0.5, Q, TAU, b, C, N, EPS), delta=0.006)
        self.assertAlmostEqual(r["entry1"], entry_prob(informed_rent(Q, TAU, b, EPS), C, N), delta=0.02)
        self.assertAlmostEqual(r["entry0"], entry_prob(informed_rent(Q, Q, b, EPS), C, N), delta=0.02)
        self.assertAlmostEqual(r["manip_loss"], manip_loss(Q, Q, TAU, b), delta=0.006)
        self.assertAlmostEqual(r["entrant_net"], 0.0, delta=0.005)


if __name__ == "__main__":
    unittest.main()
