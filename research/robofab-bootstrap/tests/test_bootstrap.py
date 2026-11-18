import unittest
from robofab_bootstrap.model import Model, search, gripper, min_jaw, opening, chain


class T(unittest.TestCase):
    def test_unit_scale_matches_selfparts(self):
        self.assertEqual(search(Model("side", jaw_open=30))["orders"], 384)
        self.assertEqual(search(Model("top", jaw_open=30))["orders"], 120)
        self.assertEqual(min_jaw(1.0), 30.0)

    def test_scaling_is_exact(self):
        self.assertEqual(gripper(2.0)["cover"], [(0, 0, 40, 80, 60, 48)])

    def test_min_jaw_monotone_in_scale(self):
        v = [min_jaw(s) for s in (0.5, 1.0, 1.5)]
        self.assertTrue(all(v[i] <= v[i + 1] for i in range(2)))

    def test_opening_and_cap(self):
        self.assertEqual(opening(1.0), 24.0)
        self.assertEqual(opening(3.0, stroke=50), 50)

    def test_chain_stops_when_seed_too_small(self):
        r = chain(10.0, [1.0, 1.25])
        self.assertEqual(r[0][2], None)

    def test_chain_runs_with_big_seed(self):
        r = chain(135.0, [4.5], generations=3)
        self.assertEqual(len(r), 3)
        self.assertTrue(all(x[2] is not None for x in r))

    def test_chain_policy_max_by_hand(self):
        # min_jaw(s) = 30 s (row 1 of results.txt) and opening(s) = 32 s - 8. Seed 60 mm, scales 1.0/1.5/2.0:
        # 60 fits 2.0 (needs 60) -> opening 56 fits 1.5 (45) -> 40 fits 1.0 (30) -> 24 fits nothing.
        r = chain(60.0, [1.0, 1.5, 2.0], generations=6)
        self.assertEqual(r, [(0, 60.0, 2.0), (1, 56.0, 1.5), (2, 40.0, 1.0), (3, 24.0, None)])

    def test_chain_policy_min_dies_after_one_generation(self):
        r = chain(60.0, [1.0, 1.5, 2.0], generations=6, policy="min")
        self.assertEqual(r, [(0, 60.0, 1.0), (1, 24.0, None)])

    def test_chain_stroke_cap_sets_next_opening(self):
        # Seed 140 builds 4.5 (needs 135). Uncapped, 4.5 offers 136 and reproduces itself; a 125 mm stroke caps it
        # at 125, which only fits 4.0 (needs 120), and 4.0 (offers 120) then reproduces.
        self.assertEqual(chain(140.0, [4.0, 4.5], generations=3),
                         [(0, 140.0, 4.5), (1, 136.0, 4.5), (2, 136.0, 4.5)])
        self.assertEqual(chain(140.0, [4.0, 4.5], stroke=125.0, generations=3),
                         [(0, 140.0, 4.5), (1, 125.0, 4.0), (2, 120.0, 4.0)])

    def test_chain_rejects_unknown_policy(self):
        with self.assertRaises(ValueError):
            chain(60.0, [1.0], policy="biggest")


if __name__ == "__main__":
    unittest.main()
