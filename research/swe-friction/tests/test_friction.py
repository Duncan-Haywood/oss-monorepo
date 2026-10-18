import unittest
from swe_friction.friction import *


class T(unittest.TestCase):
    def test_theme_order_and_fallback(self):
        self.assertEqual(theme_of("git fetch --unshallow exceeded the 120s timeout"), "shallow-clone")
        self.assertEqual(theme_of("pytest absent in fresh session"), "missing-tooling")
        self.assertEqual(theme_of("the step is stale"), "stale-or-wrong")
        self.assertEqual(theme_of("something odd"), "other")

    def test_gini_and_top_share(self):
        self.assertAlmostEqual(gini([1, 1, 1, 1]), 0.0)
        self.assertAlmostEqual(gini([0, 0, 0, 4]), 0.75)
        self.assertAlmostEqual(top_share([5, 3, 2], 1), 0.5)
        self.assertEqual(top_share([], 3), 0.0)

    def test_wilson(self):
        lo, hi = wilson(5, 10)
        self.assertAlmostEqual(lo, 0.2366, places=3); self.assertAlmostEqual(hi, 0.7634, places=3)
        self.assertEqual(wilson(0, 0), (0.0, 1.0))

    def test_repeat_rate_ignores_same_day(self):
        rows = [{"date": "d1", "file": "A", "issue": "stale"}, {"date": "d1", "file": "A", "issue": "stale"},
                {"date": "d2", "file": "A", "issue": "stale"}, {"date": "d2", "file": "B", "issue": "stale"},
                {"date": "d2", "file": "A", "issue": "odd"}]
        r = repeat_rate(rows)
        self.assertEqual(r["d1"], (0, 2)); self.assertEqual(r["d2"], (1, 2))  # "other" excluded

    def test_summarise_counts(self):
        rows = [{"date": "d1", "track": "t", "file": "A", "issue": "stale"}]
        s = summarise(rows, [{"date": "d1", "track": "t", "n": 1}, {"date": "d1", "track": "t", "n": 0}])
        self.assertEqual(s["runs_with"], 1); self.assertEqual(s["per_track"]["t"], [2, 1, 1])
