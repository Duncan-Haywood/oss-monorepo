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


class Headline(unittest.TestCase):
    """Pins two cells of experiments/results.txt at the full 1000 loads, so a change to the gating rule
    (sign, overlap terms, threshold) that moves an intermediate-tau result fails here. The tau = +-inf tests
    above cannot see such a change (quality census 2026-11-17: four of five seeded changes survived them)."""

    def cell(self, policy, sep, tau):
        a, _ = per_load(CP, policy, PP, 1000, sep, 1e9)
        b, reds = per_load(CP, policy, PP, 1000, sep, tau)
        return sum(b) / 1000 - sum(a) / 1000, sum(reds) / 1000

    def test_pinch_030_tau10_matches_results(self):
        diff, reds = self.cell("pinch", 0.30, 10.0)
        self.assertAlmostEqual(diff, 1.35, delta=0.005)
        self.assertAlmostEqual(reds, 2.19, delta=0.005)

    def test_see_015_tau6_matches_results(self):
        diff, reds = self.cell("see", 0.15, 6.0)
        self.assertAlmostEqual(diff, -0.30, delta=0.005)
        self.assertAlmostEqual(reds, 3.35, delta=0.005)


if __name__ == "__main__":
    unittest.main()
