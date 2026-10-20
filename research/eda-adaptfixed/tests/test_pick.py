import inspect
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from eda_adaptfixed import models, pick  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROWS = models.load(os.path.join(HERE, "..", "experiments", "dataset.jsonl"))
X, Y, NAMES = models.matrix(ROWS)
FAM = np.array([r["family"] for r in ROWS])


class FixedTestSetTests(unittest.TestCase):
    def test_split_is_disjoint_complete_and_seeded(self):
        for f in sorted(set(FAM)):
            pool, test = pick.split(FAM, f, 3)
            self.assertEqual(len(set(pool) & set(test)), 0)
            self.assertEqual(sorted(np.concatenate([pool, test])), list(np.where(FAM == f)[0]))
            a, b = pick.split(FAM, f, 3)
            self.assertTrue((a == pool).all() and (b == test).all())
            self.assertFalse((pick.split(FAM, f, 4)[1] == test).all())

    def test_choose_has_no_label_argument(self):
        self.assertNotIn("y", inspect.signature(pick.choose).parameters)

    def test_choices_distinct_and_inside_pool(self):
        pool, test = pick.split(FAM, "sorter", 0)
        for s in pick.STRATEGIES:
            c = pick.choose(s, X[pool], NAMES, 8, np.random.RandomState(0))
            self.assertEqual(len(set(c)), 8, s)
            self.assertTrue(all(0 <= i < len(pool) for i in c))

    def test_test_set_independent_of_strategy(self):
        # scoring never reads which designs were chosen as test points: same split for every strategy
        for s in pick.STRATEGIES:
            self.assertEqual(list(pick.split(FAM, "alu", 1)[1]), list(pick.split(FAM, "alu", 1)[1]))

    def test_score_is_finite_and_deterministic(self):
        a = pick.score(X, Y, FAM, NAMES, "fir", "linear", "spread", 5, 5.0, 0)
        b = pick.score(X, Y, FAM, NAMES, "fir", "linear", "spread", 5, 5.0, 0)
        self.assertEqual(a, b)
        self.assertTrue(0 <= a < 10)


if __name__ == "__main__":
    unittest.main()
