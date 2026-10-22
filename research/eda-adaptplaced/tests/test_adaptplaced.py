import os
import sys
import unittest

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..", "experiments")
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from eda_adaptplaced import adapt, data  # noqa: E402

ROWS, META = data.load(EXP)
X = data.features(ROWS)
FAM = np.array([r["family"] for r in ROWS])


class PlacedTests(unittest.TestCase):
    def test_every_design_joined_once(self):
        keys = {(r["family"], tuple(sorted(r["params"].items()))) for r in ROWS}
        self.assertEqual(len(keys), len(ROWS))
        self.assertGreaterEqual(len(ROWS), 120)

    def test_placed_area_tracks_cells(self):
        c, a = data.target(ROWS, "cells"), data.target(ROWS, "area")
        self.assertGreater(np.corrcoef(np.log(c), np.log(a))[0, 1], 0.95)

    def test_repair_does_not_shrink_area(self):
        for r in ROWS:
            self.assertGreaterEqual(r["placed"]["repaired_area"] + 1e-6, r["placed"]["placed_area"] - 1.0)

    def test_targets_positive(self):
        for t in ("cells", "area", "period"):
            self.assertTrue((data.target(ROWS, t) > 0).all())

    def test_k0_zero_equals_pooled(self):
        y = data.target(ROWS, "area")
        a = adapt.one_draw(X, y, FAM, "mac", "ridge", 0, np.random.RandomState(1))
        self.assertEqual(a["pooled"], a["zero"])

    def test_scratch_needs_two(self):
        y = data.target(ROWS, "area")
        self.assertNotIn("scratch", adapt.one_draw(X, y, FAM, "fir", "linear", 1, np.random.RandomState(0)))

    def test_break_even(self):
        cv = {k: {"pooled": np.array([[0.5 if k < 5 else 0.1, 0.9]])} for k in adapt.K_GRID}
        self.assertEqual(adapt.break_even(cv), 5)

    def test_more_designs_help_on_average(self):
        y = data.target(ROWS, "area")
        cv = adapt.curve(X, y, FAM, "sorter", "ridge", 5)
        self.assertLess(np.median(cv[16]["pooled"][:, 0]), np.median(cv[0]["zero"][:, 0]))


if __name__ == "__main__":
    unittest.main()
