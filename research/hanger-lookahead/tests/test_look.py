import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(HERE.parent / "hanger-avoid" / "src"))
from hanger_lookahead.look import CellParams, PickParams, per_load, replace, sequence_look  # noqa: E402
from hanger_avoid.avoid import replicate, shared_sequence_avoid  # noqa: E402

CP, PP = replace(CellParams(), arms=2), PickParams()


class T(unittest.TestCase):
    def test_no_lookahead_equals_hanger_avoid(self):
        for policy in ("see", "sweep", "pinch"):
            for seed in range(4):
                a, *_ = sequence_look(CP.load, policy, PP, seed, 0.30, look=False)
                b, *_ = shared_sequence_avoid(CP.load, policy, PP, seed, 2, 0.30, avoid=True)
                self.assertEqual(a, b)

    def test_zero_clearance_changes_nothing(self):
        a, _, rl = sequence_look(CP.load, "sweep", PP, 3, 0.0, look=True)
        b, _, _ = sequence_look(CP.load, "sweep", PP, 3, 0.0, look=False)
        self.assertEqual(a, b)
        self.assertEqual(rl, 0)

    def test_zero_window_is_no_lookahead(self):
        a, *_ = sequence_look(CP.load, "pinch", PP, 5, 0.30, look=True, window=-1.0)
        b, *_ = sequence_look(CP.load, "pinch", PP, 5, 0.30, look=False)
        self.assertEqual(a, b)

    def test_every_garment_picked_once(self):
        picks, *_ = sequence_look(CP.load, "see", PP, 1, 0.45, look=True)
        self.assertEqual(len(picks), CP.load)

    def test_same_seed_same_loads(self):
        d1, r1 = per_load(CP, "see", PP, 3, 0.30, True)
        d2, r2 = per_load(CP, "see", PP, 3, 0.30, True)
        self.assertEqual((d1, r1), (d2, r2))

    def test_matches_hanger_avoid_per_load(self):
        d, _ = per_load(CP, "see", PP, 3, 0.30, False)
        ref = [r["done_per_hour"] for r in replicate(CP, "see", PP, 3, 0, 0.30)["_runs"]]
        self.assertEqual(d, ref)

    def test_lookahead_redirects_sometimes(self):
        _, reds = per_load(CP, "sweep", PP, 20, 0.45, True)
        self.assertGreater(sum(reds), 0)


if __name__ == "__main__":
    unittest.main()
