import math, unittest
from risk_averse_scoring import *


class T(unittest.TestCase):
    def test_risk_neutral_truthful(self):
        for kind in ("log", "brier"):
            for p in (0.1, 0.5, 0.83):
                self.assertAlmostEqual(best_report(p, kind, lambda x: x, a=5), p, 5)

    def test_log_closed_form(self):
        for p in (0.05, 0.3, 0.7, 0.95):
            for alpha, b in ((1, 0.5), (2, 1.0), (0.3, 3.0)):
                r = best_report(p, "log", cara(alpha), b=b)
                self.assertAlmostEqual(r, log_report(p, alpha * b), 6)

    def test_brier_implicit_law(self):
        for p in (0.05, 0.3, 0.7, 0.95):
            for alpha, b in ((1, 0.5), (2, 1.0), (1, 4.0)):
                r = best_report(p, "brier", cara(alpha), b=b)
                self.assertAlmostEqual(r, brier_report(p, alpha * b), 6)
                self.assertAlmostEqual(brier_debias(r, alpha * b), p, 6)

    def test_shrinks_toward_half(self):
        for p in (0.1, 0.8):
            for f in (lambda p: log_report(p, 1.0), lambda p: brier_report(p, 1.0)):
                r = f(p)
                self.assertLess(abs(r - 0.5), abs(p - 0.5))
                self.assertEqual(r > 0.5, p > 0.5)
        self.assertAlmostEqual(brier_report(0.5, 3.0), 0.5, 9)

    def test_shrink_monotone_in_k(self):
        self.assertGreater(log_report(0.9, 0.5), log_report(0.9, 1.5))
        self.assertGreater(brier_report(0.9, 0.5), brier_report(0.9, 1.5))

    def test_brier_first_order(self):
        for p in (0.2, 0.7):
            k = 1e-3
            self.assertAlmostEqual(brier_report(p, k), brier_first_order(p, k), 6)

    def test_sqrt_utility_shrinks(self):
        r = best_report(0.9, "brier", math.sqrt, a=1.0, b=1.0)
        self.assertLess(r, 0.9)
        self.assertGreater(r, 0.5)

    def test_binarised_truthful_any_utility(self):
        us = [lambda x: x, cara(2.0), math.sqrt, lambda x: x ** 3 if x < 0.5 else 0.125 + (x - 0.5) * 0.2]
        for u in us:
            for p in (0.05, 0.4, 0.9):
                self.assertAlmostEqual(binarised_report(p, u, prize=1.0), p, 5)

    def test_certainty_equivalent_below_mean(self):
        P = 0.7
        self.assertLess(cara_certainty_equivalent(P, 2.0, 1.0), 2.0 * P)
        self.assertAlmostEqual(cara_certainty_equivalent(P, 2.0, 1e-6), 2.0 * P, 4)

    def test_decision_threshold(self):
        self.assertAlmostEqual(log_decision_threshold(0.9, 0), 0.9, 12)
        t = log_decision_threshold(0.9, 0.5)
        self.assertAlmostEqual(log_report(t, 0.5), 0.9, 9)
        self.assertGreater(decision_regret_band(0.9, 1.0), decision_regret_band(0.9, 0.5))

    def test_max_scale(self):
        b = max_scale_for_distortion(2.0, 0.1)
        self.assertAlmostEqual(1 / (1 + 2.0 * b), 0.9, 12)

    def test_aggregation_correction(self):
        ks = [0.5] * 5
        r = simulate_aggregation(5, 0.6, ks, trials=6000, seed=3)
        self.assertAlmostEqual(r["true_k"], r["bayes"], 9)
        self.assertGreater(r["naive"], r["bayes"] + 0.01)
        self.assertAlmostEqual(r["kbar"], r["bayes"], 9)


if __name__ == "__main__":
    unittest.main()
