import os, sys, math, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from elicitation import *


D = Dist([0, 1, 2, 5, 9], [.1, .3, .3, .2, .1])


class T(unittest.TestCase):
    def test_pinball_elicits_quantile(self):
        for tau in (.15, .5, .8, .95):
            r = argmin_report(D, lambda r, y: pinball(r, y, tau))
            self.assertAlmostEqual(r, quantile(D, tau), places=3)

    def test_expectile_loss_elicits_expectile(self):
        for tau in (.2, .5, .9):
            r = argmin_report(D, lambda r, y: expectile_loss(r, y, tau))
            self.assertAlmostEqual(r, expectile(D, tau), places=4)
        self.assertAlmostEqual(expectile(D, .5), mean(D), places=9)

    def test_any_bregman_score_elicits_mean(self):
        for G, dG in ((lambda x: x * x, lambda x: 2 * x),
                      (lambda x: math.exp(x / 4), lambda x: math.exp(x / 4) / 4),
                      (lambda x: x ** 4, lambda x: 4 * x ** 3)):
            r = argmin_report(D, bregman_score(G, dG))
            self.assertAlmostEqual(r, mean(D), places=3)

    def test_variance_not_elicitable_but_jointly_recoverable(self):
        p, q = Dist([0, 2], [.5, .5]), Dist([10, 12], [.5, .5])  # same variance 1
        ok, v = level_set_is_convex_counterexample(variance, p, q)
        self.assertFalse(ok)                  # mixture has variance 26
        self.assertAlmostEqual(v, 26.0)
        ok, _ = level_set_is_convex_counterexample(mean, Dist([0, 2], [.5, .5]),
                                                   Dist([1], [1]))
        self.assertTrue(ok)                   # mean level sets are convex
        # joint (mean, second moment) score recovers the variance
        best = min(((m / 20, s / 20) for m in range(0, 200) for s in range(0, 400, 5)),
                   key=lambda r: expected_score(D, joint_mean_second_moment, r))
        s2 = sum(pr * y * y for y, pr in zip(D.support, D.probs))
        self.assertAlmostEqual(best[1] - best[0] ** 2, variance(D), delta=0.6)
        self.assertLess(abs(best[0] - mean(D)), .06)
        self.assertLess(abs(best[1] - s2), 2.6)

    def test_truthful_beats_misreports(self):
        r0 = quantile(D, .8)
        base = expected_score(D, lambda r, y: pinball(r, y, .8), r0)
        for r in (0, 1, 3, 9):
            if r != r0:
                self.assertGreater(expected_score(D, lambda a, y: pinball(a, y, .8), r), base)

    def test_drift_study_orders_strategies(self):
        r = run_drift_study(tau=.99, seeds=6, n_test=5000)
        self.assertLess(r["empirical"]["loss"], r["gaussian"]["loss"])
        self.assertLess(r["empirical"]["loss"], r["median"]["loss"])
        self.assertLess(r["empirical"]["loss"], r["max_pad"]["loss"])
        self.assertGreater(r["empirical"]["coverage"], .97)
        self.assertLess(r["gaussian"]["coverage"], r["empirical"]["coverage"] + 1e-9)


if __name__ == "__main__":
    unittest.main()
