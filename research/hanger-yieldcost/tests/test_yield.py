import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(HERE.parent / "hanger-avoid" / "src"))
sys.path.insert(0, str(HERE.parent / "hanger-lookahead" / "src"))
from hanger_yieldcost.yieldcost import CellParams, PickParams, per_load, replace, sequence_yield  # noqa: E402
from hanger_lookahead.look import sequence_look  # noqa: E402
from hanger_avoid.avoid import shared_sequence_avoid  # noqa: E402

CP, PP = replace(CellParams(), arms=2), PickParams()


class T(unittest.TestCase):
    def test_tau_zero_equals_hanger_lookahead(self):
        for policy in ("see", "sweep", "pinch"):
            for seed in range(4):
                a = sequence_yield(CP.load, policy, PP, seed, 0.30, tau=-1e9)
                b = sequence_look(CP.load, policy, PP, seed, 0.30, look=True)
                self.assertEqual(a, b)

    def test_huge_tau_equals_hanger_avoid(self):
        for policy in ("see", "sweep", "pinch"):
            for seed in range(4):
                a, _, rl = sequence_yield(CP.load, policy, PP, seed, 0.30, tau=1e9)
                b, *_ = shared_sequence_avoid(CP.load, policy, PP, seed, 2, 0.30, avoid=True)
                self.assertEqual(a, b)
                self.assertEqual(rl, 0)

    def test_redirects_fall_as_tau_rises(self):
        r = [sum(per_load(CP, "see", PP, 20, 0.30, tau)[1]) for tau in (-1e9, 5.0, 20.0, 1e9)]
        self.assertEqual(r, sorted(r, reverse=True))
        self.assertEqual(r[-1], 0)

    def test_every_garment_picked_once(self):
        picks, *_ = sequence_yield(CP.load, "sweep", PP, 1, 0.45, tau=5.0)
        self.assertEqual(len(picks), CP.load)

    def test_deterministic(self):
        self.assertEqual(per_load(CP, "pinch", PP, 3, 0.30, 5.0), per_load(CP, "pinch", PP, 3, 0.30, 5.0))
