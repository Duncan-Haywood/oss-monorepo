import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_fieldfill.fill import filled, wilson, week, rates, success_without_pr


class T(unittest.TestCase):
    def test_filled(self):
        for v in (0, 0.0, False, 3, "x", [1]):
            self.assertTrue(filled(v), v)
        for v in (None, "", [], {}):
            self.assertFalse(filled(v), v)

    def test_wilson(self):
        lo, hi = wilson(5, 10)
        self.assertLess(lo, 0.5); self.assertGreater(hi, 0.5)
        self.assertEqual(wilson(0, 0), (0.0, 1.0))
        self.assertEqual(wilson(10, 10)[1], 1.0) if wilson(10, 10)[1] == 1.0 else self.assertAlmostEqual(wilson(10, 10)[1], 1.0)

    def test_week(self):
        self.assertEqual(week("2026-10-19"), "2026-W43")
        self.assertEqual(week("2026-01-01"), "2026-W01")

    def test_rates_by_group(self):
        runs = [{"track": "a", "pr": 1, "cost_usd": None}, {"track": "a", "pr": None, "cost_usd": 0.5},
                {"track": "b", "pr": 2}]
        r = rates(runs, ["pr", "cost_usd"], key=lambda x: x["track"])
        self.assertEqual(r["a"]["pr"], (1, 2))
        self.assertEqual(r["a"]["cost_usd"], (1, 2))
        self.assertEqual(r["b"]["cost_usd"], (0, 1))

    def test_success_without_pr(self):
        runs = [{"outcome": "success", "pr": None}, {"outcome": "success", "pr": 3}, {"outcome": "partial", "pr": None}]
        self.assertEqual(success_without_pr(runs), (1, 2))


if __name__ == "__main__":
    unittest.main()
