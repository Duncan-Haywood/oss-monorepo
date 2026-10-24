import math
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from verified_dse.bound import halve, inversion  # noqa: E402


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


if __name__ == "__main__":
    unittest.main()
