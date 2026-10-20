import sys
import unittest
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_cellpick.cellpick import (CellParams, PickParams, dryers_served, pick_sequence,  # noqa: E402
                                      replicate)
from hanger_cell.model import hang_share, insertion_table, run_once  # noqa: E402

CP, PP = CellParams(), PickParams()


class T(unittest.TestCase):
    def test_sequence_length_and_determinism(self):
        a = pick_sequence(25, "see", PP, 3)
        self.assertEqual(len(a), 25)
        self.assertEqual(a, pick_sequence(25, "see", PP, 3))

    def test_no_picks_keeps_hanger_cell_unchanged(self):
        t, s = insertion_table(), hang_share()
        a = run_once(CP, 5, t, s)
        b = run_once(CP, 5, t, s, picks=None)
        self.assertEqual(a, b)

    def test_instant_perfect_picks_remove_pick_time(self):
        t, s = insertion_table(), hang_share()
        base = run_once(CP, 7, t, s)
        fast = run_once(CP, 7, t, s, picks=[(0.001, True)] * CP.load)
        self.assertLess(fast["makespan"], base["makespan"])
        self.assertEqual(fast["aside"], 0)

    def test_failed_pick_sets_garment_aside(self):
        t, s = insertion_table(), hang_share()
        r = run_once(CP, 7, t, s, picks=[(5.0, False)] * CP.load)
        self.assertEqual(r["aside"], CP.load)
        self.assertEqual(r["hung"] + r["folded"], 0)

    def test_blind_pinching_is_slower_than_seeing_on_one_arm(self):
        pinch = replicate(CP, "pinch", PP, 40)["done_per_hour"]
        see = replicate(CP, "see", PP, 40)["done_per_hour"]
        self.assertLess(pinch, see)

    def test_dryers_served(self):
        self.assertAlmostEqual(dryers_served(33.333333, 45.0, 25), 1.0, 5)


if __name__ == "__main__":
    unittest.main()
