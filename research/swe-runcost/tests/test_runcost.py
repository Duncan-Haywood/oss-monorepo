import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_runcost.runcost import median_ci, top_share, loglog_slope_ci, fit_two, summarise


class T(unittest.TestCase):
    def test_top_share(self):
        self.assertAlmostEqual(top_share([1, 1, 1, 7], 0.25), 0.7)
        self.assertAlmostEqual(top_share([5], 0.01), 1.0)

    def test_median_ci_brackets(self):
        m, lo, hi = median_ci([1, 2, 3, 4, 5, 6, 7, 8, 9])
        self.assertEqual(m, 5)
        self.assertLessEqual(lo, m)
        self.assertGreaterEqual(hi, m)

    def test_loglog_recovers_exponent(self):
        x = [1, 2, 4, 8, 16, 32]
        s, lo, hi = loglog_slope_ci(x, [3 * v ** 1.5 for v in x])
        self.assertAlmostEqual(s, 1.5)
        self.assertAlmostEqual(lo, 1.5)

    def test_fit_two_recovers_prices(self):
        x1 = [1, 2, 3, 4]; x2 = [4, 1, 3, 1]
        a, b = fit_two(x1, x2, [0.5 * p + 15 * q for p, q in zip(x1, x2)])
        self.assertAlmostEqual(a, 0.5); self.assertAlmostEqual(b, 15)

    def test_summarise_shares_sum_to_one(self):
        runs = [{"track": t, "cost_usd": c, "tokens_in": 1e6 * c, "tokens_out": 1e3 * (i + 1),
                 "tool_calls": 10 + i, "wall_minutes": 1 + i}
                for i, (t, c) in enumerate([("a", 1), ("a", 2), ("b", 3), ("b", 5), ("a", 4)])]
        s = summarise(runs)
        self.assertAlmostEqual(sum(v["share"] for v in s["tracks"].values()), 1.0)


if __name__ == "__main__":
    unittest.main()
