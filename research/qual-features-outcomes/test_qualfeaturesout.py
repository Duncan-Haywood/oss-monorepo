import random
import unittest

import numpy as np

import qualfeaturesout as q


class Tests(unittest.TestCase):
    def test_numeric_features(self):
        f = q.numeric_features("WOW what?! Nice")
        self.assertEqual(len(f), 5)
        self.assertEqual((f[3], f[4]), (1, 1))
        self.assertAlmostEqual(f[2], 4 / 11)
        self.assertEqual(q.numeric_features("")[2], 0.0)

    def test_null_outcome_deterministic_and_balanced(self):
        self.assertEqual(q.null_outcome("abc"), q.null_outcome("abc"))
        share = sum(q.null_outcome(f"id{i}") for i in range(2000)) / 2000
        self.assertAlmostEqual(share, 0.5, delta=0.05)

    def test_flip_codes(self):
        rows = [[0, 1] * 5 for _ in range(200)]
        self.assertEqual(q.flip_codes(rows, 0, random.Random(1)), rows)
        flipped = q.flip_codes(rows, 0.5, random.Random(1))
        diff = sum(a != b for r, s in zip(rows, flipped) for a, b in zip(r, s)) / 2000
        self.assertAlmostEqual(diff, 0.5, delta=0.06)

    def test_fit_auc_separable_and_degenerate(self):
        rng = np.random.default_rng(0)
        y = rng.integers(0, 2, 400)
        X = np.c_[y + rng.normal(0, 0.3, 400), rng.normal(size=400)]
        self.assertGreater(q.fit_auc(X[:200], y[:200], X[200:], y[200:]), 0.95)
        self.assertIsNone(q.fit_auc(X[:50], np.zeros(50), X[200:], y[200:]))

    def test_sweep_null_is_near_half(self):
        rng = np.random.default_rng(1)
        X = rng.normal(size=(600, 4))
        y = rng.integers(0, 2, 600)
        res = q.sweep({"a": X}, y, np.arange(300), np.arange(300, 600), (100,), 8, 1, {"a": ["a"]})
        self.assertAlmostEqual(res[("a", 100)][0], 0.5, delta=0.08)


if __name__ == "__main__":
    unittest.main()
