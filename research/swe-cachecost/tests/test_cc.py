import os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_cachecost.cc import usable, cost_shares, loglog, tokens_total, fit

PRICES = {"m": {"input": 3.0, "output": 15.0, "cache_write_5m": 3.75, "cache_write_1h": 6.0, "cache_read": 0.3}}


def rec(**t):
    base = {"requests": 10, "input": 0, "output": 0, "cache_read": 0, "cache_write_5m": 0, "cache_write_1h": 0, "api_equivalent_complete": True}
    base.update(t)
    return {"cost_usd": 1.0, "tool_calls": 5, "usage": {"primary_model": "m", "totals": base}}


class T(unittest.TestCase):
    def test_usable(self):
        self.assertTrue(usable(rec()))
        self.assertFalse(usable({"cost_usd": 1, "tool_calls": 3}))
        r = rec(); r["usage"]["totals"]["api_equivalent_complete"] = False
        self.assertFalse(usable(r))

    def test_shares_sum_to_one_and_values(self):
        s = cost_shares(rec(output=1_000_000, cache_read=10_000_000), PRICES)
        self.assertAlmostEqual(sum(s.values()), 1.0)
        self.assertAlmostEqual(s["output"], 15 / 18)
        self.assertAlmostEqual(s["cache_read"], 3 / 18)

    def test_unknown_model(self):
        r = rec(output=5); r["usage"]["primary_model"] = "zzz"
        self.assertIsNone(cost_shares(r, PRICES))

    def test_tokens_total(self):
        self.assertEqual(tokens_total({"input": 1, "output": 2, "cache_read": 3}), 6)

    def test_loglog_slope(self):
        rs = [{"x": n, "y": n ** 2} for n in (1, 2, 4, 8)]
        xs, ys = loglog(rs, lambda r: r["x"], lambda r: r["y"])
        self.assertAlmostEqual(fit(xs, ys)[1], 2.0)


if __name__ == "__main__":
    unittest.main()
