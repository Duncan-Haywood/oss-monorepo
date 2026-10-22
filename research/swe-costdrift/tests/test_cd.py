import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_costdrift.cd import theil_sen, drift, daily_medians


def mk(d, c):
    return {"started": f"2026-10-{d:02d}T00:00:00Z", "cost_usd": c, "tool_calls": 10}


class T(unittest.TestCase):
    def test_theil_sen_line(self):
        self.assertAlmostEqual(theil_sen([0, 1, 2, 3], [1, 3, 5, 7]), 2.0)

    def test_theil_sen_outlier_robust(self):
        self.assertAlmostEqual(theil_sen([0, 1, 2, 3, 4], [0, 1, 2, 3, 100]), 1.0)

    def test_known_growth(self):
        runs = [mk(d, 1.0 * 1.1 ** (d - 10)) for d in range(10, 16) for _ in range(4)]
        p, lo, hi = drift(runs, boot=50)
        self.assertAlmostEqual(p, 10.0, places=6)
        self.assertLessEqual(lo, p); self.assertGreaterEqual(hi, p)

    def test_flat_interval_covers_zero(self):
        import random
        r = random.Random(3)
        runs = [mk(d, r.lognormvariate(0, .5)) for d in range(10, 16) for _ in range(30)]
        p, lo, hi = drift(runs, boot=200)
        self.assertLess(lo, 0); self.assertGreater(hi, 0)

    def test_daily_medians_min_n(self):
        runs = [mk(10, 1)] * 5 + [mk(11, 2)] * 2
        self.assertEqual(daily_medians(runs), [("2026-10-10", 5, 1)])


if __name__ == "__main__":
    unittest.main()
