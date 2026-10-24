import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_allies import block_placement, simulate  # noqa: E402


class Placement(unittest.TestCase):
    def test_count_is_exact_for_every_block_size(self):
        for nr in (1, 7, 24, 40):
            for b in (1, 2, 3, 5, 8, 40, 100):
                self.assertEqual(len(block_placement(200, nr, b)), nr)

    def test_block_one_is_evenly_spread_and_full_block_is_contiguous(self):
        self.assertEqual(block_placement(200, 20, 1), {i * 10 for i in range(20)})
        self.assertEqual(block_placement(200, 20, 20), set(range(20)))

    def test_blocks_are_runs_of_the_asked_length(self):
        s = block_placement(200, 24, 4)
        runs, i = [], 0
        seen = sorted(s)
        while i < len(seen):
            j = i
            while j + 1 < len(seen) and seen[j + 1] == seen[j] + 1:
                j += 1
            runs.append(j - i + 1)
            i = j + 1
        self.assertEqual(runs, [4] * 6)

    def test_no_robots(self):
        self.assertEqual(block_placement(50, 0, 3), set())


class Simulation(unittest.TestCase):
    def test_deterministic(self):
        a = simulate(n=60, rounds=60, seed=3)
        self.assertEqual(a, simulate(n=60, rounds=60, seed=3))

    def test_spread_robots_tip_one_block_does_not(self):
        spread = simulate(rho=0.2, block=1, rounds=400, seed=1)["final_share_l"]
        one = simulate(rho=0.2, block=40, rounds=400, seed=1)["final_share_l"]
        self.assertGreater(spread, 0.9)
        self.assertLess(one, 0.3)

    def test_no_robots_stays_on_the_status_quo(self):
        r = simulate(rho=0.0, rounds=300, seed=2)
        self.assertLess(r["final_share_l"], 0.05)
        self.assertLess(r["human_conflict_rate"], 0.1)


if __name__ == "__main__":
    unittest.main()
