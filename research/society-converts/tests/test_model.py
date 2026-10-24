import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_converts import mean_field_tip_round, simulate, step  # noqa: E402


class MeanField(unittest.TestCase):
    def test_stubborn_share_decays_geometrically(self):
        x, st = 0.0, 0.4
        for _ in range(3):
            x, st = step(x, st, 0.1, 9, 0.02, 0.1)
        self.assertAlmostEqual(st, 0.4 * 0.9 ** 3)

    def test_no_conversion_keeps_share(self):
        _, st = step(0.0, 0.4, 0.1, 9, 0.02, 0.0)
        self.assertEqual(st, 0.4)

    def test_big_robot_share_tips_and_faster_conversion_never_slower(self):
        slow = mean_field_tip_round(0.3, 0.4, 9, 0.02, 0.01)
        fast = mean_field_tip_round(0.3, 0.4, 9, 0.02, 0.2)
        self.assertIsNotNone(slow)
        self.assertLessEqual(fast, slow)

    def test_tiny_robot_share_never_tips(self):
        self.assertIsNone(mean_field_tip_round(0.02, 0.2, 9, 0.02, 0.5, rounds=500))


class Simulation(unittest.TestCase):
    def test_deterministic(self):
        a = simulate(60, 0.2, 0.3, 5, 0.02, 0.05, 60, seed=3)
        self.assertEqual(a, simulate(60, 0.2, 0.3, 5, 0.02, 0.05, 60, seed=3))

    def test_everyone_converts_eventually(self):
        r = simulate(60, 0.2, 0.3, 5, 0.02, 0.5, 40, seed=1)
        self.assertEqual(r["final_stubborn"], 0.0)

    def test_c_zero_keeps_block(self):
        r = simulate(60, 0.2, 0.3, 5, 0.02, 0.0, 20, seed=1)
        self.assertAlmostEqual(r["final_stubborn"], 0.3, places=1)

    def test_large_share_tips(self):
        r = simulate(100, 0.5, 0.2, 5, 0.02, 0.02, 200, seed=1)
        self.assertIsNotNone(r["tip_round"])


if __name__ == "__main__":
    unittest.main()
