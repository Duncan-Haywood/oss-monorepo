import math
import unittest
from peer_prediction_effort import *


class T(unittest.TestCase):
    def test_dg_closed_form(self):
        for p in (0.1, 0.5, 0.8):
            for qi, qj in ((0.9, 0.7), (0.6, 0.95)):
                self.assertAlmostEqual(dg_payoff(STRATEGIES["truthful"], STRATEGIES["truthful"], qi, qj, p),
                                       dg_truthful_closed_form(qi, qj, p), places=12)

    def test_dg_uninformative_pays_zero(self):
        for p in (0.1, 0.5):
            for a in ("always0", "always1"):
                for b in STRATEGIES:
                    self.assertAlmostEqual(dg_payoff(STRATEGIES[a], STRATEGIES[b], 0.85, 0.85, p), 0.0, places=12)

    def test_oa_skewed_prior_truthful_not_equilibrium(self):
        eq = {(a, b): v for a, b, v in pure_equilibria("oa", 0.8, 0.1)}
        self.assertIn(("always0", "always0"), eq)
        self.assertNotIn(("truthful", "truthful"), eq)  # always0 earns 1.0 against always0; truthful only 0.68 vs truthful
        self.assertAlmostEqual(eq[("always0", "always0")], 1.0)
        self.assertLess(oa_payoff(STRATEGIES["truthful"], STRATEGIES["truthful"], 0.8, 0.8, 0.1), 1.0)

    def test_dg_truthful_is_maximal_equilibrium(self):
        eq = {(a, b): v for a, b, v in pure_equilibria("dg", 0.8, 0.3)}
        self.assertIn(("truthful", "truthful"), eq)
        self.assertIn(("flip", "flip"), eq)  # relabelling equilibrium pays the same
        self.assertAlmostEqual(eq[("flip", "flip")], eq[("truthful", "truthful")])
        for (a, b), v in eq.items():
            self.assertLessEqual(v, eq[("truthful", "truthful")] + 1e-12)
            if a in ("always0", "always1") or b in ("always0", "always1"):
                self.assertAlmostEqual(v, 0.0)  # uninformative equilibria exist but pay nothing

    def test_monte_carlo_matches_exact(self):
        ex = dg_payoff(STRATEGIES["truthful"], STRATEGIES["truthful"], 0.85, 0.75, 0.3)
        mc = dg_monte_carlo(STRATEGIES["truthful"], STRATEGIES["truthful"], 0.85, 0.75, 0.3, trials=200000)
        self.assertAlmostEqual(mc, ex, delta=0.006)

    def test_continuous_threshold(self):
        c, p = 0.1, 0.5
        a0 = alpha_threshold(p, c)
        for alpha, expect_pos in ((0.8 * a0, False), (1.3 * a0, True)):
            eqs = symmetric_equilibria(scale_A(alpha, p), c)
            self.assertEqual(any(e > 1e-3 for e, _ in eqs), expect_pos)
            self.assertEqual(eqs[0][0], 0.0)
        # above threshold zero effort is an equilibrium but unstable; below it is stable
        self.assertFalse(symmetric_equilibria(scale_A(1.3 * a0, p), c)[0][1])
        self.assertTrue(symmetric_equilibria(scale_A(0.8 * a0, p), c)[0][1])

    def test_binary_gold_rate(self):
        A, c, gH = 1.0, 0.3, 0.8
        rs = gold_rate_to_kill_shirking(A, c, gH)
        self.assertEqual(binary_equilibria(A, c, gH, r=0.0), ["LL", "HH"])
        self.assertEqual(binary_equilibria(A, c, gH, r=rs * 0.99), ["LL", "HH"])
        self.assertEqual(binary_equilibria(A, c, gH, r=rs * 1.01), ["HH"])

    def test_optimal_gold_design_is_minimum(self):
        c, gH, G = 0.05, 0.8, 0.5
        u, r, tc = optimal_gold_design(c, gH, G)
        self.assertAlmostEqual(total_cost(u, c, gH, G), tc, places=12)
        for f in (0.7, 0.9, 1.1, 1.4):
            self.assertGreater(total_cost(u * f, c, gH, G), tc)


if __name__ == "__main__":
    unittest.main()
