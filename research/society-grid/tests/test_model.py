import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_grid import meanfield_threshold, patch_placement, simulate  # noqa: E402


class Placement(unittest.TestCase):
    def test_count_is_exact_for_every_patch_size(self):
        for nr in (1, 7, 26, 51, 77):
            for b in (1, 2, 3, 4, 9, 16, 25, 51, 100):
                self.assertEqual(len(patch_placement(16, nr, b)), nr, (nr, b))

    def test_patch_one_is_spread_with_no_two_adjacent(self):
        s = patch_placement(16, 25, 1)
        for x, y in s:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if dx or dy:
                        self.assertNotIn(((x + dx) % 16, (y + dy) % 16), s)

    def test_square_patch_is_a_square(self):
        s = patch_placement(16, 9, 9)
        xs, ys = sorted({x for x, _ in s}), sorted({y for _, y in s})
        self.assertEqual((len(xs), len(ys), len(s)), (3, 3, 9))

    def test_no_robots(self):
        self.assertEqual(patch_placement(16, 0, 4), set())


class MeanField(unittest.TestCase):
    def test_matches_published_well_mixed_threshold(self):
        # society-blocs / society-stubborn report 0.2165 for M = 9, eps = 0.02
        self.assertAlmostEqual(meanfield_threshold(9, 0.02), 0.2165, delta=0.002)


class Simulation(unittest.TestCase):
    def test_deterministic(self):
        self.assertEqual(simulate(w=10, rounds=30, k=1, seed=3), simulate(w=10, rounds=30, k=1, seed=3))

    def test_no_robots_no_tip(self):
        self.assertLess(simulate(w=12, rho=0.0, k=2, rounds=150, seed=1)["final_share_l"], 0.1)

    def test_many_spread_robots_tip(self):
        self.assertGreater(simulate(w=12, rho=0.4, block=1, k=2, rounds=250, seed=1)["final_share_l"], 0.9)

    def test_one_big_patch_does_not_tip_small_neighbourhood(self):
        self.assertLess(simulate(w=16, rho=0.2, block=51, k=1, rounds=300, seed=1)["final_share_l"], 0.5)


if __name__ == "__main__":
    unittest.main()
