"""Stored take-survey sets rescore on the grid they were captured with (2026-11-19, firmware/esp32/README.md "The
sub-8 advised instant build, closed"): take_misfit_trace.survey_score, take_survey_trim and take_survey_blind summed
seven-candidate rows on the nine-point grid and raised an IndexError; and the stored advised instant build's share
was 4 / 7 in whole ppm, 0.635 unrounded."""

import os
import sys
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "firmware", "esp32"))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import take_misfit_trace as tm  # noqa: E402
import take_instant_sub8 as tis  # noqa: E402
import take_survey_blind as tsb  # noqa: E402

ROOT = os.path.join(HERE, "..")


def rows(n, best):
    grid = {7: (0, 2, 3, 4, 5, 6, 8), 8: (0, 2, 3, 4, 5, 6, 7, 8), 9: (0, 1.5, 2.5, 3, 4, 5, 6, 7, 8)}[n]
    return [[1e-6 * (20.0 + 4.0 * abs(c - best)) for c in grid] for _ in range(20)]


class GridOfTest(unittest.TestCase):
    def test_each_length(self):
        self.assertEqual(tm.grid_of(rows(7, 0)), (0, 2000, 3000, 4000, 5000, 6000, 8000))
        self.assertEqual(tm.grid_of(rows(8, 0))[-2], 7000)
        self.assertEqual(tm.grid_of(rows(9, 0)), tm.PICK_US)
        self.assertEqual(tm.grid_of([None, []]), tm.PICK_US)

    def test_seven_candidate_rows_score(self):
        least, ref, rms, share = tm.survey_score(rows(7, 6))
        self.assertEqual(least, 6.0)
        self.assertEqual(len(rms), 7)

    def test_blind_summary_on_seven(self):
        r = tsb.summary([{"build": [2, 0, 0, 0.5, 1], "board_scores": rows(7, 6)}], 1.5)
        self.assertEqual(r["n"], 1)


class StoredBuildTest(unittest.TestCase):
    def test_share_was_rounding(self):
        path = os.path.join(ROOT, tis.STORED)
        row = next(b for b in tis.load(path) if tuple(b["build"]) == tis.BUILD)
        pick, rms, exact, kept = tis.survey(row["board_scores"], tm.grid_of(row["board_scores"]), 0)
        self.assertEqual(pick, 3.5)
        self.assertAlmostEqual(min(rms) / rms[0], 4 / 7)
        self.assertGreater(min(exact) / exact[0], 0.6)      # host.TAKE_ADVISE_RATIO: unrounded, not advised


if __name__ == "__main__":
    unittest.main()
