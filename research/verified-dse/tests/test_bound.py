import math
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from verified_dse.bound import halve, inversion, pair_value, pair_values, pairs_needed, pilot_quantile, pilot_top_inversion  # noqa: E402


def brute(s, y):
    return max([0.0] + [math.log(y[i]) - math.log(y[j]) for i in range(len(s)) for j in range(len(s)) if s[i] <= s[j]])


class T(unittest.TestCase):
    def test_perfect_and_reversed(self):
        self.assertEqual(inversion([1, 2, 3], [1, 2, 3]), 0.0)
        self.assertAlmostEqual(inversion([1, 2, 3], [3, 2, 1]), math.log(3))

    def test_ties_count_both_ways(self):
        self.assertAlmostEqual(inversion([1, 1], [1, 4]), math.log(4))

    def test_matches_brute_force(self):
        rng = random.Random(1)
        for _ in range(300):
            n = rng.randint(2, 12)
            s = [rng.randint(0, 5) for _ in range(n)]
            y = [rng.uniform(1, 20) for _ in range(n)]
            self.assertAlmostEqual(inversion(s, y), brute(s, y))

    def test_halving_regret_never_exceeds_sum_of_inversions(self):
        rng = random.Random(2)
        for _ in range(500):
            n = rng.randint(4, 40)
            y = [rng.uniform(1, 10) for _ in range(n)]
            rungs = [[v * math.exp(rng.gauss(0, sg)) if sg else rng.random() for v in y] for sg in (0.0, 0.3, 1.0)]
            keep = [max(1, n // 3), max(1, n // 9), 1][: rng.randint(1, 3)]
            cut = rungs[: len(keep)]
            got = halve(cut, y, keep, rng)
            lhs = math.log(got) - math.log(min(y))
            self.assertLessEqual(lhs, sum(inversion(s, y) for s in cut) + 1e-9)

    def test_max_pair_value_is_inversion(self):
        rng = random.Random(3)
        for _ in range(200):
            n = rng.randint(2, 30)
            y = [rng.uniform(1, 10) for _ in range(n)]
            s = [rng.choice([1, 2, 3, 4]) for _ in range(n)]
            self.assertAlmostEqual(max(pair_values(s, y)), inversion(s, y))

    def test_pairs_needed(self):
        self.assertEqual(pairs_needed(0.2, 0.2), 8)
        self.assertEqual(pairs_needed(0.1, 0.1), 22)

    def test_pilot_quantile_uses_disjoint_pairs(self):
        s, y = [1, 2, 3, 4], [4.0, 3.0, 2.0, 1.0]
        self.assertAlmostEqual(pilot_quantile(s, y, [0, 1, 2, 3]), math.log(2))
        self.assertEqual(pair_value(1, 2, 1.0, 2.0), 0.0)

    def test_top_inversion(self):
        # rung ranks index 0 (y=8) ahead of the best point index 1 (y=2): inversion log 4; the pilot's best is index 1
        self.assertAlmostEqual(pilot_top_inversion([1, 2, 3], [8, 2, 4], [0, 1, 2], top=1), math.log(4))
        # a perfect rung has none
        self.assertEqual(pilot_top_inversion([1, 2, 3], [1, 2, 3], [0, 1, 2], top=2), 0.0)
        # never exceeds the full-pool inversion
        rng = random.Random(3)
        for _ in range(200):
            n = rng.randint(4, 12)
            s = [rng.randint(0, 5) for _ in range(n)]
            y = [rng.uniform(1, 20) for _ in range(n)]
            idx = rng.sample(range(n), rng.randint(2, n))
            self.assertLessEqual(pilot_top_inversion(s, y, idx, 3), inversion(s, y) + 1e-12)


if __name__ == "__main__":
    unittest.main()
