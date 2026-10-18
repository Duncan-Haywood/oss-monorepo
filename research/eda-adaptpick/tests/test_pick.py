import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from eda_adaptpick import models, pick  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROWS = models.load(os.path.join(HERE, "..", "experiments", "dataset.jsonl"))
X, Y, NAMES = models.matrix(ROWS)
FAM = np.array([r["family"] for r in ROWS])


class PickTests(unittest.TestCase):
    def setUp(self):
        self.Xf = X[FAM == "fir"]

    def test_choices_are_distinct_and_sized(self):
        for s in pick.STRATEGIES:
            c = pick.choose(s, self.Xf, NAMES, 5, np.random.RandomState(0))
            self.assertEqual(len(set(c)), 5, s)
            self.assertTrue(all(0 <= i < len(self.Xf) for i in c))

    def test_deterministic_strategies_ignore_rng(self):
        for s in ("smallest", "spread", "extremes"):
            a = pick.choose(s, self.Xf, NAMES, 5, np.random.RandomState(1))
            b = pick.choose(s, self.Xf, NAMES, 5, np.random.RandomState(2))
            self.assertEqual(a, b)

    def test_smallest_is_sorted_by_size_proxy(self):
        size = pick.size_proxy(self.Xf, NAMES)
        c = pick.choose("smallest", self.Xf, NAMES, 4)
        self.assertLessEqual(max(size[c]), np.sort(size)[3] + 1e-9)

    def test_extremes_contains_min_and_max(self):
        size = pick.size_proxy(self.Xf, NAMES)
        c = pick.choose("extremes", self.Xf, NAMES, 3)
        self.assertIn(int(np.argmin(size)), c)
        self.assertIn(int(np.argmax(size)), c)

    def test_selection_cannot_see_labels(self):
        import inspect
        self.assertEqual(list(inspect.signature(pick.choose).parameters), ["strategy", "Xf", "names", "k", "rs"])

    def test_weight_one_matches_unweighted_fit(self):
        te = np.where(FAM == "mac")[0]
        tr = np.where(FAM != "mac")[0]
        a = models.Model("linear").fit(X[tr], Y[tr]).predict(X[te])
        b = models.Model("linear").fit(X[tr], Y[tr], np.ones(len(tr))).predict(X[te])
        np.testing.assert_allclose(a, b)

    def test_score_returns_finite_apd(self):
        e, r = pick.score(X, Y, FAM, NAMES, "alu", "linear", "spread", 5, 1.0)
        self.assertTrue(np.isfinite(e) and e >= 0)
        self.assertTrue(-1 <= r <= 1)


if __name__ == "__main__":
    unittest.main()
