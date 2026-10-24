import math, os, random, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_callcost.cc import pos, usable, fit, loglog, slope_ci, cv_errors, ratio_errors, quantile


class T(unittest.TestCase):
    def test_pos(self):
        for v in (None, True, 0, -1, "3"):
            self.assertFalse(pos(v))
        self.assertTrue(pos(2.5))

    def test_usable(self):
        self.assertTrue(usable({"cost_usd": 1, "tool_calls": 3}))
        self.assertFalse(usable({"cost_usd": 1}))

    def test_fit_exact(self):
        a, b, r2 = fit([0, 1, 2], [1, 3, 5])
        self.assertAlmostEqual(a, 1); self.assertAlmostEqual(b, 2); self.assertAlmostEqual(r2, 1)

    def test_loglog_skips_bad(self):
        xs, ys = loglog([{"tool_calls": math.e, "cost_usd": 1}, {"tool_calls": 0, "cost_usd": 1}])
        self.assertEqual(len(xs), 1); self.assertAlmostEqual(xs[0], 1)

    def test_power_law_recovered(self):
        rnd = random.Random(0)
        xs = [rnd.uniform(1, 6) for _ in range(200)]
        ys = [-2 + 1.3 * x + rnd.gauss(0, .1) for x in xs]
        self.assertAlmostEqual(fit(xs, ys)[1], 1.3, delta=0.05)
        lo, hi = slope_ci(xs, ys, reps=200)
        self.assertLess(lo, 1.3); self.assertGreater(hi, 1.3)

    def test_cv_noiseless_zero_error(self):
        xs = [i / 10 for i in range(50)]
        ys = [0.5 + x for x in xs]
        self.assertLess(max(cv_errors(xs, ys)), 1e-9)

    def test_ratio_exact_when_slope_one(self):
        xs = [i / 10 for i in range(50)]
        self.assertLess(max(ratio_errors(xs, [x - 1 for x in xs])), 1e-9)

    def test_quantile(self):
        self.assertEqual(quantile([3, 1, 2], 0), 1)
        self.assertEqual(quantile([3, 1, 2], .99), 3)


if __name__ == "__main__":
    unittest.main()
