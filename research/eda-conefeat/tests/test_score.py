import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from eda_conefeat import score as S


def row(i, line, delta, eq):
    return {"id": f"x@{line}:{i}", "line": line, "delta": delta, "abs_delta": abs(delta), "cells": 100 + delta,
            "miter": 1, "same_types": 0, "eq": eq}


class T(unittest.TestCase):
    def test_auc_perfect_and_tied(self):
        rows = [row(0, 1, 5, True), row(1, 2, 6, True), row(2, 3, 1, False), row(3, 4, 2, False)]
        self.assertEqual(S.auc(rows, "abs_delta"), 1.0)
        self.assertEqual(S.auc(rows, "miter"), 0.5)

    def test_best_split_separable(self):
        rows = [row(i, i, d, d > 10) for i, d in enumerate([1, 2, 3, 20, 30, 40])]
        c, sign = S.best_split(rows, "abs_delta")
        self.assertTrue(3 < c < 20 and sign == 1)
        self.assertEqual(S.loo_line(rows, "abs_delta"), 6)

    def test_real_features(self):
        rows = S.load()
        self.assertEqual(len(rows), 27)
        self.assertEqual(sum(r["eq"] for r in rows), 16)
        self.assertAlmostEqual(S.majority(rows), 16 / 27)
        # no position-free feature beats the majority class under leave-one-line-out
        for f in S.NAMES:
            self.assertLessEqual(S.loo_line(rows, f), 16)


if __name__ == "__main__":
    unittest.main()
