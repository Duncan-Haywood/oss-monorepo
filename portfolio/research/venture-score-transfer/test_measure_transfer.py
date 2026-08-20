#!/usr/bin/env python3
"""Tests for measure_transfer.py.

These lock the statistic and the flip-margin logic against hand-computed
cases, so a later edit to the scoring or the router cannot silently change
what the finding means. Standard-library unittest, no network.
"""
import unittest
from pathlib import Path

import measure_transfer as mt


class RankBiserialTests(unittest.TestCase):
    def test_perfect_separation(self):
        stat, auc, n = mt.rank_biserial([9, 8, 7], [3, 2, 1])
        self.assertEqual(auc, 1.0)
        self.assertEqual(stat, 1.0)
        self.assertEqual(n, 9)

    def test_perfect_reverse_separation(self):
        stat, auc, n = mt.rank_biserial([1, 2], [8, 9])
        self.assertEqual(auc, 0.0)
        self.assertEqual(stat, -1.0)

    def test_ties_count_half(self):
        stat, auc, n = mt.rank_biserial([5], [5])
        self.assertEqual(auc, 0.5)
        self.assertEqual(stat, 0.0)

    def test_empty_group(self):
        stat, auc, n = mt.rank_biserial([], [1, 2])
        self.assertEqual((stat, auc, n), (0.0, 0.0, 0))


class FlipMarginTests(unittest.TestCase):
    def test_already_non_positive_is_zero(self):
        # dispatchable already scores below blocked -> statistic <= 0 already.
        comps = {"d": 1.0, "b": 5.0}
        disp = {"d": True, "b": False}
        self.assertEqual(mt.flip_margin(comps, disp), 0.0)

    def test_single_pair_margin_is_six_times_gap(self):
        # One dispatchable above one blocked by a 1.0 composite gap. Composite
        # is the mean over 6 dimensions, so closing it costs 6 raw points.
        comps = {"d": 5.0, "b": 4.0}
        disp = {"d": True, "b": False}
        self.assertAlmostEqual(mt.flip_margin(comps, disp), 6.0)

    def test_none_when_a_group_is_empty(self):
        comps = {"a": 5.0, "b": 4.0}
        disp = {"a": True, "b": True}
        self.assertIsNone(mt.flip_margin(comps, disp))


class AnalyseTests(unittest.TestCase):
    def test_analyse_runs_on_committed_scores(self):
        # Integration: the committed scores.yaml plus the live router must
        # agree on the venture set and produce a coherent result object.
        r = mt.analyse()
        self.assertEqual(r["n_ventures"], r["n_dispatchable"] + r["n_blocked"])
        self.assertGreater(r["n_dispatchable"], 0)
        self.assertGreater(r["n_blocked"], 0)
        self.assertEqual(len(r["table"]), r["n_ventures"])
        self.assertIn("supported", r)
        # Every scored venture is classified by the router (set equality is
        # enforced inside analyse(), which would have raised otherwise).
        self.assertEqual(
            {row["venture"] for row in r["table"]},
            set(mt.dispatchable_by_router()),
        )

    def test_scores_file_is_wellformed(self):
        dims, scores = mt.load_scores()
        self.assertEqual(len(dims), 6)
        for name, s in scores.items():
            for d in dims:
                self.assertGreaterEqual(s[d], 0, f"{name}.{d}")
                self.assertLessEqual(s[d], 10, f"{name}.{d}")


if __name__ == "__main__":
    unittest.main()
