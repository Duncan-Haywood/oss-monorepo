import os
import sys
import unittest

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from eda_adapt import adapt, models  # noqa: E402

ROWS = models.load(os.path.join(HERE, "..", "experiments", "dataset.jsonl"))
X, Y, _ = models.matrix(ROWS)
FAM = np.array([r["family"] for r in ROWS])


class AdaptTests(unittest.TestCase):
    def test_dataset_shape(self):
        self.assertEqual(len(ROWS), 133)
        self.assertEqual(set(FAM), {"alu", "fir", "mac", "sorter"})

    def test_zero_is_independent_of_k(self):
        a = adapt.one_draw(X, Y, FAM, "mac", "ridge", 0, np.random.RandomState(1))
        b = adapt.one_draw(X, Y, FAM, "mac", "ridge", 5, np.random.RandomState(1))
        self.assertEqual(set(a), {"zero", "pooled"})
        self.assertEqual(a["pooled"], a["zero"])
        self.assertIn("scratch", b)

    def test_scratch_needs_two(self):
        self.assertNotIn("scratch", adapt.one_draw(X, Y, FAM, "fir", "linear", 1, np.random.RandomState(0)))

    def test_break_even(self):
        cv = {k: {"pooled": np.array([[0.5 if k < 5 else 0.1, 0.9]])} for k in adapt.K_GRID}
        self.assertEqual(adapt.break_even(cv), 5)
        self.assertIsNone(adapt.break_even(cv, "scratch"))

    def test_more_designs_help_on_average(self):
        cv = adapt.curve(X, Y, FAM, "sorter", "ridge", 5)
        self.assertLess(np.median(cv[16]["pooled"][:, 0]), np.median(cv[0]["zero"][:, 0]))


if __name__ == "__main__":
    unittest.main()
