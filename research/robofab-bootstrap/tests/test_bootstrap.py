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


if __name__ == "__main__":
    unittest.main()
