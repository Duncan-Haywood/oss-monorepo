import itertools
import math
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from eda_rankpayoff import rank as R  # noqa: E402


class T(unittest.TestCase):
    def test_ranks_ties(self):
        self.assertEqual(R.ranks([3, 1, 1, 2]), [4.0, 1.5, 1.5, 3.0])

    def test_spearman_textbook(self):
        # Wikipedia's IQ vs hours-of-TV example: rho = -29/165
        iq = [86, 97, 99, 100, 101, 103, 106, 110, 112, 113]
        tv = [2, 20, 28, 27, 50, 29, 7, 17, 6, 12]
        self.assertAlmostEqual(R.spearman(iq, tv), -29 / 165, places=9)

    def test_kendall_textbook(self):
        # same data: tau = -5/45
        iq = [86, 97, 99, 100, 101, 103, 106, 110, 112, 113]
        tv = [2, 20, 28, 27, 50, 29, 7, 17, 6, 12]
        self.assertAlmostEqual(R.kendall(iq, tv), -5 / 45, places=9)

    def test_perfect_and_reversed(self):
        x = [5, 1, 4, 2]
        self.assertAlmostEqual(R.spearman(x, x), 1)
        self.assertAlmostEqual(R.spearman(x, [-v for v in x]), -1)
        self.assertAlmostEqual(R.kendall(x, [-v for v in x]), -1)

    def test_top_overlap_and_best_rank(self):
        truth = [1, 2, 3, 4]
        screen = [2, 1, 3, 4]
        self.assertEqual(R.top_overlap(screen, truth, 2), 1.0)
        self.assertEqual(R.top_overlap(screen, truth, 1), 0.0)
        self.assertEqual(R.best_rank(screen, truth), 2)

    def test_capture_matches_enumeration(self):
        # 5 designs, pools of 3, k=1: enumerate all 10 pools and compare to a large Monte Carlo
        truth = [1, 2, 3, 4, 5]
        screen = [3, 1, 2, 5, 4]
        pools = list(itertools.combinations(range(5), 3))
        hit = sum(min(p, key=lambda i: (screen[i], i)) == min(p, key=lambda i: truth[i]) for p in pools) / len(pools)
        got, ratio = R.capture(screen, truth, 3, 1, 40000, seed=1)
        self.assertAlmostEqual(got, hit, delta=0.01)
        self.assertGreaterEqual(ratio, 1.0)

    def test_perfect_screen_captures_always(self):
        rng = random.Random(0)
        truth = [rng.random() for _ in range(30)]
        self.assertEqual(R.capture(truth, truth, 10, 1, 500), (1.0, 1.0))


if __name__ == "__main__":
    unittest.main()
