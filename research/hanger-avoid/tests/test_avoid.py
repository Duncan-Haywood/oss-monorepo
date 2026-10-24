import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_avoid.avoid import (CellParams, PickParams, pick_allowed, replace, replicate,  # noqa: E402
                                shared_sequence, shared_sequence_avoid)
from hanger_pick.pile import make_pile, pick  # noqa: E402

CP, PP = CellParams(), PickParams()


class T(unittest.TestCase):
    def test_all_allowed_matches_pick(self):
        for policy in ("pinch", "see", "sweep"):
            for seed in range(5):
                r1, r2 = random.Random(seed), random.Random(seed)
                p1, p2 = make_pile(20, r1), make_pile(20, r2)
                t1, i1 = pick(p1, policy, PP, r1)
                g, t2, i2 = pick_allowed(p2, {id(h) for h in p2}, policy, PP, r2)
                self.assertEqual((t1, i1["ok"], i1["sweeps"]), (t2, i2["ok"], i2["sweeps"]))
                self.assertEqual(len(p1), len(p2))
                self.assertEqual(r1.random(), r2.random())

    def test_avoid_off_matches_sharedpile(self):
        for policy in ("pinch", "see"):
            a = shared_sequence(25, policy, PP, 7, 2, 0.3)
            b = shared_sequence_avoid(25, policy, PP, 7, 2, 0.3, avoid=False)
            self.assertEqual(a, b[:3])

    def test_length_determinism_and_redirects(self):
        a = shared_sequence_avoid(25, "see", PP, 3, 2, 0.45)
        self.assertEqual(len(a[0]), 25)
        self.assertEqual(a, shared_sequence_avoid(25, "see", PP, 3, 2, 0.45))
        self.assertGreater(sum(shared_sequence_avoid(25, "see", PP, s, 2, 0.45)[3] for s in range(10)), 0)

    def test_avoiding_cuts_waiting(self):
        w0 = sum(shared_sequence_avoid(25, "see", PP, s, 2, 0.3, avoid=False)[2] for s in range(30))
        w1 = sum(shared_sequence_avoid(25, "see", PP, s, 2, 0.3)[2] for s in range(30))
        self.assertLess(w1, w0)

    def test_no_clearance_no_effect(self):
        a = shared_sequence_avoid(25, "see", PP, 5, 2, 0.0)
        self.assertEqual((a[1], a[2], a[3]), (0, 0.0, 0))

    def test_runs_end_to_end(self):
        r = replicate(replace(CP, arms=2), "see", PP, 5, sep=0.3)
        self.assertGreater(r["done_per_hour"], 0)


if __name__ == "__main__":
    unittest.main()
