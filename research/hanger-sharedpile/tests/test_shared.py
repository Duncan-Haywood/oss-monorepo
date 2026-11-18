import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_sharedpile.shared import CellParams, PickParams, replace, replicate, shared_sequence  # noqa: E402
from hanger_cellpick.cellpick import pick_sequence  # noqa: E402

CP, PP = CellParams(), PickParams()


class T(unittest.TestCase):
    def test_length_and_determinism(self):
        a = shared_sequence(25, "see", PP, 3, 2, 0.3)
        self.assertEqual(len(a[0]), 25)
        self.assertEqual(a, shared_sequence(25, "see", PP, 3, 2, 0.3))

    def test_one_arm_matches_cellpick_sequence(self):
        self.assertEqual(shared_sequence(25, "see", PP, 4, 1, 0.5)[0], pick_sequence(25, "see", PP, 4))

    def test_no_clearance_means_no_blocking(self):
        _, b, w = shared_sequence(25, "see", PP, 5, 2, 0.0)
        self.assertEqual((b, w), (0, 0.0))

    def test_huge_clearance_blocks_and_waits(self):
        _, b, w = shared_sequence(25, "see", PP, 5, 2, 10.0, downstream=0.0)
        self.assertGreater(b, 0)
        self.assertGreater(w, 0)

    def test_waiting_is_added_to_the_blocked_picks(self):
        # Picks draw from the RNG in the same order whatever the clearance, so the blocked run's pick times are the
        # unblocked run's plus exactly the seconds waited (round 63 audit: `t += 0.0` survived every test).
        free, _, _ = shared_sequence(25, "pinch", PP, 7, 2, 0.0)
        held, b, w = shared_sequence(25, "pinch", PP, 7, 2, 0.30)
        self.assertGreater(b, 0)
        self.assertAlmostEqual(sum(t for t, _ in held), sum(t for t, _ in free) + w, places=6)

    def test_blocking_cannot_raise_output(self):
        cp = replace(CP, arms=2)
        free = replicate(cp, "see", PP, 40, sep=0.0)["done_per_hour"]
        blocked = replicate(cp, "see", PP, 40, sep=10.0, downstream=0.0)["done_per_hour"]
        self.assertLessEqual(blocked, free + 1e-9)


if __name__ == "__main__":
    unittest.main()
