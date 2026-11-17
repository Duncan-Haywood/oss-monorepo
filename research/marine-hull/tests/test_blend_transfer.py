import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_blend_transfer as bt  # noqa: E402
import run_season_week as sw  # noqa: E402

POINT, YEAR = "A+40", 2021


class BlendTransferTests(unittest.TestCase):
    def test_weights_reproduce_6zs_columns(self):
        key = (5000.0, 50.0, POINT, YEAR)
        _, a = bt.score(key)
        _, b = sw.score(key)
        for tau in bt.TAUS:
            for w, est in ((0.0, "K"), (0.25, "B25"), (0.5, "B50"), (0.75, "B75"), (1.0, "L")):
                for i in range(3):
                    self.assertAlmostEqual(a[(w, tau)][i], b[(est, tau, 0.0)][i], places=6)
        for i in range(3):
            self.assertAlmostEqual(a[bt.BASE][i], b[sw.BASE][i], places=6)

    def test_estimate(self):
        h = [480.0] * 7 + [0.0]
        hc = [240.0] * 8
        self.assertAlmostEqual(bt.estimate(0.0, h, hc, 7, 50.0), 10.0)
        self.assertAlmostEqual(bt.estimate(0.125, h, hc, 7, 50.0), 11.25)
        self.assertAlmostEqual(bt.estimate(1.0, h, hc, 7, 50.0), 20.0)
        self.assertAlmostEqual(bt.estimate(0.5, h, hc, 0, 50.0), 30.0)  # no history: week falls back to hotel

    def test_splits_partition_points(self):
        for name, (sel, test) in bt.SPLITS.items():
            if name != "T":
                self.assertFalse(set(sel) & set(test))
        self.assertEqual(len(bt.PACIFIC) + len(bt.ATLANTIC) + len(bt.CORRIDOR), 30)
        self.assertEqual(set(bt.SPLITS["S1"][1]) | set(bt.PACIFIC), set(bt.PTS))

    def test_selection_and_dominance(self):
        tot = {g: (100.0, 50.0, 0) for g in bt.GRID}
        tot[bt.BASE] = (100.0, 10.0, 0)
        tot[(0.375, 20)] = (108.0, 9.0, 0)
        tot[(0.5, 10)] = (115.0, 10.5, 0)
        self.assertEqual(bt.select(tot), (0.375, 20))
        self.assertTrue(bt.dominates(tot, (0.375, 20)))
        self.assertFalse(bt.dominates(tot, (0.5, 10)))
        self.assertEqual(bt.select(tot, bt.G4), min(bt.G4, key=lambda g: tot[g][1]))


if __name__ == "__main__":
    unittest.main()
