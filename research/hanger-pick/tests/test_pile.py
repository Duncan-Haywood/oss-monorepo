import math
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_pick import pile as P  # noqa: E402


def g(x, y, r, z, ang=0.0):
    return P.Garment(x, y, r, z, ang)


class Geometry(unittest.TestCase):
    def test_alone_is_fully_visible(self):
        a = g(0.3, 0.3, 0.2, 0)
        self.assertEqual(P.visible(a, [a]), 1.0)

    def test_cover_over_opening_hides_it_and_only_higher_counts(self):
        a = g(0.3, 0.3, 0.2, 0)
        ox, oy = a.opening()
        cover = g(ox, oy, 0.1, 1)
        under = g(ox, oy, 0.1, -1)
        self.assertEqual(P.visible(a, [a, cover]), 0.0)
        self.assertEqual(P.visible(a, [a, under]), 1.0)

    def test_sweep_moves_the_chosen_garment_within_bin(self):
        a, b = g(0.3, 0.3, 0.2, 0), g(0.3, 0.3, 0.2, 1)
        pile = [a, b]
        self.assertTrue(P.sweep_top(pile, 0, random.Random(1)))
        self.assertEqual((a.x, a.y), (0.3, 0.3))
        self.assertTrue(0 <= b.x <= P.BIN and 0 <= b.y <= P.BIN)
        self.assertFalse(P.sweep_top(pile, 2, random.Random(1)))

    def test_hidden_opening_is_never_visible(self):
        a = g(0.3, 0.3, 0.2, 0)
        a.hidden = True
        self.assertEqual(P.visible(a, [a]), 0.0)

    def test_below_overlap_counts_lower_neighbours(self):
        a, b, c = g(0.3, 0.3, 0.2, 2), g(0.35, 0.3, 0.2, 1), g(0.0, 0.0, 0.05, 0)
        self.assertEqual(P.below_overlap(a, [a, b, c]), 1)


class Policies(unittest.TestCase):
    def test_single_garment_direct_cost(self):
        p = P.Params(p_direct=1.0, p_hidden=0.0)
        for pol in ("see", "sweep"):
            r = P.unload(1, pol, p, 0)
            self.assertAlmostEqual(r["per_item"], p.t_see + p.t_grasp)
            self.assertEqual(r["direct"], 1.0)

    def test_all_hidden_means_no_policy_aims_directly(self):
        p = P.Params(p_hidden=1.0)
        for pol in ("see", "sweep"):
            self.assertEqual(P.unload(10, pol, p, 2)["direct"], 0.0)

    def test_pinch_never_direct_and_every_policy_empties_the_pile(self):
        p = P.Params()
        for pol in ("pinch", "see", "sweep"):
            r = P.unload(12, pol, p, 3)
            self.assertGreater(r["per_item"], 0)
        self.assertEqual(P.unload(12, "pinch", p, 3)["direct"], 0.0)

    def test_deterministic(self):
        p = P.Params()
        self.assertEqual(P.unload(15, "sweep", p, 7), P.unload(15, "sweep", p, 7))

    def test_pinch_cost_matches_geometric_regrasps_when_q_is_one(self):
        p = P.Params(q_find=1.0, p_double_each=0.0)
        r = P.unload(5, "pinch", p, 1)
        self.assertAlmostEqual(r["per_item"], p.t_see + p.t_grasp + p.t_regrasp)
        self.assertEqual(r["fails"], 0.0)

    def test_failures_when_opening_never_found(self):
        r = P.unload(5, "pinch", P.Params(q_find=0.0), 1)
        self.assertEqual(r["fails"], 1.0)


if __name__ == "__main__":
    unittest.main()
