"""tests/take_survey_kept.py rescores stored take-survey rows on the grid they were captured with (2026-11-19,
firmware/esp32/README.md "One informative wheel, counted by drill"): the stored sets carry seven candidates, the board
nine, and rescoring a seven-candidate row on the nine-point grid raised an IndexError."""

import os
import sys
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "firmware", "esp32"))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import take_survey_kept as tsk  # noqa: E402


def row(n, take_index, wheels):
    """A stored drill: `wheels` board rows of n candidates; build[0] indexes take_survey_sweep.TAKES."""
    return {"build": [take_index, 0, 0, 0.5, 1], "board_scores": [list(w) for w in wheels]}


def informative(grid, best_ms):
    """One wheel's rms row (a fraction of the pre-ball speed, as the board stores it) whose least is at best_ms and
    whose spread clears TAKE_SURVEY_BLIND."""
    return [1e-6 * (20.0 + 4.0 * abs(c / 1000 - best_ms)) for c in grid]


class GridForTest(unittest.TestCase):
    def test_each_frame_length_has_its_grid(self):
        for n, grid in tsk.GRIDS.items():
            self.assertEqual(len(grid), n)
            self.assertEqual(grid[0], 0)
            self.assertEqual(tsk.grid_for(row(n, 0, [[1.0] * n])), grid)

    def test_newest_grid_is_the_boards(self):
        import take_misfit_trace  # noqa: F401  (puts controller's own imports on the path)
        import controller
        self.assertEqual(tsk.GRIDS[len(controller.TAKE_SURVEY_GRID_US)], tuple(controller.TAKE_SURVEY_GRID_US))


class RescoreTest(unittest.TestCase):
    def test_seven_and_nine_candidate_rows_both_rescore(self):
        for n in (7, 9):
            grid = tsk.GRIDS[n]
            r = row(n, 2, [informative(grid, 6.0) for _ in range(20)])   # TAKES[2]: half-sine 6 ms
            vs = list(tsk.verdicts(r))
            self.assertTrue(vs, n)
            self.assertEqual(vs[-1][2], 6.0, n)

    def test_drill_counts_split_by_kept_wheels(self):
        grid = tsk.GRIDS[9]
        blind = [30e-6] * 9
        # one informative wheel among blind ones: every verdict rests on one kept wheel, and is right (6 ms)
        one = row(9, 2, [informative(grid, 6.0)] + [blind] * 19)
        # many informative wheels pointing at 4 ms on a 6 ms build: wrong on two or more
        many = row(9, 2, [informative(grid, 4.0) for _ in range(20)])
        d = tsk.drills([one, many])
        self.assertEqual(d["drills"], 2)
        self.assertEqual((d["one"], d["one_wrong"]), (1, 0))
        self.assertEqual((d["two"], d["two_wrong"]), (1, 1))
        self.assertEqual(d["silences"], 1)      # the one-wheel drill's right advice is held by a minimum of two
        self.assertEqual(d["spares"], 0)


if __name__ == "__main__":
    unittest.main()
